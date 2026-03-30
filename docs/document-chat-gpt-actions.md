# Loop Document Chat + Custom GPT Actions

Heimdall can host **corpora** of uploaded documents (Supabase Storage + pgvector) and expose a small HTTP API for [GPT Actions](https://developers.openai.com/api/docs/actions/introduction) so users chat with those files inside a Custom GPT.

## Prerequisites

1. Run migrations **`029_document_chat.sql`** and **`030_document_chat_kg.sql`** on your Supabase project (`supabase db push` or CI).  
   - **030** adds `parsed_markdown` on documents, `document_chat_entities` / `document_chat_relations`, trigram index on entity names, RPCs `search_document_chat_graph` and `document_chat_prune_orphan_entities`.
2. Env vars:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `VOYAGE_API_KEY` (1024-d embeddings, same family as evidence RAG)
   - `HEIMDALL_GPT_ACTIONS_SECRET` — long random string; Custom GPT sends it on each tool call
   - `ANTHROPIC_API_KEY` — required for `/api/gpt-actions/answer` and for **knowledge-graph extraction** during document ingest (search still works without it; KG will be empty)
   - **`LLAMA_CLOUD_API_KEY`** (optional) — when set, PDF / DOCX / PPTX / XLSX are parsed via **LlamaParse** to structured Markdown; if unset, local parsers are used
   - **`LLAMA_PARSE_TIER`** (optional, default `cost_effective`) — LlamaParse parsing tier
   - **`LLAMA_PARSE_VERSION`** (optional, default `latest`) — parser version string for the API

## Foundation checklist (verify before first ingest)

1. **Migrations applied** on the linked Supabase project: `029_document_chat.sql`, `030_document_chat_kg.sql` (run `supabase db push --linked` or apply via CI).
2. **Storage bucket** `document-chat` exists (created by migration 029); no public read policies required for GPT Actions (retrieval uses service role on the server).
3. **Vercel / hosting env** includes at minimum: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VOYAGE_API_KEY`, `HEIMDALL_GPT_ACTIONS_SECRET`.
4. **Privileged login** works for `/document-chat` (Supabase user email domain in `HEIMDALL_ALLOWED_EMAIL_DOMAINS`).
5. **Smoke test**: `GET https://<deployment>/api/gpt-actions/openapi` returns JSON; `POST /api/gpt-actions/search` with the secret returns JSON (may be empty until documents are ingested).

## Operator UI

- **Heimdall → Loop Document Chat** (`/document-chat`): privileged-domain users create a **collection** (slug + name), upload files (txt, md, csv, json, pdf, docx, pptx/ppt, xlsx/xls), and see processing status.
- **Collection stats** (after 030): document, chunk, entity, and relation counts.
- **Per document**: expand row for Markdown preview (when stored), KG counts for that file, **re-process** (re-parse + re-embed + KG), **delete** (chunks, relations, storage; orphan entities pruned).
- Originals land in the private bucket **`document-chat`**.

### Bulk ingest from a local folder (SharePoint export)

For many files at once (e.g. `.docx` briefings saved from SharePoint), use the same ingest pipeline as the UI:

```bash
npm run ingest:document-chat -- --dir "C:/path/to/briefings-folder" --slug loop-briefings --name "Loop context briefings"
```

Requires `SUPABASE_*`, `VOYAGE_API_KEY` in `.env` / `.env.local`. Creates the collection if the slug does not exist. Unsupported extensions in the folder are skipped.

### Ingest pipeline (summary)

1. **Extract**: plain text locally for txt/csv/json; **LlamaParse → Markdown** for office/PDF when configured; else local extractors.
2. **Chunk**: Markdown-aware splits (headings / `---`) when using Markdown, then character fallback.
3. **Embed**: Voyage → `document_chat_chunks`.
4. **KG** (if `ANTHROPIC_API_KEY`): Claude extracts entities/relations per chunk; upserted into `document_chat_entities` / `document_chat_relations` with chunk id as evidence.

## GPT Actions endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/gpt-actions/openapi` | None (schema only) |
| POST | `/api/gpt-actions/search` | `X-Heimdall-Gpt-Actions-Secret: <secret>` or `Authorization: Bearer <secret>` |
| POST | `/api/gpt-actions/answer` | Same |

Import the OpenAPI document in the GPT builder:

`https://<your-deployment>/api/gpt-actions/openapi`

Then configure **API key** authentication to send header `X-Heimdall-Gpt-Actions-Secret` with the same value as `HEIMDALL_GPT_ACTIONS_SECRET`.

### Example: search

```http
POST /api/gpt-actions/search
Content-Type: application/json
X-Heimdall-Gpt-Actions-Secret: <secret>

{
  "query": "What is the return policy?",
  "collection_slug": "loop-policies",
  "match_count": 10,
  "include_graph": true
}
```

When **`include_graph`** is `true`, the response includes a **`graph`** array: 1-hop neighborhood around entities whose names match the query (via `search_document_chat_graph` RPC). Omit or set `false` for vector-only results.

Set **`include_metrics`: `true`** in the JSON body to receive a **`metrics`** object (milliseconds): `embed_query_ms`, `match_chunks_rpc_ms`, optional `search_graph_rpc_ms`, and `wall_total_ms` (end-to-end server time for the handler).

### Example: answer

Uses retrieval + Claude; returns `answer` and `citations`. Optional **`include_metrics`** adds `embed_query_ms`, `match_chunks_rpc_ms`, **`anthropic_ms`**, and `wall_total_ms`.

## Custom GPT instructions (search-first, lower latency)

Configure Actions with the OpenAPI URL above and **API key** = `HEIMDALL_GPT_ACTIONS_SECRET`.

**Default behavior (fast path)**

1. For almost every user question, call **`searchDocuments`** first with the user’s question as `query` and your corpus **`collection_slug`** (e.g. `loop-briefings`).
2. Answer **in ChatGPT** using only the returned `results[].excerpt` text. Cite **filenames** (and chunk indices if helpful). Do not invent content not present in excerpts.
3. If excerpts are insufficient, run **`searchDocuments`** again with a **rephrased** query or narrower terms before giving up.
4. Omit **`include_graph`** unless the user explicitly needs relationship-style context (graph adds a second DB round-trip).

**When to use `answerFromDocuments`**

- Only when synthesis is clearly needed **and** you already have good chunks from search, or the user explicitly asks for the server-synthesized answer. This tool calls **Anthropic on the server** in addition to ChatGPT, so it is **slower** and should not be the default.

**Model choice in ChatGPT**

- Prefer a **non–extended-thinking** model for this GPT if end-to-end latency matters; “thinking” time is independent of SharePoint/Heimdall and shows up as user-visible delay.

## Latency benchmark (compare paths)

Use the same `query` and `collection_slug` for each call. Measure with `curl -w "\n%{time_total}s\n"` or your HTTP client.

1. **Heimdall search only** (retrieval + Voyage embed + pgvector; fastest backend path):

```bash
curl -sS -X POST "https://<deployment>/api/gpt-actions/search" \
  -H "Content-Type: application/json" \
  -H "X-Heimdall-Gpt-Actions-Secret: <secret>" \
  -d '{"query":"your question","collection_slug":"loop-briefings","include_metrics":true}'
```

2. **Heimdall search + graph** (adds `search_graph_rpc_ms` in metrics when `include_graph` is true):

```bash
curl -sS -X POST "https://<deployment>/api/gpt-actions/search" \
  -H "Content-Type: application/json" \
  -H "X-Heimdall-Gpt-Actions-Secret: <secret>" \
  -d '{"query":"your question","collection_slug":"loop-briefings","include_graph":true,"include_metrics":true}'
```

3. **Heimdall answer** (retrieval + **server** Claude; compare `anthropic_ms` vs search-only):

```bash
curl -sS -X POST "https://<deployment>/api/gpt-actions/answer" \
  -H "Content-Type: application/json" \
  -H "X-Heimdall-Gpt-Actions-Secret: <secret>" \
  -d '{"query":"your question","collection_slug":"loop-briefings","include_metrics":true}'
```

4. **SharePoint-based Custom GPT** (existing): use the same prompts and observe total time in the ChatGPT UI; slowness there is often **Graph search + file materialization** (see OpenAI’s SharePoint Actions cookbook), not Heimdall.

## Validation checklist

1. Create collection `test-docs` and upload a short `.txt` file with distinctive content.
2. Wait until the document row shows `ready` and non-zero `chunk_count`.
3. Call `search` with a phrase from the file; expect `results` with matching `excerpt`.
4. If `ANTHROPIC_API_KEY` is set, call `answer` with the same question; expect citations.

## Supabase signup posture

Local `supabase/config.toml` may still have `enable_signup = true`. For production, confirm whether open signup is intentional; if not, disable it in the hosted Supabase project settings and align `config.toml` for local dev.

## Security notes

- GPT Actions secret is **shared** for the deployment; phase 1 is a **team corpus**, not per-user SharePoint ACLs.
- Rate limits on search/answer are in-memory per instance (see `lib/rate-limit.ts`); consider Redis/KV for multi-instance if needed.

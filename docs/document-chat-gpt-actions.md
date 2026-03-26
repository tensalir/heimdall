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

## Operator UI

- **Heimdall → Loop Document Chat** (`/document-chat`): privileged-domain users create a **collection** (slug + name), upload files (txt, md, csv, json, pdf, docx, pptx/ppt, xlsx/xls), and see processing status.
- **Collection stats** (after 030): document, chunk, entity, and relation counts.
- **Per document**: expand row for Markdown preview (when stored), KG counts for that file, **re-process** (re-parse + re-embed + KG), **delete** (chunks, relations, storage; orphan entities pruned).
- Originals land in the private bucket **`document-chat`**.

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

### Example: answer

Uses retrieval + Claude; returns `answer` and `citations`.

## Custom GPT instructions (starter)

- Only answer from tool results; if search returns no relevant chunks, say the corpus does not contain the answer.
- Always cite filenames / `[#n]` references when stating facts from context.
- Prefer `searchDocuments` for exploration; use `answerFromDocuments` when the user wants a synthesized reply.

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

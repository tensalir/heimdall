/**
 * OpenAPI 3.0 schema for Custom GPT Actions (import URL: GET /api/gpt-actions/openapi).
 * Operations require header `X-Heimdall-Gpt-Actions-Secret` (configure in GPT Action auth).
 */
export function buildDocumentChatOpenApiJson(baseUrl: string): Record<string, unknown> {
  const origin = baseUrl.replace(/\/$/, '')
  return {
    openapi: '3.0.3',
    info: {
      title: 'Heimdall Loop Document Chat',
      description:
        'Search and answer over Loop document corpora ingested via Heimdall Document Chat. Requires HEIMDALL_GPT_ACTIONS_SECRET as API key. For lowest latency in Custom GPT, prefer **searchDocuments** and answer in the ChatGPT model from returned excerpts; **answerFromDocuments** adds a second LLM hop (Anthropic) on the server. Optional **include_metrics** (boolean) on requests returns server timing breakdown for benchmarks.',
      version: '1.0.0',
    },
    servers: [{ url: origin }],
    paths: {
      '/api/gpt-actions/search': {
        post: {
          operationId: 'searchDocuments',
          summary: 'Semantic search over uploaded documents (preferred for speed)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['query'],
                  properties: {
                    query: { type: 'string', description: 'Natural language query' },
                    collection_slug: {
                      type: 'string',
                      description: 'Limit search to one corpus slug (e.g. loop-policies)',
                    },
                    collection_id: { type: 'string', format: 'uuid' },
                    match_count: { type: 'integer', minimum: 1, maximum: 25, default: 12 },
                    similarity_threshold: { type: 'number', minimum: 0, maximum: 1, default: 0.22 },
                    include_graph: {
                      type: 'boolean',
                      description: 'If true, include 1-hop knowledge-graph neighbors matching the query',
                    },
                    include_metrics: {
                      type: 'boolean',
                      description:
                        'If true, response includes metrics (embed_query_ms, match_chunks_rpc_ms, search_graph_rpc_ms when include_graph, wall_total_ms)',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Matching chunks with metadata',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            '400': { description: 'Invalid body' },
            '403': { description: 'Auth failed' },
            '429': { description: 'Rate limited' },
          },
          security: [{ GptActionsApiKey: [] }],
        },
      },
      '/api/gpt-actions/answer': {
        post: {
          operationId: 'answerFromDocuments',
          summary: 'Retrieve chunks then synthesize via server-side Claude (slower; use for benchmarks or when ChatGPT synthesis is insufficient)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['query'],
                  properties: {
                    query: { type: 'string' },
                    collection_slug: { type: 'string' },
                    collection_id: { type: 'string', format: 'uuid' },
                    match_count: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
                    include_metrics: {
                      type: 'boolean',
                      description:
                        'If true, response includes metrics (embed_query_ms, match_chunks_rpc_ms, anthropic_ms, wall_total_ms)',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Answer and citations',
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
            '503': { description: 'LLM or retrieval not configured' },
          },
          security: [{ GptActionsApiKey: [] }],
        },
      },
    },
    components: {
      securitySchemes: {
        GptActionsApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Heimdall-Gpt-Actions-Secret',
        },
      },
    },
    security: [{ GptActionsApiKey: [] }],
  }
}

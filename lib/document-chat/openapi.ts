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
        'Search and answer over Loop document corpora ingested via Heimdall Document Chat. Requires HEIMDALL_GPT_ACTIONS_SECRET as API key.',
      version: '1.0.0',
    },
    servers: [{ url: origin }],
    paths: {
      '/api/gpt-actions/search': {
        post: {
          operationId: 'searchDocuments',
          summary: 'Semantic search over uploaded documents',
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
          summary: 'Retrieve relevant chunks then synthesize an answer (Claude)',
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

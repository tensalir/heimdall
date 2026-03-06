/**
 * Vesper generation gateway client.
 * Calls Vesper's /api/generate endpoint for Nano Banana image generation,
 * or falls back to direct Gemini API when Vesper is unavailable.
 *
 * Env:
 *   VESPER_API_URL      — Base URL of the Vesper instance (e.g. https://vesper.loop.com)
 *   VESPER_API_SECRET   — Optional internal API secret for server-to-server auth
 *   GEMINI_API_KEY      — Fallback: direct Gemini API for Nano Banana generation
 */

export interface VesperGenerateRequest {
  prompt: string
  modelId?: string
  referenceImageUrl?: string
  aspectRatio?: string
  resolution?: string
}

export interface VesperGenerateResult {
  id: string
  imageUrl: string | null
  status: 'completed' | 'failed' | 'processing'
  error?: string
}

function getVesperUrl(): string | null {
  return process.env.VESPER_API_URL?.replace(/\/$/, '') ?? null
}

function getVesperSecret(): string | null {
  return process.env.VESPER_API_SECRET ?? null
}

function getGeminiKey(): string | null {
  return process.env.GEMINI_API_KEY ?? null
}

export function isVesperAvailable(): boolean {
  return !!getVesperUrl() || !!getGeminiKey()
}

/**
 * Generate an image via Vesper or direct Gemini API fallback.
 * Returns the generation result with an image URL on success.
 */
export async function generateImage(
  request: VesperGenerateRequest,
): Promise<VesperGenerateResult> {
  const vesperUrl = getVesperUrl()

  if (vesperUrl) {
    return generateViaVesper(vesperUrl, request)
  }

  const geminiKey = getGeminiKey()
  if (geminiKey) {
    return generateViaGeminiDirect(geminiKey, request)
  }

  return {
    id: `err-${Date.now()}`,
    imageUrl: null,
    status: 'failed',
    error: 'Neither VESPER_API_URL nor GEMINI_API_KEY configured',
  }
}

async function generateViaVesper(
  baseUrl: string,
  request: VesperGenerateRequest,
): Promise<VesperGenerateResult> {
  const secret = getVesperSecret()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (secret) headers['x-internal-secret'] = secret

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sessionId: 'briefing-assistant',
        modelId: request.modelId ?? 'gemini-nano-banana-2',
        prompt: request.prompt,
        parameters: {
          aspectRatio: request.aspectRatio ?? '1:1',
          resolution: Number(request.resolution ?? '1024'),
          ...(request.referenceImageUrl
            ? { referenceImageUrl: request.referenceImageUrl }
            : {}),
        },
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return {
        id: data.id ?? `err-${Date.now()}`,
        imageUrl: null,
        status: 'failed',
        error: data.error ?? `Vesper API ${res.status}`,
      }
    }

    if (data.status === 'processing') {
      return {
        id: data.id,
        imageUrl: null,
        status: 'processing',
      }
    }

    return {
      id: data.id ?? `gen-${Date.now()}`,
      imageUrl: data.imageUrl ?? data.outputs?.[0]?.fileUrl ?? null,
      status: data.imageUrl || data.outputs?.[0]?.fileUrl ? 'completed' : 'processing',
    }
  } catch (e) {
    return {
      id: `err-${Date.now()}`,
      imageUrl: null,
      status: 'failed',
      error: e instanceof Error ? e.message : 'Vesper request failed',
    }
  }
}

async function generateViaGeminiDirect(
  apiKey: string,
  request: VesperGenerateRequest,
): Promise<VesperGenerateResult> {
  const modelId = request.modelId === 'gemini-nano-banana-pro'
    ? 'gemini-3-pro-image-preview'
    : 'gemini-3.1-flash-image-preview'

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`

  const parts: Array<Record<string, unknown>> = [{ text: request.prompt }]

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: request.aspectRatio ?? '1:1',
        ...(request.resolution ? { imageSize: request.resolution } : {}),
      },
    },
  }

  try {
    const res = await fetch(`${endpoint}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text()
      return {
        id: `err-${Date.now()}`,
        imageUrl: null,
        status: 'failed',
        error: `Gemini API ${res.status}: ${text.slice(0, 200)}`,
      }
    }

    const data = await res.json()
    const candidate = data.candidates?.[0]
    const imagePart = candidate?.content?.parts?.find(
      (p: { inlineData?: { data?: string; mimeType?: string } }) => p.inlineData?.data,
    )

    if (imagePart?.inlineData?.data) {
      const base64 = imagePart.inlineData.data
      const mimeType = imagePart.inlineData.mimeType ?? 'image/png'
      const dataUrl = `data:${mimeType};base64,${base64}`

      return {
        id: `gemini-${Date.now()}`,
        imageUrl: dataUrl,
        status: 'completed',
      }
    }

    return {
      id: `gemini-${Date.now()}`,
      imageUrl: null,
      status: 'failed',
      error: 'No image data in Gemini response',
    }
  } catch (e) {
    return {
      id: `err-${Date.now()}`,
      imageUrl: null,
      status: 'failed',
      error: e instanceof Error ? e.message : 'Gemini request failed',
    }
  }
}

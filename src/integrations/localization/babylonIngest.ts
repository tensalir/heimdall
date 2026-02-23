import { createHmac } from 'node:crypto'
import { getEnv } from '../../config/env.js'
import { type IngestionAck, validateIngestionAck, validateWordCountRun } from '../../contracts/localizationContracts.js'

function getTimestampMs(): string {
  return String(Date.now())
}

function signPayload(rawBody: string, timestamp: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')
}

export async function sendWordCountRunToBabylon(payload: unknown): Promise<IngestionAck> {
  const env = getEnv()
  const ingestUrl = env.LOCALIZATION_BABYLON_INGEST_URL
  const sharedSecret = env.LOCALIZATION_BABYLON_SHARED_SECRET

  if (!ingestUrl || !sharedSecret) {
    throw new Error('Babylon ingest bridge is not configured')
  }

  const validated = validateWordCountRun(payload)
  const rawBody = JSON.stringify(validated)
  const timestamp = getTimestampMs()
  const signature = signPayload(rawBody, timestamp, sharedSecret)

  const response = await fetch(ingestUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-localization-timestamp': timestamp,
      'x-localization-signature': signature,
      ...(env.LOCALIZATION_BABYLON_KEY_ID ? { 'x-localization-key-id': env.LOCALIZATION_BABYLON_KEY_ID } : {}),
    },
    body: rawBody,
  })

  const body = await response.json()
  const ack = validateIngestionAck(body)
  if (!response.ok || ack.status === 'failed') {
    throw new Error(ack.errorMessage || `Babylon ingest failed with status ${response.status}`)
  }
  return ack
}

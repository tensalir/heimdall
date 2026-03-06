import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'
import { buildMetaAdSnapshotUrl } from './client.js'

const PREVIEW_CACHE_TTL_MS = 1000 * 60 * 60 * 6

const previewCache = new Map<
  string,
  { buffer: Buffer; mimeType: string; expiresAt: number }
>()

function getLocalBrowserExecutablePath(): string | null {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function getBrowserExecutablePath(): Promise<string> {
  if (process.env.VERCEL || process.env.AWS_REGION) {
    return chromium.executablePath()
  }

  const localPath = getLocalBrowserExecutablePath()
  if (localPath) return localPath

  const serverlessPath = await chromium.executablePath()
  if (serverlessPath) return serverlessPath

  throw new Error('No browser executable found for Meta preview generation')
}

export async function getMetaAdPreviewPng(
  libraryId: string,
  cacheKey = libraryId,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const cached = previewCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { buffer: cached.buffer, mimeType: cached.mimeType }
  }

  const executablePath = await getBrowserExecutablePath()
  const browser = await puppeteer.launch({
    executablePath,
    args: chromium.args,
    headless: true,
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 })
    await page.goto(buildMetaAdSnapshotUrl(libraryId), {
      waitUntil: 'networkidle2',
      timeout: 45000,
    })

    // Give Meta's client-rendered snapshot a moment to settle.
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const buffer = (await page.screenshot({
      type: 'png',
      fullPage: false,
    })) as Buffer

    previewCache.set(cacheKey, {
      buffer,
      mimeType: 'image/png',
      expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS,
    })

    return { buffer, mimeType: 'image/png' }
  } finally {
    await browser.close()
  }
}

export function buildMetaPreviewPlaceholderSvg(label: string): Buffer {
  const safeLabel = label.replace(/[<>&'"]/g, '')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
      <rect width="900" height="1200" fill="#f4efe8"/>
      <rect x="32" y="32" width="836" height="1136" rx="24" fill="#ffffff" stroke="#ddd2c0" stroke-width="2"/>
      <rect x="72" y="96" width="756" height="640" rx="18" fill="#ebe3d6"/>
      <circle cx="450" cy="416" r="54" fill="#d7c9b5"/>
      <path d="M430 388 L484 416 L430 444 Z" fill="#8b7a63"/>
      <text x="72" y="810" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#1f1a17">${safeLabel}</text>
      <text x="72" y="860" font-family="Arial, sans-serif" font-size="22" fill="#6f665d">Meta snapshot preview unavailable</text>
      <text x="72" y="900" font-family="Arial, sans-serif" font-size="22" fill="#6f665d">Open the ad detail to inspect copy and metadata.</text>
    </svg>
  `.trim()
  return Buffer.from(svg)
}

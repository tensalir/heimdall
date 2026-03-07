import chromium from '@sparticuz/chromium'
import puppeteer, { type Browser } from 'puppeteer-core'
import { existsSync } from 'node:fs'

const PREVIEW_CACHE_TTL_MS = 1000 * 60 * 60 * 6
const MAX_CACHE_ENTRIES = 200
const MAX_CACHE_BYTES = 200 * 1024 * 1024
const BROWSER_POOL_CONCURRENCY = 3

interface CacheEntry {
  buffer: Buffer
  mimeType: string
  expiresAt: number
  byteSize: number
}

const previewCache = new Map<string, CacheEntry>()
let totalCacheBytes = 0

function evictOldest() {
  while (
    (previewCache.size > MAX_CACHE_ENTRIES || totalCacheBytes > MAX_CACHE_BYTES) &&
    previewCache.size > 0
  ) {
    const oldestKey = previewCache.keys().next().value as string
    const entry = previewCache.get(oldestKey)
    if (entry) totalCacheBytes -= entry.byteSize
    previewCache.delete(oldestKey)
  }
}

function cacheSet(key: string, buffer: Buffer, mimeType: string) {
  const existing = previewCache.get(key)
  if (existing) totalCacheBytes -= existing.byteSize
  const entry: CacheEntry = {
    buffer,
    mimeType,
    expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS,
    byteSize: buffer.byteLength,
  }
  previewCache.delete(key)
  previewCache.set(key, entry)
  totalCacheBytes += entry.byteSize
  evictOldest()
}

function cacheGet(key: string): { buffer: Buffer; mimeType: string } | null {
  const entry = previewCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    totalCacheBytes -= entry.byteSize
    previewCache.delete(key)
    return null
  }
  previewCache.delete(key)
  previewCache.set(key, entry)
  return { buffer: entry.buffer, mimeType: entry.mimeType }
}

const inflightRequests = new Map<string, Promise<{ buffer: Buffer; mimeType: string }>>()

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

let _browser: Browser | null = null
let _browserLaunchPromise: Promise<Browser> | null = null
let _activeTabs = 0

async function getSharedBrowser(): Promise<Browser> {
  if (_browser?.connected) return _browser
  if (_browserLaunchPromise) return _browserLaunchPromise

  _browserLaunchPromise = (async () => {
    const executablePath = await getBrowserExecutablePath()
    const browser = await puppeteer.launch({
      executablePath,
      args: chromium.args,
      headless: true,
    })
    browser.on('disconnected', () => {
      _browser = null
      _browserLaunchPromise = null
      _activeTabs = 0
    })
    _browser = browser
    _browserLaunchPromise = null
    return browser
  })()

  return _browserLaunchPromise
}

async function waitForPoolSlot(): Promise<void> {
  while (_activeTabs >= BROWSER_POOL_CONCURRENCY) {
    await new Promise((r) => setTimeout(r, 200))
  }
}

/**
 * Try to extract media URLs from the snapshot page HTML without launching a full browser.
 * Returns an image buffer if successful, null if extraction fails.
 */
export async function tryLightweightExtract(
  snapshotUrl: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(snapshotUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Heimdall/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const html = await res.text()

    const imgMatches = html.match(/https:\/\/scontent[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi)
    if (!imgMatches?.length) return null

    const bestUrl = imgMatches.reduce((best, url) =>
      url.length > best.length ? url : best,
    )

    const imgRes = await fetch(bestUrl, {
      signal: AbortSignal.timeout(10000),
    })
    if (!imgRes.ok) return null
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
    const buffer = Buffer.from(await imgRes.arrayBuffer())
    if (buffer.byteLength < 1000) return null

    return { buffer, mimeType: contentType.split(';')[0].trim() }
  } catch {
    return null
  }
}

export async function getMetaAdPreviewPng(
  libraryId: string,
  cacheKey = libraryId,
  snapshotUrl?: string | null,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const existing = inflightRequests.get(cacheKey)
  if (existing) return existing

  const promise = (async (): Promise<{ buffer: Buffer; mimeType: string }> => {
    if (snapshotUrl) {
      const extracted = await tryLightweightExtract(snapshotUrl)
      if (extracted) {
        cacheSet(cacheKey, extracted.buffer, extracted.mimeType)
        return extracted
      }
    }

    await waitForPoolSlot()
    _activeTabs++
    const browser = await getSharedBrowser()

    try {
      const page = await browser.newPage()
      try {
        await page.setViewport({ width: 600, height: 900, deviceScaleFactor: 1 })

        const targetUrl = snapshotUrl || buildFallbackRenderUrl(libraryId)
        await page.goto(targetUrl, {
          waitUntil: 'networkidle2',
          timeout: 45000,
        })

        await new Promise((resolve) => setTimeout(resolve, 2000))

        const buttons = await page.$$('div[role="button"], button, a[role="button"]')
        for (const btn of buttons) {
          const text = await btn.evaluate((el) => (el.textContent || '').trim())
          if (/decline optional cookies/i.test(text)) {
            await btn.click()
            await new Promise((resolve) => setTimeout(resolve, 1500))
            break
          }
        }

        await page.evaluate(() => {
          document.querySelectorAll(
            'div._10.uiLayer, div._3ixn, div._59s7, [role="dialog"]',
          ).forEach((el) => el.remove())

          document.querySelectorAll('div').forEach((el) => {
            const style = window.getComputedStyle(el)
            const rect = el.getBoundingClientRect()
            if (
              (style.position === 'fixed' || style.position === 'absolute') &&
              rect.width > window.innerWidth * 0.8 &&
              rect.height > window.innerHeight * 0.8 &&
              parseInt(style.zIndex || '0', 10) > 5
            ) {
              el.remove()
            }
          })
        })

        await new Promise((resolve) => setTimeout(resolve, 300))

        const clip = await page.evaluate(() => {
          const card = document.querySelector('div._8n-d')
          if (card instanceof HTMLElement) {
            const rect = card.getBoundingClientRect()
            if (rect.width > 100 && rect.height > 100) {
              return {
                x: Math.max(0, rect.x),
                y: Math.max(0, rect.y),
                width: Math.min(window.innerWidth, rect.width),
                height: Math.min(window.innerHeight, rect.height),
              }
            }
          }

          const mediaNodes = Array.from(
            document.querySelectorAll('img, video, canvas'),
          ).filter((el) => {
            const rect = el.getBoundingClientRect()
            const style = window.getComputedStyle(el)
            return (
              rect.width > 150 &&
              rect.height > 150 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              parseFloat(style.opacity || '1') > 0
            )
          })

          if (mediaNodes.length > 0) {
            const best = mediaNodes
              .map((el) => ({ el, rect: el.getBoundingClientRect() }))
              .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)[0]

            return {
              x: Math.max(0, best.rect.x - 8),
              y: Math.max(0, best.rect.y - 8),
              width: Math.min(window.innerWidth, best.rect.width + 16),
              height: Math.min(window.innerHeight, best.rect.height + 16),
            }
          }

          return null
        })

        const buffer = (await page.screenshot({
          type: 'png',
          ...(clip ? { clip } : { fullPage: false }),
        })) as Buffer

        cacheSet(cacheKey, buffer, 'image/png')
        return { buffer, mimeType: 'image/png' }
      } finally {
        await page.close()
      }
    } finally {
      _activeTabs--
    }
  })()

  inflightRequests.set(cacheKey, promise)
  try {
    return await promise
  } finally {
    inflightRequests.delete(cacheKey)
  }
}

function buildFallbackRenderUrl(libraryId: string): string {
  const token = process.env.META_AD_LIBRARY_ACCESS_TOKEN
  if (!token) {
    return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(libraryId)}`
  }
  return `https://www.facebook.com/ads/archive/render_ad/?id=${encodeURIComponent(libraryId)}&access_token=${encodeURIComponent(token)}`
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

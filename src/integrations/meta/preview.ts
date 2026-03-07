import chromium from '@sparticuz/chromium'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import { existsSync } from 'node:fs'

const PREVIEW_CACHE_TTL_MS = 1000 * 60 * 60 * 6
const MAX_CACHE_ENTRIES = 200
const MAX_CACHE_BYTES = 200 * 1024 * 1024
const BROWSER_POOL_CONCURRENCY = 3

// ---------------------------------------------------------------------------
// Structured extraction result
// ---------------------------------------------------------------------------

export interface ExtractedMedia {
  type: 'image' | 'video'
  /** Direct CDN URL for the image, or poster frame for video */
  thumbnailUrl: string
  /** Direct CDN URL for the video src (null for images) */
  videoUrl: string | null
}

// ---------------------------------------------------------------------------
// In-memory LRU buffer cache (screenshot fallback only)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Browser pool (singleton)
// ---------------------------------------------------------------------------

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

export async function getSharedBrowser(): Promise<Browser> {
  if (_browser?.connected) return _browser
  if (_browserLaunchPromise) return _browserLaunchPromise

  _browserLaunchPromise = (async () => {
    const executablePath = await getBrowserExecutablePath()
    const proxyUrl = process.env.META_ADS_PROXY_URL
    const launchArgs = [...chromium.args]
    if (proxyUrl) {
      launchArgs.push(`--proxy-server=${proxyUrl}`)
    }
    const browser = await puppeteer.launch({
      executablePath,
      args: launchArgs,
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

export async function waitForPoolSlot(): Promise<void> {
  while (_activeTabs >= BROWSER_POOL_CONCURRENCY) {
    await new Promise((r) => setTimeout(r, 200))
  }
}

export function incrementActiveTabs() { _activeTabs++ }
export function decrementActiveTabs() { _activeTabs-- }

// ---------------------------------------------------------------------------
// Core: refresh stale tokens in stored snapshot URLs
// ---------------------------------------------------------------------------

export function refreshSnapshotUrl(storedUrl: string | null, externalId?: string): string | null {
  const token = process.env.META_AD_LIBRARY_ACCESS_TOKEN
  if (!storedUrl) {
    if (!externalId) return null
    if (!token) return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(externalId)}`
    return `https://www.facebook.com/ads/archive/render_ad/?id=${encodeURIComponent(externalId)}&access_token=${encodeURIComponent(token)}`
  }

  if (!token) return storedUrl

  try {
    const url = new URL(storedUrl)
    if (url.searchParams.has('access_token')) {
      url.searchParams.set('access_token', token)
      return url.toString()
    }
    if (url.pathname.includes('/render_ad') || url.pathname.includes('/ads_archive')) {
      url.searchParams.set('access_token', token)
      return url.toString()
    }
  } catch { /* not a valid URL, return as-is */ }

  return storedUrl
}

// ---------------------------------------------------------------------------
// Core: detect login walls on Meta pages
// ---------------------------------------------------------------------------

export async function isLoginWall(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const html = document.documentElement.innerHTML.toLowerCase()
    if (html.includes('log into facebook') || html.includes('log in to facebook')) return true
    if (html.includes('create new account') && html.includes('password')) return true

    const forms = document.querySelectorAll('form[action*="login"]')
    if (forms.length > 0) return true

    const inputs = document.querySelectorAll('input[name="email"], input[name="pass"]')
    if (inputs.length >= 2) return true

    return false
  })
}

// ---------------------------------------------------------------------------
// Core: dismiss cookie overlays on Meta pages
// ---------------------------------------------------------------------------

export async function dismissOverlays(page: Page): Promise<void> {
  const buttons = await page.$$('div[role="button"], button, a[role="button"]')
  for (const btn of buttons) {
    const text = await btn.evaluate((el) => (el.textContent || '').trim())
    if (/decline optional cookies|allow.*cookies|accept/i.test(text)) {
      await btn.click()
      await new Promise((resolve) => setTimeout(resolve, 1200))
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
}

// ---------------------------------------------------------------------------
// Core: extract media URLs from the rendered DOM
// ---------------------------------------------------------------------------

export async function extractMediaFromSnapshot(
  snapshotUrl: string,
): Promise<ExtractedMedia | null> {
  const freshUrl = refreshSnapshotUrl(snapshotUrl)
  if (!freshUrl) return null

  await waitForPoolSlot()
  _activeTabs++
  try {
    const browser = await getSharedBrowser()
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 600, height: 900, deviceScaleFactor: 1 })
      await page.goto(freshUrl, { waitUntil: 'networkidle2', timeout: 45000 })
      await new Promise((r) => setTimeout(r, 2500))
      await dismissOverlays(page)
      await new Promise((r) => setTimeout(r, 500))

      if (await isLoginWall(page)) {
        console.warn('[preview] Login wall detected, skipping extraction')
        return null
      }

      const media = await page.evaluate(() => {
        const isCdnUrl = (src: string) =>
          /scontent|fbcdn|\.fbsbx\.com/i.test(src) && src.startsWith('http')

        const videos = Array.from(document.querySelectorAll('video'))
        for (const video of videos) {
          const poster = video.getAttribute('poster') || ''
          const src =
            video.getAttribute('src') ||
            video.querySelector('source')?.getAttribute('src') ||
            ''
          if (src && isCdnUrl(src)) {
            return {
              type: 'video' as const,
              thumbnailUrl: isCdnUrl(poster) ? poster : '',
              videoUrl: src,
            }
          }
          if (poster && isCdnUrl(poster)) {
            return {
              type: 'video' as const,
              thumbnailUrl: poster,
              videoUrl: src || null,
            }
          }
        }

        const imgs = Array.from(document.querySelectorAll('img'))
          .filter((img) => {
            const rect = img.getBoundingClientRect()
            const src = img.src || ''
            return rect.width > 80 && rect.height > 80 && isCdnUrl(src)
          })
          .sort((a, b) => {
            const aArea = a.naturalWidth * a.naturalHeight || a.getBoundingClientRect().width * a.getBoundingClientRect().height
            const bArea = b.naturalWidth * b.naturalHeight || b.getBoundingClientRect().width * b.getBoundingClientRect().height
            return bArea - aArea
          })

        if (imgs.length > 0) {
          return {
            type: 'image' as const,
            thumbnailUrl: imgs[0].src,
            videoUrl: null,
          }
        }

        return null
      })

      if (media && media.thumbnailUrl) {
        return media as ExtractedMedia
      }

      return null
    } finally {
      await page.close()
    }
  } finally {
    _activeTabs--
  }
}

// ---------------------------------------------------------------------------
// Screenshot fallback for the /preview endpoint
// ---------------------------------------------------------------------------

async function screenshotSnapshot(
  targetUrl: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const freshUrl = refreshSnapshotUrl(targetUrl) || targetUrl
  await waitForPoolSlot()
  _activeTabs++
  const browser = await getSharedBrowser()
  try {
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 600, height: 900, deviceScaleFactor: 1 })
      await page.goto(freshUrl, { waitUntil: 'networkidle2', timeout: 45000 })
      await new Promise((r) => setTimeout(r, 2000))
      await dismissOverlays(page)
      await new Promise((r) => setTimeout(r, 300))

      if (await isLoginWall(page)) {
        console.warn('[preview] Login wall detected in screenshot, returning placeholder')
        return { buffer: buildMetaPreviewPlaceholderSvg('Login required'), mimeType: 'image/svg+xml' }
      }

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

      return { buffer, mimeType: 'image/png' }
    } finally {
      await page.close()
    }
  } finally {
    _activeTabs--
  }
}

// ---------------------------------------------------------------------------
// Public: get preview image buffer (used by /preview route)
// Tries extraction first, falls back to screenshot
// ---------------------------------------------------------------------------

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
    const targetUrl = refreshSnapshotUrl(snapshotUrl ?? null, libraryId) || buildFallbackRenderUrl(libraryId)

    if (targetUrl) {
      const media = await extractMediaFromSnapshot(targetUrl)
      if (media?.thumbnailUrl) {
        try {
          const imgRes = await fetch(media.thumbnailUrl, {
            signal: AbortSignal.timeout(15000),
          })
          if (imgRes.ok) {
            const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg'
            const buffer = Buffer.from(await imgRes.arrayBuffer())
            if (buffer.byteLength > 500) {
              cacheSet(cacheKey, buffer, contentType.split(';')[0].trim())
              return { buffer, mimeType: contentType.split(';')[0].trim() }
            }
          }
        } catch {
          // CDN fetch failed, fall through to screenshot
        }
      }
    }

    const result = await screenshotSnapshot(targetUrl)
    cacheSet(cacheKey, result.buffer, result.mimeType)
    return result
  })()

  inflightRequests.set(cacheKey, promise)
  try {
    return await promise
  } finally {
    inflightRequests.delete(cacheKey)
  }
}

// ---------------------------------------------------------------------------
// Fallback URL construction
// ---------------------------------------------------------------------------

function buildFallbackRenderUrl(libraryId: string): string {
  const token = process.env.META_AD_LIBRARY_ACCESS_TOKEN
  if (!token) {
    return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(libraryId)}`
  }
  return `https://www.facebook.com/ads/archive/render_ad/?id=${encodeURIComponent(libraryId)}&access_token=${encodeURIComponent(token)}`
}

// ---------------------------------------------------------------------------
// Placeholder SVG (used when everything fails)
// ---------------------------------------------------------------------------

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

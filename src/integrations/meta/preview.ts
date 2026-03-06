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

    const clip = await page.evaluate(() => {
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      const isVisible = (el: Element) => {
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          parseFloat(style.opacity || '1') > 0
        )
      }

      const getRect = (el: Element) => {
        const rect = el.getBoundingClientRect()
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          centerX: rect.x + rect.width / 2,
          area: rect.width * rect.height,
        }
      }

      // Remove cookie / consent overlays that otherwise screenshot like popup windows.
      const overlaySelectors = [
        'div._10.uiLayer._4-hy',
        'div._59s7._9l2g',
        '[role="dialog"]',
        '[aria-label*="cookie" i]',
      ]
      for (const selector of overlaySelectors) {
        document.querySelectorAll(selector).forEach((node) => {
          ;(node as HTMLElement).style.display = 'none'
        })
      }
      document.querySelectorAll('div, section, aside').forEach((node) => {
        const text = (node.textContent || '').toLowerCase()
        const rect = getRect(node)
        if (
          text.includes('cookies') &&
          rect.width > viewportWidth * 0.4 &&
          rect.height > viewportHeight * 0.2
        ) {
          ;(node as HTMLElement).style.display = 'none'
        }
      })

      const mediaNodes = Array.from(
        document.querySelectorAll('img, video, canvas'),
      ).filter(isVisible)

      let bestClip: { x: number; y: number; width: number; height: number } | null = null

      for (const media of mediaNodes) {
        const mediaRect = getRect(media)
        if (
          mediaRect.width < 180 ||
          mediaRect.height < 180 ||
          mediaRect.area < 70000
        ) {
          continue
        }

        let parent = media.parentElement
        while (parent && parent !== document.body) {
          const rect = getRect(parent)
          const centered = Math.abs(rect.centerX - viewportWidth / 2) < viewportWidth * 0.2
          const widthFits =
            rect.width >= Math.max(280, mediaRect.width - 8) &&
            rect.width <= Math.min(viewportWidth * 0.7, mediaRect.width + 180)
          const heightFits =
            rect.height >= Math.max(320, mediaRect.height + 80) &&
            rect.height <= Math.min(viewportHeight * 0.95, 1100)

          if (isVisible(parent) && centered && widthFits && heightFits) {
            bestClip = {
              x: Math.max(0, rect.x - 12),
              y: Math.max(0, rect.y - 12),
              width: Math.min(viewportWidth, rect.width + 24),
              height: Math.min(viewportHeight, rect.height + 24),
            }
            break
          }
          parent = parent.parentElement
        }

        if (!bestClip) {
          bestClip = {
            x: Math.max(0, mediaRect.x - 12),
            y: Math.max(0, mediaRect.y - 12),
            width: Math.min(viewportWidth, mediaRect.width + 24),
            height: Math.min(viewportHeight, mediaRect.height + 24),
          }
        }

        if (bestClip) break
      }

      if (!bestClip) {
        const candidates = Array.from(
          document.querySelectorAll('div, section, article, a'),
        ).filter(isVisible)
        const card = candidates
          .map((el) => ({ el, rect: getRect(el) }))
          .filter(
            ({ rect }) =>
              rect.width >= 280 &&
              rect.width <= viewportWidth * 0.7 &&
              rect.height >= 320 &&
              rect.height <= 1100 &&
              Math.abs(rect.centerX - viewportWidth / 2) < viewportWidth * 0.2,
          )
          .sort((a, b) => b.rect.area - a.rect.area)[0]

        if (card) {
          bestClip = {
            x: Math.max(0, card.rect.x - 12),
            y: Math.max(0, card.rect.y - 12),
            width: Math.min(viewportWidth, card.rect.width + 24),
            height: Math.min(viewportHeight, card.rect.height + 24),
          }
        }
      }

      return bestClip
    })

    const buffer = (await page.screenshot({
      type: 'png',
      ...(clip ? { clip } : { fullPage: false }),
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

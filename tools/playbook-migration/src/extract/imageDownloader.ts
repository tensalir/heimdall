import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { extname } from 'node:path'
import type { Client } from '@microsoft/microsoft-graph-client'

import { PATHS, TOOL_ROOT } from '../config.js'
import type { PageContent } from './types.js'

/**
 * Walk a PageContent, download every image (and hero background) referenced by sourceUrl,
 * and rewrite localPath in place to point at the downloaded file (relative to TOOL_ROOT).
 *
 * SharePoint image URLs are usually authenticated. We use Graph's `/sites/.../driveItems`
 * lookup when the URL is a SharePoint site URL, and fall back to a token-authenticated
 * fetch for everything else.
 */
export async function downloadImagesForPage(
  client: Client,
  page: PageContent,
  accessToken: () => Promise<string>,
): Promise<{ downloaded: number; failed: number; failures: string[] }> {
  const dir = resolve(PATHS.assets, page.slug)
  await mkdir(dir, { recursive: true })

  let downloaded = 0
  let failed = 0
  const failures: string[] = []
  let imageCounter = 0

  for (const section of page.sections) {
    for (const { block } of section.blocks) {
      if (block.kind === 'image' && block.sourceUrl) {
        imageCounter += 1
        try {
          const localPath = await downloadOne(block.sourceUrl, dir, `image-${pad(imageCounter)}`, accessToken)
          block.localPath = relative(TOOL_ROOT, localPath).split('\\').join('/')
          downloaded += 1
        } catch (err) {
          failed += 1
          failures.push(`image ${imageCounter}: ${(err as Error).message}`)
        }
      }
      if (block.kind === 'hero' && block.imageSourceUrl) {
        imageCounter += 1
        try {
          const localPath = await downloadOne(
            block.imageSourceUrl,
            dir,
            `hero-${pad(imageCounter)}`,
            accessToken,
          )
          block.imageLocalPath = relative(TOOL_ROOT, localPath).split('\\').join('/')
          downloaded += 1
        } catch (err) {
          failed += 1
          failures.push(`hero ${imageCounter}: ${(err as Error).message}`)
        }
      }
    }
  }

  return { downloaded, failed, failures }
}

async function downloadOne(
  url: string,
  dir: string,
  basename: string,
  accessToken: () => Promise<string>,
): Promise<string> {
  const headers: Record<string, string> = {}
  // SharePoint image URLs require a bearer token.
  if (/sharepoint\.com|graph\.microsoft\.com/i.test(url)) {
    const token = await accessToken()
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(url, { headers, redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const ext = pickExtension(url, contentType)
  const filename = `${basename}${ext}`
  const target = resolve(dir, filename)

  const buf = Buffer.from(await response.arrayBuffer())
  await writeFile(target, buf)

  return target
}

function pickExtension(url: string, contentType: string): string {
  const fromUrl = extname(new URL(url, 'https://example.invalid').pathname)
  if (fromUrl && fromUrl.length <= 6) return fromUrl
  if (/png/i.test(contentType)) return '.png'
  if (/jpe?g/i.test(contentType)) return '.jpg'
  if (/webp/i.test(contentType)) return '.webp'
  if (/gif/i.test(contentType)) return '.gif'
  if (/svg/i.test(contentType)) return '.svg'
  return '.bin'
}

function pad(n: number): string {
  return String(n).padStart(3, '0')
}

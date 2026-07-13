import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ConfidentialClientApplication } from '@azure/msal-node'

import { PATHS, loadConfig } from '../config.js'
import { createGraphClient, getSiteId } from './graphClient.js'
import { downloadImagesForPage } from './imageDownloader.js'
import { renderPageMarkdown } from './markdownEmitter.js'
import { extractPage } from './pageExtractor.js'
import { findPageByTitleOrSlug, listAllPages, type PageSummary } from './siteCrawler.js'
import type { PageContent } from './types.js'

export interface ExtractOptions {
  /** Optional title or slug to extract a single page only. */
  page?: string
  /** Skip image downloads (faster iteration on extraction logic). */
  skipImages?: boolean
}

export async function runExtract(options: ExtractOptions = {}): Promise<{
  pages: PageContent[]
  siteId: string
}> {
  const cfg = loadConfig('extract')
  const client = createGraphClient()
  const siteId = await getSiteId(client)
  console.log(`[extract] Resolved site id: ${siteId}`)

  await mkdir(PATHS.pages, { recursive: true })
  await mkdir(PATHS.assets, { recursive: true })

  let summaries: PageSummary[]
  if (options.page) {
    const found = await findPageByTitleOrSlug(client, siteId, options.page)
    if (!found) throw new Error(`No page found matching "${options.page}"`)
    summaries = [found]
    console.log(`[extract] Targeting single page: ${found.title}`)
  } else {
    summaries = await listAllPages(client, siteId)
    console.log(`[extract] Found ${summaries.length} pages in the site`)
  }

  // Image downloader needs a token provider. Build one off the same MSAL config so
  // it shares the cache with the Graph client.
  const tokenProvider = makeTokenProvider(cfg.AZURE_CLIENT_ID, cfg.AZURE_CLIENT_SECRET, cfg.AZURE_TENANT_ID)

  const pages: PageContent[] = []
  for (const summary of summaries) {
    console.log(`[extract] -> ${summary.title}`)
    try {
      const page = await extractPage(client, siteId, summary)

      if (!options.skipImages) {
        const result = await downloadImagesForPage(client, page, tokenProvider)
        if (result.failed > 0) {
          console.warn(
            `[extract]    images: ${result.downloaded} ok, ${result.failed} failed (${result.failures.join('; ')})`,
          )
        } else if (result.downloaded > 0) {
          console.log(`[extract]    images: ${result.downloaded} downloaded`)
        }
      }

      await writePageOutputs(page)
      pages.push(page)
    } catch (err) {
      console.error(`[extract]    FAILED: ${(err as Error).message}`)
    }
  }

  console.log(`[extract] Done. ${pages.length}/${summaries.length} pages extracted.`)
  return { pages, siteId }
}

async function writePageOutputs(page: PageContent): Promise<void> {
  const json = JSON.stringify(page, null, 2)
  const md = renderPageMarkdown(page)
  await writeFile(resolve(PATHS.pages, `${page.slug}.json`), json, 'utf8')
  await writeFile(resolve(PATHS.pages, `${page.slug}.md`), md, 'utf8')
}

function makeTokenProvider(clientId: string, clientSecret: string, tenantId: string): () => Promise<string> {
  const cca = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  })
  return async () => {
    const result = await cca.acquireTokenByClientCredential({ scopes: ['https://graph.microsoft.com/.default'] })
    if (!result?.accessToken) throw new Error('Failed to acquire Microsoft Graph token for image download')
    return result.accessToken
  }
}

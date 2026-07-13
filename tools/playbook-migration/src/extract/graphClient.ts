import { ConfidentialClientApplication } from '@azure/msal-node'
import { Client } from '@microsoft/microsoft-graph-client'
import 'isomorphic-fetch'

import { loadConfig } from '../config.js'

/**
 * Build a Microsoft Graph client using the OAuth client-credentials flow
 * (app-only auth). Requires Sites.Read.All admin consent on the App Registration.
 */
export function createGraphClient(): Client {
  const cfg = loadConfig('extract')

  const cca = new ConfidentialClientApplication({
    auth: {
      clientId: cfg.AZURE_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${cfg.AZURE_TENANT_ID}`,
      clientSecret: cfg.AZURE_CLIENT_SECRET,
    },
  })

  return Client.init({
    authProvider: async (done) => {
      try {
        const result = await cca.acquireTokenByClientCredential({
          scopes: ['https://graph.microsoft.com/.default'],
        })
        if (!result?.accessToken) {
          done(new Error('Microsoft Graph token request returned an empty access token'), null)
          return
        }
        done(null, result.accessToken)
      } catch (err) {
        done(err as Error, null)
      }
    },
  })
}

/**
 * Resolve a SharePoint site by hostname + server-relative path to its Graph site id.
 *
 * Graph endpoint:
 *   GET /sites/{hostname}:{server-relative-path}
 * Example: /sites/contoso.sharepoint.com:/sites/PlaybookSite
 */
export async function getSiteId(client: Client): Promise<string> {
  const cfg = loadConfig('extract')
  const path = `/sites/${cfg.SHAREPOINT_HOSTNAME}:${cfg.SHAREPOINT_SITE_PATH}`
  const site = await client.api(path).get()
  if (!site?.id || typeof site.id !== 'string') {
    throw new Error(`Could not resolve site id from ${path} (response: ${JSON.stringify(site)})`)
  }
  return site.id as string
}

import { NextResponse } from 'next/server'
import { getFrontifyIntakeSettings } from '@/lib/kv'
import type {
  FrontifyIntakeLibraryOverview,
  FrontifyIntakeOverviewResponse,
} from '@/src/domain/frontifyIntake/types'
import { getSubmissionInboxOverview, isFrontifyConfigured } from '@/src/integrations/frontify/client'

export async function GET() {
  try {
    const settings = await getFrontifyIntakeSettings()
    const enabledLibraries = settings.libraries.filter((library) => library.enabled)

    if (!isFrontifyConfigured()) {
      const response: FrontifyIntakeOverviewResponse = {
        hasToken: false,
        configured: enabledLibraries.length > 0,
        settings,
        libraries: [],
        totals: {
          libraries: enabledLibraries.length,
          dayFolders: 0,
          assets: 0,
        },
        lastSyncedAt: new Date().toISOString(),
        message: 'Add FRONTIFY_ACCESS_TOKEN before Heimdall can read submission inboxes.',
      }
      return NextResponse.json(response, { status: 200 })
    }

    const libraries = await Promise.all(
      enabledLibraries.map(async (config): Promise<FrontifyIntakeLibraryOverview> => {
        try {
          const overview = await getSubmissionInboxOverview(config.libraryId, config.inboxFolderName)
          return {
            config,
            ...overview,
            ...(overview.inboxFolderId
              ? {}
              : { error: `Inbox folder "${config.inboxFolderName}" was not found in library ${config.libraryId}.` }),
          }
        } catch (error) {
          return {
            config,
            inboxFolderId: null,
            rootAssets: [],
            dayFolders: [],
            totalAssets: 0,
            error: error instanceof Error ? error.message : 'Unknown Frontify error',
          }
        }
      })
    )

    const response: FrontifyIntakeOverviewResponse = {
      hasToken: true,
      configured: enabledLibraries.length > 0,
      settings,
      libraries,
      totals: {
        libraries: libraries.length,
        dayFolders: libraries.reduce((sum, library) => sum + library.dayFolders.length, 0),
        assets: libraries.reduce((sum, library) => sum + library.totalAssets, 0),
      },
      lastSyncedAt: new Date().toISOString(),
      message:
        enabledLibraries.length === 0
          ? 'Configure one or more Frontify libraries to start aggregating submission inboxes.'
          : undefined,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'

import 'dotenv/config'
import { mondayGraphql, columnMap, getCol } from '../integrations/monday/client.js'
import { getDocContent, getDocIdFromColumnValue } from '../integrations/monday/docReader.js'

const ITEM_ID = process.argv[2] ?? '10867939252'
const DOC_ID = process.argv[3] ?? '18395775670'

async function main(): Promise<void> {
  const data = await mondayGraphql<{
    items?: Array<{
      id: string
      name: string
      column_values: Array<{
        id: string
        text: string | null
        value: string | null
        type: string
        column: { title: string }
      }>
    }>
  }>(
    `query ($ids: [ID!]!) {
      items(ids: $ids) {
        id
        name
        column_values {
          id
          text
          value
          type
          column { title }
        }
      }
    }`,
    { ids: [ITEM_ID] }
  )

  const item = data?.items?.[0]
  if (!item) {
    console.log('NO_ITEM')
    return
  }

  console.log(`ITEM ${item.id} ${item.name}`)
  const mappedCols = columnMap({
    id: item.id,
    name: item.name,
    column_values: item.column_values.map((c) => ({
      id: c.id,
      title: c.column.title,
      text: c.text ?? undefined,
      value: c.value ?? undefined,
      type: c.type ?? undefined,
    })),
  })
  const briefRaw = getCol(mappedCols, 'brief', 'briefing', 'doc')
  const extractedDocId = getDocIdFromColumnValue(briefRaw ?? null)
  console.log(`BRIEF_RAW=${briefRaw ?? ''}`)
  console.log(`EXTRACTED_DOC_ID=${extractedDocId ?? ''}`)
  for (const c of item.column_values) {
    const title = c.column?.title ?? ''
    const lowerTitle = title.toLowerCase()
    if (c.id.includes('doc') || c.type === 'doc' || lowerTitle.includes('brief')) {
      console.log(`DOC_COL id=${c.id} type=${c.type} title=${title}`)
      console.log(`  text=${c.text ?? ''}`)
      console.log(`  value=${c.value ?? ''}`)
    }
  }

  const docContent = await getDocContent(DOC_ID, { itemId: ITEM_ID })
  if (!docContent) {
    console.log(`DOC_CONTENT ${DOC_ID}: EMPTY_OR_INACCESSIBLE`)
    try {
      const rawDocs = await mondayGraphql<unknown>(
        `query ($ids: [ID!]!) {
          docs(ids: $ids) {
            id
            name
          }
        }`,
        { ids: [DOC_ID] }
      )
      console.log('DOCS_QUERY_OK', JSON.stringify(rawDocs))
    } catch (e) {
      console.log('DOCS_QUERY_ERROR', e instanceof Error ? e.message : String(e))
    }
    return
  }
  console.log(`DOC_CONTENT ${DOC_ID}: LENGTH=${docContent.length}`)
  console.log(docContent.slice(0, 1200))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

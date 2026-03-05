/**
 * Sync Briefings command — Monday.com to Figma sync.
 * Extracted from the original monolithic code.ts.
 *
 * Figma sandbox cannot fetch localhost; all HTTP goes through UI iframe.
 * Main thread handles: Figma API (clone page, fill text, reorder).
 * UI handles: fetch from Heimdall backend, user interaction.
 *
 * ═══════════════════════════════════════════════════════════════════
 * KNOWN CONSTRAINTS & HARD-LEARNED LESSONS (Sentinel)
 * ═══════════════════════════════════════════════════════════════════
 *
 * 1. FONT LOADING — Figma requires ALL fonts in a text node to be loaded
 *    before setting .characters or any layout-affecting property (.fontSize,
 *    .fontName, .lineHeight, etc.). Failure to do so silently deadlocks the
 *    plugin sandbox (no error thrown — execution simply stops forever).
 *    CONFIRMED: loading only hardcoded Inter Regular + Bold caused a
 *    reproducible deadlock at the first figma.loadFontAsync call on cloned
 *    template nodes. Fix: use getRangeAllFontNames(0, len) to load the
 *    actual fonts the node contains. NEVER hardcode font assumptions.
 *    Ref: https://developers.figma.com/docs/plugins/working-with-text
 *
 * 2. POSTMESSAGE RATE — Sending many figma.ui.postMessage() calls in a
 *    tight async loop can overwhelm the sandbox ↔ iframe channel. During
 *    debugging, 50+ postMessage calls in <500ms correlated with hangs.
 *    Use console.log for diagnostics instead of postMessage-based relay.
 *
 * 3. DYNAMIC PAGES — Cloned pages require page.loadAsync() before their
 *    children are accessible. Always call loadAsync() after clone and
 *    before traversing. Without it, children array may be empty.
 *    Ref: https://developers.figma.com/docs/plugins/migrating-to-dynamic-loading
 *
 * 4. NORMALIZELAYOUT BUDGET — The 6-phase normalizeLayout system traverses
 *    140+ nodes (840+ visits). Running it AFTER applyNodeMapping (which
 *    already traverses + modifies all text nodes) exhausts the Figma API
 *    budget and causes the plugin to hang. Only run normalizeLayout when
 *    applyNodeMapping was NOT used (i.e. placeholder fallback path).
 *
 * 5. SETTIMEOUT / PROMISE.RACE — The Figma plugin sandbox does not
 *    reliably support setTimeout-based timeout wrappers around Figma API
 *    calls. Using Promise.race(figmaCall, timeout) causes deadlocks.
 *    Never wrap figma.loadFontAsync or similar in a timeout.
 *
 * 6. "WORKED, THEN SUDDENLY BROKE" TIMELINE — This incident looked random
 *    but was cumulative:
 *    - It worked when traversal stayed within editable page/frame text nodes.
 *    - It regressed after code paths started traversing deeper into
 *      INSTANCE/COMPONENT/COMPONENT_SET internals under dynamic-page mode.
 *      That traversal can deadlock and freeze after first-page partial writes.
 *    - Extra debug transport amplified the issue: high-rate postMessage relay
 *      and main-thread localhost fetch logging both introduced additional
 *      sandbox pressure, making stalls more frequent and harder to reproduce.
 *    - It is stable again because we now skip component-internal node types
 *      in applyNodeMapping (they are not mapping targets) and avoid
 *      high-volume cross-thread/network debug relays in hot loops.
 *
 * Tagged console logs: [Sync], [Fonts], [Map], [Style], [Layout]
 * These appear in Figma's dev console (Plugins → Development → Open console).
 * ═══════════════════════════════════════════════════════════════════
 */
import { runExportComments } from './exportComments'

const TEMPLATE_PAGE_NAMES = ['Briefing Template to Duplicate', 'Briefing Template', 'Template']

interface QueuedJob {
  id: string
  idempotencyKey: string
  experimentPageName: string
  briefingPayload: BriefingPayload
  mondayItemId?: string
  /** Pre-computed node name ├ö├Ñ├å value; applied by node.name when present */
  nodeMapping?: Array<{ nodeName: string; value: string }>
  /** Pre-computed frame renames */
  frameRenames?: Array<{ oldName: string; newName: string }>
  /** Image attachments from Monday briefing to import into Figma */
  images?: Array<{ url: string; name: string; source: string }>
}

/** Pending image import request sent to UI for fetching. */
interface ImageFetchRequest {
  url: string
  name: string
  assetId?: string
  pageId: string
}

/** Image bytes received from UI after fetching. */
interface ImageData {
  url: string
  name: string
  pageId: string
  bytes: number[]
}

interface BriefingPayload {
  experimentName?: string
  sectionName?: string
  idea?: string
  audienceRegion?: string
  segment?: string
  formats?: string
  variants?: Array<{ headline?: string; subline?: string; cta?: string }>
}

function getPlaceholderValue(placeholderId: string, briefing: BriefingPayload): string {
  var v = briefing.variants || []
  var map: Record<string, string> = {
    'heimdall:exp_name': briefing.experimentName || '',
    'heimdall:idea': briefing.idea || '',
    'heimdall:audience_region': briefing.audienceRegion || '',
    'heimdall:segment': briefing.segment || '',
    'heimdall:formats': briefing.formats || '',
    'heimdall:var_a_headline': v[0] ? (v[0].headline || '') : '',
    'heimdall:var_a_subline': v[0] ? (v[0].subline || '') : '',
    'heimdall:var_a_cta': v[0] ? (v[0].cta || '') : '',
    'heimdall:var_b_headline': v[1] ? (v[1].headline || '') : '',
    'heimdall:var_b_subline': v[1] ? (v[1].subline || '') : '',
    'heimdall:var_b_cta': v[1] ? (v[1].cta || '') : '',
    'heimdall:var_c_headline': v[2] ? (v[2].headline || '') : '',
    'heimdall:var_c_subline': v[2] ? (v[2].subline || '') : '',
    'heimdall:var_c_cta': v[2] ? (v[2].cta || '') : '',
    'heimdall:var_d_headline': v[3] ? (v[3].headline || '') : '',
    'heimdall:var_d_subline': v[3] ? (v[3].subline || '') : '',
    'heimdall:var_d_cta': v[3] ? (v[3].cta || '') : '',
  }
  return map[placeholderId] || ''
}

async function loadFontsForTextNode(textNode: TextNode): Promise<void> {
  var len = textNode.characters.length
  if (len === 0) {
    var font = textNode.fontName as FontName
    if (font && font.family) {
      await figma.loadFontAsync(font)
    }
    return
  }
  var loaded = new Set<string>()
  for (var c = 0; c < len; c++) {
    var f = textNode.getRangeFontName(c, c + 1) as FontName
    if (f && f.family) {
      var key = f.family + ':' + f.style
      if (!loaded.has(key)) {
        loaded.add(key)
        await figma.loadFontAsync(f)
      }
    }
  }
}

async function fillTextNodes(node: BaseNode, briefing: BriefingPayload): Promise<void> {
  if (node.type === 'TEXT') {
    var textNode = node as TextNode
    var heimdallId = ''
    try { heimdallId = textNode.getPluginData('heimdallId') || textNode.getPluginData('placeholderId') } catch (_) {}
    if (heimdallId) {
      var value = getPlaceholderValue(heimdallId, briefing)
      // Do not overwrite existing mapped content with empty fallback values.
      if (!value || !value.trim()) return
      try {
        await loadFontsForTextNode(textNode)
        textNode.characters = value
        if (
          textNode.textAutoResize === 'HEIGHT' ||
          textNode.textAutoResize === 'WIDTH_AND_HEIGHT'
        ) {
          textNode.textAutoResize = 'HEIGHT'
        }
        await styleFilledContent(textNode)
      } catch (_) {}
    }
    return
  }
  var withChildren = node as { children?: readonly BaseNode[] }
  if (withChildren.children && withChildren.children.length) {
    for (var i = 0; i < withChildren.children.length; i++) {
      await fillTextNodes(withChildren.children[i], briefing)
    }
  }
}

function normalizeTextKey(input: string): string {
  return input.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Label-as-pointer keys: content goes in sibling Specs > TEXT "-", not in the label node. */
const LABEL_POINTER_KEYS = new Set<string>(['visual', 'copy info:'])

/**
 * Find the sibling Specs frame's TEXT placeholder (the "-" node) for a label node.
 * Structure: parent (e.g. Elements) has label TEXT + FRAME "Specs" with child TEXT "-".
 */
function findSpecsPlaceholder(labelNode: TextNode): TextNode | null {
  const parent = labelNode.parent
  if (!parent || !('children' in parent) || !parent.children) return null
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i]
    if (child.type !== 'FRAME') continue
    if (child.name !== 'Specs') continue
    const specChildren = (child as FrameNode).children || []
    for (let j = 0; j < specChildren.length; j++) {
      const c = specChildren[j]
      if (c.type === 'TEXT') return c as TextNode
    }
    return null
  }
  return null
}

/** Strip "Visual:" or "Copy info:" prefix from value for label-pointer fields. */
function stripLabelPointerPrefix(value: string, normalizedKey: string): string {
  if (LABEL_POINTER_KEYS.has(normalizedKey)) {
    return value
      .replace(/^visual\s*:\s*/i, '')
      .replace(/^copy\s+info\s*:\s*/i, '')
      .trim()
  }
  return value
}

interface MappingEntry {
  nodeName: string
  normalizedNodeName: string
  value: string
  used?: boolean
}

function cleanVariantValue(value: string, label: 'headline' | 'subline' | 'cta' | 'note'): string {
  const rx = new RegExp(`^\\s*${label}\\s*:\\s*`, 'i')
  return value.replace(rx, '').trim()
}

function getAncestorPath(node: BaseNode): string[] {
  const names: string[] = []
  let current: BaseNode | null = node
  while (current && 'parent' in current) {
    const p = current.parent
    if (!p || p.type === 'DOCUMENT') break
    if ('name' in p && typeof p.name === 'string' && p.name.trim()) {
      names.push(p.name.trim())
    }
    current = p as BaseNode
  }
  return names.reverse()
}

function buildTextCandidates(textNode: TextNode): string[] {
  const candidates = new Set<string>()
  const name = textNode.name || ''
  const chars = textNode.characters || ''
  if (name) candidates.add(name)
  if (chars) candidates.add(chars)
  // So variant block "A - Image\nInput visual + copy direction:\nScript:" still matches key "A - Image"
  if (chars && chars.includes('\n')) {
    const firstLine = chars.split('\n')[0].trim()
    if (firstLine) candidates.add(firstLine)
  }

  const path = getAncestorPath(textNode)
  if (path.length > 0) {
    const parent = path[path.length - 1]
    if (name) candidates.add(`${parent}::${name}`)
    if (chars) candidates.add(`${parent}::${chars}`)
    const full = path.join(' > ')
    if (name) candidates.add(`${full}::${name}`)
    if (chars) candidates.add(`${full}::${chars}`)

    // Add partial ancestry forms so keys like "Variation A::headline:"
    // still match when there are intermediate wrapper groups.
    for (let i = 0; i < path.length; i++) {
      const partial = path.slice(0, i + 1).join(' > ')
      if (name) candidates.add(`${partial}::${name}`)
      if (chars) candidates.add(`${partial}::${chars}`)
    }
  }

  return Array.from(candidates)
}

function detectVariationLetter(textNode: TextNode): 'A' | 'B' | 'C' | 'D' | null {
  const path = getAncestorPath(textNode)
  for (let i = path.length - 1; i >= 0; i--) {
    const m = /variation\s*([A-D])/i.exec(path[i])
    if (m) return m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D'
  }
  return null
}

function consumeScopedMapping(
  mappingEntries: MappingEntry[],
  variation: 'A' | 'B' | 'C' | 'D',
  suffix: 'headline:' | 'subline:' | 'cta:' | 'note:'
): string | undefined {
  const preferredSuffixes = [
    normalizeTextKey(`copy > variation ${variation}::${suffix}`),
    normalizeTextKey(`variation ${variation}::${suffix}`),
  ]
  for (const target of preferredSuffixes) {
    for (let i = 0; i < mappingEntries.length; i++) {
      const entry = mappingEntries[i]
      if (entry.used) continue
      if (entry.normalizedNodeName !== target) continue
      entry.used = true
      return entry.value
    }
  }
  return undefined
}

function patchInlineLabelValue(text: string, label: string, value: string | undefined): string {
  if (!value) return text
  const lines = text.split('\n')
  let changed = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (new RegExp(`^\\s*${label}\\s*:`, 'i').test(line)) {
      lines[i] = `${label}: ${value}`
      changed = true
      break
    }
  }
  return changed ? lines.join('\n') : text
}

function tryComposeVariationInline(textNode: TextNode, mappingEntries: MappingEntry[]): string | undefined {
  const variation = detectVariationLetter(textNode)
  if (!variation) return undefined

  let next = textNode.characters
  const norm = normalizeTextKey(next)

  const h = consumeScopedMapping(mappingEntries, variation, 'headline:')
  const s = consumeScopedMapping(mappingEntries, variation, 'subline:')
  const c = consumeScopedMapping(mappingEntries, variation, 'cta:')
  const n = consumeScopedMapping(mappingEntries, variation, 'note:')

  // Multi-label text block (headline/subline/CTA in one node)
  if (norm.includes('headline:') && norm.includes('subline:') && norm.includes('cta:')) {
    next = patchInlineLabelValue(next, 'headline', h ? cleanVariantValue(h, 'headline') : undefined)
    next = patchInlineLabelValue(next, 'subline', s ? cleanVariantValue(s, 'subline') : undefined)
    next = patchInlineLabelValue(next, 'CTA', c ? cleanVariantValue(c, 'cta') : undefined)
  }

  // Dedicated note line/block
  if (norm.includes('note:')) {
    next = patchInlineLabelValue(next, 'Note', n ? cleanVariantValue(n, 'note') : undefined)
  }

  return next !== textNode.characters ? next : undefined
}

function pickMappedValue(
  textNode: TextNode,
  mappingEntries: MappingEntry[]
): string | undefined {
  const path = getAncestorPath(textNode)
  const candidates = buildTextCandidates(textNode).map(normalizeTextKey)
  for (const candidate of candidates) {
    for (let i = 0; i < mappingEntries.length; i++) {
      const entry = mappingEntries[i]
      if (entry.used) continue
      if (entry.normalizedNodeName !== candidate) continue
      entry.used = true
      return entry.value
    }
  }

  // Fallback for duplicate label fields in Copy variation cards:
  // consume Variation A/B/C/D scoped mappings in traversal order.
  const inCopyOrVariation = path.some((p) => {
    const n = normalizeTextKey(p)
    return n.includes('copy') || n.includes('variation')
  })
  if (inCopyOrVariation) {
    const nameOrChars = [normalizeTextKey(textNode.name || ''), normalizeTextKey(textNode.characters || '')]
    const consumeBySuffix = (suffix: string): string | undefined => {
      for (let i = 0; i < mappingEntries.length; i++) {
        const entry = mappingEntries[i]
        if (entry.used) continue
        if (!entry.normalizedNodeName.endsWith(suffix)) continue
        entry.used = true
        return entry.value
      }
      return undefined
    }
    if (nameOrChars.includes('headline:')) return consumeBySuffix('::headline:')
    if (nameOrChars.includes('subline:')) return consumeBySuffix('::subline:')
    if (nameOrChars.includes('cta:')) return consumeBySuffix('::cta:')
    if (nameOrChars.includes('note:')) return consumeBySuffix('::note:')
  }

  return undefined
}

async function applyNodeMapping(
  node: BaseNode,
  mappingEntries: MappingEntry[],
  frameRenames: Array<{ oldName: string; newName: string }>
): Promise<number> {
  let mappedCount = 0
  if (node.type === 'TEXT') {
    var textNode = node as TextNode
    var path = getAncestorPath(textNode)
    var value = pickMappedValue(textNode, mappingEntries)
    if (value === undefined) {
      value = tryComposeVariationInline(textNode, mappingEntries)
    }
    debugLog.push({
      nodeName: textNode.name,
      chars: (textNode.characters || '').substring(0, 60),
      path: path,
      matched: value !== undefined,
      matchedKey: value !== undefined ? value.substring(0, 60) : undefined,
    })
    if (value !== undefined) {
      const normalizedName = normalizeTextKey(textNode.name || '')
      const normalizedChars = normalizeTextKey(textNode.characters || '')
      // VARIANTS header guard: the mapping agent sends variant count or
      // full markdown as the value for the "VARIANTS" node, but in Figma
      // this node is just the section header label — it must always read
      // "VARIANTS". The actual variant content lives in separate blocks below.
      if ((normalizedName === 'variants' || normalizedChars === 'variants') && value.trim().toUpperCase() !== 'VARIANTS') {
        value = 'VARIANTS'
      }
      const isLabelPointer =
        LABEL_POINTER_KEYS.has(normalizedName) || LABEL_POINTER_KEYS.has(normalizedChars)
      const targetNode: TextNode = isLabelPointer
        ? (findSpecsPlaceholder(textNode) || textNode)
        : textNode
      const valueToWrite =
        targetNode !== textNode ? stripLabelPointerPrefix(value, normalizedName || normalizedChars) : value
      try {
        await loadFontsForTextNode(targetNode)
        targetNode.characters = valueToWrite
        if (
          targetNode.textAutoResize === 'HEIGHT' ||
          targetNode.textAutoResize === 'WIDTH_AND_HEIGHT'
        ) {
          targetNode.textAutoResize = 'HEIGHT'
        }
        await styleFilledContent(targetNode)
        mappedCount += 1
      } catch (_) {}
    }
    return mappedCount
  }
  if (node.type === 'FRAME' || node.type === 'GROUP') {
    var frame = node as FrameNode
    for (var r = 0; r < frameRenames.length; r++) {
      if (frameRenames[r].oldName === frame.name) {
        frame.name = frameRenames[r].newName
        frameRenames.splice(r, 1)
        break
      }
    }
  }
  // Skip node types whose children never contain mapping targets.
  // INSTANCE/COMPONENT/COMPONENT_SET children are internal Figma component
  // structure — accessing .children on them in dynamic-page mode can
  // deadlock the sandbox. See KNOWN CONSTRAINTS #1.
  if (node.type === 'INSTANCE' || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
    return mappedCount
  }
  var withChildren = node as { children?: readonly BaseNode[] }
  if (withChildren.children && withChildren.children.length) {
    for (var i = 0; i < withChildren.children.length; i++) {
      mappedCount += await applyNodeMapping(withChildren.children[i], mappingEntries, frameRenames)
    }
  }
  return mappedCount
}

const SECTION_UTILITY_PREFIXES = [
  'Briefing Template',
  'Template',
  'Cover',
  'Status',
  'Safe Zone',
  'Export',
  '_Heimdall Components',
]

/** Build list of category/divider pages (names and indices) for section ordering. */
function getSectionDividers(allPages: readonly PageNode[]): Array<{ index: number; name: string }> {
  var dividers: Array<{ index: number; name: string }> = []
  for (var i = 0; i < allPages.length; i++) {
    var page = allPages[i]
    var name = page.name.trim()
    if (name.toUpperCase().indexOf('EXP-') === 0) continue
    var skip = false
    for (var j = 0; j < SECTION_UTILITY_PREFIXES.length; j++) {
      if (name.indexOf(SECTION_UTILITY_PREFIXES[j]) >= 0) {
        skip = true
        break
      }
    }
    if (skip) continue
    if (/^[-\u2014\u2013\s*]+$/.test(name)) continue
    dividers.push({ index: i, name: name.toUpperCase() })
  }
  return dividers
}

function findSectionInsertionIndex(sectionName: string, allPages: readonly PageNode[]): number {
  var dividers = getSectionDividers(allPages)
  var upper = sectionName.toUpperCase().trim()
  var matchIdx = -1
  for (var i = 0; i < dividers.length; i++) {
    if (
      dividers[i].name === upper ||
      dividers[i].name.indexOf(upper) >= 0 ||
      upper.indexOf(dividers[i].name) >= 0
    ) {
      matchIdx = i
      break
    }
  }
  if (matchIdx === -1) return -1
  var nextDivider = dividers[matchIdx + 1]
  if (nextDivider) return nextDivider.index
  return allPages.length
}

/**
 * Create blank category pages for any section name from jobs that does not yet have a matching page.
 * Inserts new pages after the last existing category (divider) so briefings can be placed under them.
 */
function ensureCategoryPages(root: BaseNode, jobs: QueuedJob[]): void {
  var sectionNames = new Set<string>()
  for (var i = 0; i < jobs.length; i++) {
    var sectionName = (jobs[i].briefingPayload as BriefingPayload).sectionName
    if (sectionName && String(sectionName).trim()) {
      sectionNames.add(String(sectionName).trim().toUpperCase())
    }
  }
  if (sectionNames.size === 0) return

  var children = root.children || []
  var allPages: PageNode[] = []
  for (var c = 0; c < children.length; c++) {
    if (children[c].type === 'PAGE') allPages.push(children[c] as PageNode)
  }
  var dividers = getSectionDividers(allPages)
  var existingNames = new Set(dividers.map(function (d) { return d.name }))

  var toCreate: string[] = []
  sectionNames.forEach(function (upper) {
    if (!existingNames.has(upper)) toCreate.push(upper)
  })
  if (toCreate.length === 0) return

  var insertAt: number
  if (dividers.length > 0) {
    insertAt = dividers[dividers.length - 1].index + 1
  } else {
    var templateIdx = -1
    for (var t = 0; t < allPages.length; t++) {
      var p = allPages[t]
      if (SECTION_UTILITY_PREFIXES.some(function (pre) { return p.name.indexOf(pre) >= 0 })) {
        templateIdx = t
      }
    }
    insertAt = templateIdx >= 0 ? templateIdx + 1 : 0
  }

  for (var k = 0; k < toCreate.length; k++) {
    var newPage = figma.createPage()
    newPage.name = toCreate[k]
    root.insertChild(insertAt + k, newPage)
  }
}

const TEMPLATE_FONT = { family: 'Inter', style: 'Regular' }
const TEMPLATE_FONT_BOLD = { family: 'Inter', style: 'Bold' }

/**
 * Uniform scale factor for the entire template.
 * 1 = original 2400px layout. 4 = ~9600px (comfortable working size).
 */
const S = 4

const LABEL_FONT_SIZE = 14 * S
const SUB_LABEL_FONT_SIZE = 12 * S
const CONTENT_FONT_SIZE = 12 * S

/**
 * Exact production asset frame dimensions in Figma pixels.
 * These are NOT multiplied by S -- they are final pixel sizes used directly.
 */
const ASSET_SIZES: Record<string, { w: number; h: number }> = {
  '9x16': { w: 1440, h: 2560 },
  '4x5':  { w: 1440, h: 1800 },
  '1x1':  { w: 1440, h: 1440 },
}

function solidPaint(r: number, g: number, b: number): SolidPaint {
  return { type: 'SOLID', color: { r, g, b } }
}

function applyTextColor(text: TextNode, r: number, g: number, b: number): void {
  text.fills = [solidPaint(r, g, b)]
}

function makeColumnFrame(name: string, width: number): FrameNode {
  const frame = figma.createFrame()
  frame.name = name
  frame.resize(width, 100)
  frame.layoutMode = 'VERTICAL'
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'FIXED'
  frame.counterAxisAlignItems = 'MIN'
  frame.itemSpacing = 8 * S
  frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = 16 * S
  if (name === 'Briefing') frame.fills = [solidPaint(0.94, 0.95, 0.97)]
  else if (name === 'Copy') frame.fills = [solidPaint(0.94, 0.94, 0.96)]
  else if (name === 'Design') frame.fills = [solidPaint(0.93, 0.94, 0.95)]
  else frame.fills = [solidPaint(0.95, 0.95, 0.95)]
  frame.clipsContent = false
  return frame
}

function makeTextNode(name: string, placeholder: string, font: FontName): TextNode {
  const text = figma.createText()
  text.name = name
  text.fontName = font
  text.fontSize = 13 * S
  text.lineHeight = { unit: 'PIXELS', value: 18 * S }
  text.characters = placeholder
  text.textAutoResize = 'HEIGHT'
  return text
}

function makeColumnHeader(title: string, width: number): FrameNode {
  const header = figma.createFrame()
  header.name = `${title} Header`
  header.resize(width, 64 * S)
  header.layoutMode = 'HORIZONTAL'
  header.primaryAxisSizingMode = 'FIXED'
  header.counterAxisSizingMode = 'AUTO'
  header.counterAxisAlignItems = 'CENTER'
  header.primaryAxisAlignItems = 'SPACE_BETWEEN'
  header.itemSpacing = 16 * S
  header.paddingLeft = 20 * S
  header.paddingRight = 20 * S
  header.paddingTop = 14 * S
  header.paddingBottom = 14 * S
  header.cornerRadius = 8 * S
  header.fills = [solidPaint(0.16, 0.17, 0.2)]
  header.strokes = [solidPaint(0.3, 0.32, 0.36)]
  header.strokeWeight = Math.max(1, S / 2)
  header.clipsContent = false

  const titleText = figma.createText()
  titleText.name = `${title} Title`
  titleText.fontName = TEMPLATE_FONT_BOLD as FontName
  titleText.fontSize = 18 * S
  titleText.characters = title.toUpperCase()
  titleText.textAutoResize = 'WIDTH_AND_HEIGHT'
  applyTextColor(titleText, 1, 1, 1)
  header.appendChild(titleText)
  return header
}

/** Track whether Bold font loaded successfully (cached for session). */
var boldFontAvailable: boolean | null = null

/**
 * Try to load the Bold font once; cache the result so we don't retry on every text node.
 * If loading fails or deadlocks, fall back to size-only styling for section labels.
 */
async function ensureBoldFont(): Promise<boolean> {
  if (boldFontAvailable !== null) return boldFontAvailable
  try {
    await figma.loadFontAsync(TEMPLATE_FONT_BOLD as FontName)
    boldFontAvailable = true
  } catch (_) {
    boldFontAvailable = false
  }
  return boldFontAvailable
}

/**
 * Style filled content with two-tier typography:
 *   - Label prefixes (text before ':' on each line) → Bold, larger
 *   - Value text (everything else) → Regular, smaller
 * Gracefully degrades if Bold font is unavailable (only adjusts size).
 */
async function styleFilledContent(textNode: TextNode): Promise<void> {
  const text = textNode.characters
  if (!text || text.length === 0) return
  // Load the node's current font without per-character scanning (which
  // deadlocks after .characters assignment in dynamic-page mode).
  // textNode.fontName is either a FontName or figma.mixed.
  var currentFont = textNode.fontName
  if (currentFont !== figma.mixed && (currentFont as FontName).family) {
    try { await figma.loadFontAsync(currentFont as FontName) } catch (_) {}
  }
  try {
    await figma.loadFontAsync(TEMPLATE_FONT as FontName)
  } catch (_) { return }
  const hasBold = await ensureBoldFont()

  const len = text.length

  // Set entire text to content style (regular, smaller)
  textNode.setRangeFontName(0, len, TEMPLATE_FONT as FontName)
  textNode.setRangeFontSize(0, len, CONTENT_FONT_SIZE)
  textNode.setRangeLineHeight(0, len, { unit: 'PIXELS', value: CONTENT_FONT_SIZE + 5 })

  // Three-tier typography: primary labels (14px Bold), sub-headers (12px Bold), content (12px Regular).
  const KNOWN_LABELS = /^(IDEA:|WHY:|AUDIENCE\/REGION:|SEGMENT:|FORMATS:|VARIANTS:|Product:|Visual:|Copy:|Copy info:|Note:|Test:|Testing:|headline:|subline:|CTA:|[A-D]\s*-\s*(?:Video|Image|Static|Carousel|[A-Za-z]+):)/i
  const SUB_LABELS = /^(Input visual \+ copy direction:|Script:)/i
  const lines = text.split('\n')
  let offset = 0
  for (const line of lines) {
    const subM = SUB_LABELS.exec(line)
    const labelM = KNOWN_LABELS.exec(line)
    if (subM) {
      const labelEnd = offset + subM[1].length
      if (hasBold) {
        textNode.setRangeFontName(offset, labelEnd, TEMPLATE_FONT_BOLD as FontName)
      }
      textNode.setRangeFontSize(offset, labelEnd, SUB_LABEL_FONT_SIZE)
      textNode.setRangeLineHeight(offset, labelEnd, { unit: 'PIXELS', value: SUB_LABEL_FONT_SIZE + 5 })
    } else if (labelM) {
      const labelEnd = offset + labelM[1].length
      if (hasBold) {
        textNode.setRangeFontName(offset, labelEnd, TEMPLATE_FONT_BOLD as FontName)
      }
      textNode.setRangeFontSize(offset, labelEnd, LABEL_FONT_SIZE)
      textNode.setRangeLineHeight(offset, labelEnd, { unit: 'PIXELS', value: LABEL_FONT_SIZE + 5 })
    }
    offset += line.length + 1 // +1 for the \n
  }

  applyHyperlinksToTextNode(textNode)
}

/** Match URL-like substrings (http/https) for hyperlink application. */
const URL_REGEX = /https?:\/\/[^\s\]\)"\']+/g

/**
 * Detect URLs in text and set range hyperlinks so they are clickable in Figma.
 * Idempotent; safe to call after content and styling are set.
 */
function applyHyperlinksToTextNode(textNode: TextNode): void {
  const text = textNode.characters
  if (!text || text.length === 0) return
  let m: RegExpExecArray | null
  URL_REGEX.lastIndex = 0
  while ((m = URL_REGEX.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    const url = m[0]
    try {
      textNode.setRangeHyperlink(start, end, { type: 'URL', url })
    } catch (_) {
      // Skip if API fails for this range
    }
  }
}

/**
 * Style unfilled template labels (text that wasn't replaced by content).
 * These get Bold + larger font to act as section headers.
 */
async function styleTemplateLabel(textNode: TextNode): Promise<void> {
  const text = textNode.characters
  if (!text || text.length === 0) return
  try { await figma.loadFontAsync(TEMPLATE_FONT as FontName) } catch (_) { return }
  const hasBold = await ensureBoldFont()

  const len = text.length
  if (hasBold) {
    textNode.setRangeFontName(0, len, TEMPLATE_FONT_BOLD as FontName)
  }
  textNode.setRangeFontSize(0, len, LABEL_FONT_SIZE)
  textNode.setRangeLineHeight(0, len, { unit: 'PIXELS', value: LABEL_FONT_SIZE + 5 })
}

/** Style unfilled sub-header labels (e.g. Input visual + copy direction:, Script:) as Bold 12px. */
async function styleTemplateSubLabel(textNode: TextNode): Promise<void> {
  const text = textNode.characters
  if (!text || text.length === 0) return
  try { await figma.loadFontAsync(TEMPLATE_FONT as FontName) } catch (_) { return }
  const hasBold = await ensureBoldFont()

  const len = text.length
  if (hasBold) {
    textNode.setRangeFontName(0, len, TEMPLATE_FONT_BOLD as FontName)
  }
  textNode.setRangeFontSize(0, len, SUB_LABEL_FONT_SIZE)
  textNode.setRangeLineHeight(0, len, { unit: 'PIXELS', value: SUB_LABEL_FONT_SIZE + 5 })
}

function makeBlockFrame(): FrameNode {
  const frame = figma.createFrame()
  frame.name = 'Block'
  frame.layoutMode = 'VERTICAL'
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'FIXED'
  frame.counterAxisAlignItems = 'MIN'
  frame.itemSpacing = 8 * S
  frame.paddingTop = frame.paddingBottom = 8 * S
  frame.paddingLeft = frame.paddingRight = 12 * S
  frame.fills = [solidPaint(1, 1, 1)]
  frame.strokes = [solidPaint(0.88, 0.89, 0.92)]
  frame.strokeWeight = Math.max(1, S / 2)
  frame.cornerRadius = 6 * S
  frame.clipsContent = false
  return frame
}

/** Append a child to an auto-layout parent and set it to stretch/fill cross-axis. */
function appendAndStretch(parent: FrameNode, child: SceneNode): void {
  parent.appendChild(child)
  try { (child as any).layoutAlign = 'STRETCH' } catch (_) {}
}

async function createAutoLayoutTemplate(): Promise<{ error?: string }> {
  try {
    await figma.loadFontAsync(TEMPLATE_FONT)
    await figma.loadFontAsync(TEMPLATE_FONT_BOLD)
  } catch (e) {
    return { error: 'Could not load Inter fonts' }
  }
  const font = TEMPLATE_FONT as FontName
  const root = figma.root
  try {

  // Reuse existing template page if present; otherwise create a new one.
  let templatePage: PageNode | null = null
  for (let i = root.children.length - 1; i >= 0; i--) {
    const page = root.children[i]
    if (page.type === 'PAGE' && TEMPLATE_PAGE_NAMES.some((n) => (page as PageNode).name.indexOf(n) >= 0)) {
      templatePage = page as PageNode
      if (typeof (templatePage as any).loadAsync === 'function') {
        try { await (templatePage as any).loadAsync() } catch (_) {}
      }
      for (let c = templatePage.children.length - 1; c >= 0; c--) {
        templatePage.children[c].remove()
      }
      break
    }
  }
  if (!templatePage) {
    templatePage = figma.createPage()
    templatePage.name = 'Briefing Template to Duplicate'
    root.appendChild(templatePage)
  }

  const section = figma.createFrame()
  section.name = 'Name Briefing'
  section.layoutMode = 'VERTICAL'
  section.primaryAxisSizingMode = 'AUTO'
  section.counterAxisSizingMode = 'FIXED'
  section.counterAxisAlignItems = 'MIN'
  section.itemSpacing = 12 * S
  section.paddingTop = section.paddingBottom = section.paddingLeft = section.paddingRight = 24 * S
  section.fills = []
  section.clipsContent = false
  section.resize(2400 * S, 100)
  templatePage.appendChild(section)

  const row = figma.createFrame()
  row.name = 'Columns'
  row.layoutMode = 'HORIZONTAL'
  row.primaryAxisSizingMode = 'AUTO'
  row.counterAxisSizingMode = 'AUTO'
  row.counterAxisAlignItems = 'MIN'
  row.itemSpacing = 40 * S
  row.paddingTop = row.paddingBottom = row.paddingLeft = row.paddingRight = 0
  row.fills = []
  row.clipsContent = false
  section.appendChild(row)

  /** Wrap a header + column body into one vertical container. */
  function makeColumnWithHeader(title: string, width: number): { wrapper: FrameNode; body: FrameNode } {
    const wrapper = figma.createFrame()
    wrapper.name = `${title} Column`
    wrapper.layoutMode = 'VERTICAL'
    wrapper.primaryAxisSizingMode = 'AUTO'
    wrapper.counterAxisSizingMode = 'FIXED'
    wrapper.counterAxisAlignItems = 'MIN'
    wrapper.itemSpacing = 8 * S
    wrapper.fills = []
    wrapper.clipsContent = false
    wrapper.resize(width, 100)

    const header = makeColumnHeader(title, width)
    wrapper.appendChild(header)
    try { (header as any).layoutAlign = 'STRETCH' } catch (_) {}

    const body = makeColumnFrame(title, width)
    wrapper.appendChild(body)
    try { (body as any).layoutAlign = 'STRETCH' } catch (_) {}

    return { wrapper, body }
  }

  const colW = 400 * S
  const designW = 1200 * S
  const uploadsW = 280 * S

  const { wrapper: briefingWrapper, body: briefingCol } = makeColumnWithHeader('Briefing', colW)
  row.appendChild(briefingWrapper)

  // Name EXP header block (dark)
  const nameBlock = makeBlockFrame()
  nameBlock.fills = [solidPaint(0.25, 0.25, 0.27)]
  const nameText = makeTextNode('Name EXP', 'EXP-NAME', font)
  nameText.setPluginData('heimdallId', 'heimdall:exp_name')
  nameText.setPluginData('placeholderId', 'heimdall:exp_name')
  applyTextColor(nameText, 1, 1, 1)
  appendAndStretch(nameBlock, nameText)
  appendAndStretch(briefingCol, nameBlock)

  // Single flexible "Briefing Content" block ÔÇö full body from Monday doc (IDEA through Testing/Notes)
  const briefingContentPlaceholder = [
    'IDEA:',
    'Your core creative idea.',
    '',
    'WHY:',
    'Strategic rationale.',
    '',
    'AUDIENCE/REGION:',
    'Target audience and region.',
    '',
    'SEGMENT: ALL',
    '',
    'FORMATS:',
    'e.g. Static, Video, Carousel.',
    '',
    'VARIANTS: 4',
    '',
    'Product:',
    'Product context.',
    '',
    'Visual:',
    'Visual direction.',
    '',
    'Copy info:',
    'Copy tone and CTAs.',
    '',
    'Note: -',
    '',
    'Test: -',
  ].join('\n')
  const briefingContentBlock = makeBlockFrame()
  briefingContentBlock.fills = [solidPaint(0.96, 0.97, 0.99)]
  const briefingContentText = makeTextNode('Briefing Content', briefingContentPlaceholder, font)
  appendAndStretch(briefingContentBlock, briefingContentText)
  appendAndStretch(briefingCol, briefingContentBlock)

  // VARIANTS section header (dark)
  const variantsHeaderBlock = makeBlockFrame()
  variantsHeaderBlock.fills = [solidPaint(0.25, 0.25, 0.27)]
  const variantsHeaderText = makeTextNode('VARIANTS', 'VARIANTS', font)
  applyTextColor(variantsHeaderText, 1, 1, 1)
  appendAndStretch(variantsHeaderBlock, variantsHeaderText)
  appendAndStretch(briefingCol, variantsHeaderBlock)

  const variantPlaceholder = (letter: string) =>
    `${letter} - Image\nInput visual + copy direction:\nScript:`
  for (const letter of ['A', 'B', 'C', 'D']) {
    const block = makeBlockFrame()
    const text = makeTextNode(`${letter} - Image`, variantPlaceholder(letter), font)
    appendAndStretch(block, text)
    appendAndStretch(briefingCol, block)
  }

  const { wrapper: copyWrapper, body: copyCol } = makeColumnWithHeader('Copy', colW)
  row.appendChild(copyWrapper)
  let copyBlock = makeBlockFrame()
  for (const letter of ['A', 'B', 'C', 'D']) {
    const varFrame = figma.createFrame()
    varFrame.name = `Variation ${letter}`
    varFrame.layoutMode = 'VERTICAL'
    varFrame.primaryAxisSizingMode = 'AUTO'
    varFrame.counterAxisSizingMode = 'FIXED'
    varFrame.itemSpacing = 10 * S
    varFrame.paddingTop = varFrame.paddingBottom = varFrame.paddingLeft = varFrame.paddingRight = 12 * S
    varFrame.fills = [{ type: 'SOLID', color: { r: 0.92, g: 0.92, b: 0.94 } }]
    varFrame.resize(colW, 100)
    varFrame.clipsContent = false
    appendAndStretch(copyCol, varFrame)
    let b = makeBlockFrame()
    appendAndStretch(varFrame, b)
    appendAndStretch(b, makeTextNode(`Variation ${letter}`, `Variation ${letter}`, font))
    b = makeBlockFrame()
    appendAndStretch(varFrame, b)
    appendAndStretch(b, makeTextNode('in design copy', 'in design copy', font))
    for (const field of ['headline:', 'subline:', 'CTA:', 'Note:']) {
      b = makeBlockFrame()
      appendAndStretch(varFrame, b)
      appendAndStretch(b, makeTextNode(field, field, font))
    }
  }

  const { wrapper: designWrapper, body: designCol } = makeColumnWithHeader('Design', designW)
  row.appendChild(designWrapper)
  let designBlock = makeBlockFrame()
  const sizes = ['9x16', '4x5', '1x1']
  for (const letter of ['A', 'B', 'C', 'D']) {
    const varFrame = figma.createFrame()
    varFrame.name = `Variation ${letter}`
    varFrame.layoutMode = 'VERTICAL'
    varFrame.primaryAxisSizingMode = 'AUTO'
    varFrame.counterAxisSizingMode = 'FIXED'
    varFrame.itemSpacing = 12 * S
    varFrame.paddingTop = varFrame.paddingBottom = varFrame.paddingLeft = varFrame.paddingRight = 12 * S
    varFrame.fills = []
    varFrame.resize(designW, 100)
    varFrame.clipsContent = false
    appendAndStretch(designCol, varFrame)
    const assetRow = figma.createFrame()
    assetRow.name = 'Assets'
    assetRow.layoutMode = 'HORIZONTAL'
    assetRow.primaryAxisSizingMode = 'AUTO'
    assetRow.counterAxisSizingMode = 'AUTO'
    assetRow.itemSpacing = 12 * S
    assetRow.fills = []
    assetRow.clipsContent = false
    appendAndStretch(varFrame, assetRow)
    for (const size of sizes) {
      const dim = ASSET_SIZES[size] ?? { w: 1440, h: 1440 }
      const f = figma.createFrame()
      f.name = 'NAME-EXP-' + size
      f.resize(dim.w, dim.h)
      f.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }]
      assetRow.appendChild(f)
    }
  }

  // Right-side Uploads column removed. References are now rendered in a
  // dedicated frame below the main briefing panel.

  // References: column with dark header matching Briefing/Copy/Design,
  // positioned to the left of the main layout so images don't alter columns.
  const { wrapper: referencesWrapper, body: referencesBody } = makeColumnWithHeader('References', uploadsW)
  referencesBody.name = 'References'
  templatePage.appendChild(referencesWrapper)
  referencesWrapper.x = section.x - uploadsW - 24 * S
  // Align with the Columns row top (after section padding) so References
  // sits level with Briefing/Copy/Design, not offset by the section padding.
  referencesWrapper.y = section.y + section.paddingTop

  // Apply bold styling to all template text nodes
  async function boldAllText(node: BaseNode): Promise<void> {
    if (node.type === 'TEXT') {
      await styleTemplateLabel(node as TextNode)
    }
    const c = node as { children?: readonly BaseNode[] }
    if (c.children) {
      for (const child of c.children) await boldAllText(child)
    }
  }
  await boldAllText(section)
  await boldAllText(referencesWrapper)

  await figma.setCurrentPageAsync(templatePage)
  return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to create template' }
  }
}

/** Header names that should have a status widget (Briefing, Copy, Design). */
const STATUS_HEADER_NAMES = ['Briefing Header', 'Copy Header', 'Design Header']

/**
 * Find template page (same logic as processJobs).
 */
function findTemplatePage(): PageNode | null {
  const root = figma.root
  const children = root.children || []
  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'PAGE') continue
    const pageName = (node as PageNode).name
    if (TEMPLATE_PAGE_NAMES.some((n) => pageName.indexOf(n) >= 0 || pageName === n)) {
      return node as PageNode
    }
  }
  return null
}

/**
 * Collect widget nodes from header frames. Traverses from a root (e.g. Name Briefing)
 * and returns a map: header frame name -> first WidgetNode found in that header.
 */
function findWidgetsInHeaders(root: BaseNode): Record<string, SceneNode> {
  const map: Record<string, SceneNode> = {}
  function walk(node: BaseNode): void {
    if (node.type === 'FRAME' && STATUS_HEADER_NAMES.includes((node as FrameNode).name)) {
      const frame = node as FrameNode
      const kids = frame.children || []
      for (let i = 0; i < kids.length; i++) {
        const child = kids[i]
        if ((child as SceneNode).type === 'WIDGET') {
          if (!map[frame.name]) map[frame.name] = child as SceneNode
          return
        }
      }
    }
    const c = node as { children?: readonly BaseNode[] }
    if (c.children) {
      for (let i = 0; i < c.children.length; i++) walk(c.children[i])
    }
  }
  walk(root)
  return map
}

/**
 * Find header frames under content root (Name Briefing -> Columns -> * Column -> * Header).
 * Returns a map: header name -> FrameNode.
 */
function findHeaderFrames(contentRoot: BaseNode): Record<string, FrameNode> {
  const map: Record<string, FrameNode> = {}
  function walk(node: BaseNode): void {
    if (node.type === 'FRAME' && STATUS_HEADER_NAMES.includes((node as FrameNode).name)) {
      map[(node as FrameNode).name] = node as FrameNode
      return
    }
    const c = node as { children?: readonly BaseNode[] }
    if (c.children) {
      for (let i = 0; i < c.children.length; i++) walk(c.children[i])
    }
  }
  walk(contentRoot)
  return map
}

/**
 * Remove old Heimdall status chip instances from a header (nodes named "* Status").
 */
function removeOldStatusChips(header: FrameNode): void {
  const kids = [...(header.children || [])]
  for (const child of kids) {
    if (child.type === 'INSTANCE' && child.name.endsWith(' Status')) {
      child.remove()
    }
  }
}

/**
 * Check if a header already has a widget (already migrated).
 */
function headerHasWidget(header: FrameNode): boolean {
  const kids = header.children || []
  for (let i = 0; i < kids.length; i++) {
    if ((kids[i] as SceneNode).type === 'WIDGET') return true
  }
  return false
}

export interface MigrateStatusWidgetsResult {
  error?: string
  pagesMigrated: number
  pagesSkipped: number
  pagesFailed: number
}

/**
 * Migrate status widgets from template to existing briefing pages.
 * Removes old Heimdall Status Chip instances and appends cloned widget from template.
 */
async function migrateStatusWidgets(): Promise<MigrateStatusWidgetsResult> {
  const result: MigrateStatusWidgetsResult = { pagesMigrated: 0, pagesSkipped: 0, pagesFailed: 0 }
  const templatePage = findTemplatePage()
  if (!templatePage) {
    result.error = 'No template page found.'
    return result
  }
  if (typeof (templatePage as any).loadAsync === 'function') {
    try {
      await (templatePage as any).loadAsync()
    } catch (_) {}
  }
  const nameBriefing = templatePage.children?.find(
    (c) => c.type === 'FRAME' && (c as FrameNode).name === 'Name Briefing'
  ) as FrameNode | undefined
  if (!nameBriefing) {
    result.error = 'Template has no "Name Briefing" frame.'
    return result
  }
  const templateWidgets = findWidgetsInHeaders(nameBriefing)
  const headerNamesWithWidget = Object.keys(templateWidgets)
  if (headerNamesWithWidget.length === 0) {
    result.error =
      "No widgets found on template headers. Please add the 'Custom Labels - Status Tracker' widget to the Briefing, Copy, and Design headers first."
    return result
  }
  const root = figma.root
  const briefingPages: PageNode[] = []
  for (let i = 0; i < root.children.length; i++) {
    const node = root.children[i]
    if (node.type !== 'PAGE') continue
    const page = node as PageNode
    const mondayId = page.getPluginData('heimdallMondayItemId')
    if (!mondayId || mondayId === '') continue
    briefingPages.push(page)
  }
  for (const page of briefingPages) {
    if (typeof (page as any).loadAsync === 'function') {
      try {
        await (page as any).loadAsync()
      } catch (_) {}
    }
    let contentRoot: BaseNode | null = null
    for (let ci = 0; ci < page.children.length; ci++) {
      const child = page.children[ci]
      if (child.type === 'FRAME' && (child as FrameNode).name === 'Name Briefing') {
        contentRoot = child
        break
      }
    }
    if (!contentRoot) {
      result.pagesSkipped++
      continue
    }
    const headers = findHeaderFrames(contentRoot)
    let didMigrate = false
    let failed = false
    for (const headerName of STATUS_HEADER_NAMES) {
      const templateWidget = templateWidgets[headerName]
      const targetHeader = headers[headerName]
      if (!targetHeader || !templateWidget) continue
      if (headerHasWidget(targetHeader)) {
        continue
      }
      removeOldStatusChips(targetHeader)
      try {
        const cloned = (templateWidget as any).clone()
        if (cloned && targetHeader.appendChild) {
          targetHeader.appendChild(cloned)
          didMigrate = true
        }
      } catch (_) {
        failed = true
      }
    }
    if (failed) result.pagesFailed++
    else if (didMigrate) result.pagesMigrated++
    else result.pagesSkipped++
  }

  // Clean up the legacy "_Heimdall Components" utility page (no longer needed)
  for (let i = root.children.length - 1; i >= 0; i--) {
    const node = root.children[i]
    if (node.type === 'PAGE' && (node as PageNode).name === '_Heimdall Components') {
      node.remove()
      break
    }
  }

  return result
}

// =====================================================
// Fix Layouts: batch-repair existing imported pages
// =====================================================

interface FixLayoutsResult {
  error?: string
  pagesFixed: number
  pagesSkipped: number
}

/** Detect whether a page uses the Heimdall template structure. */
function isHeimdallTemplatePage(page: PageNode): boolean {
  const nameBriefing = page.children.find(
    (c) => c.type === 'FRAME' && (c as FrameNode).name === 'Name Briefing'
  ) as FrameNode | undefined
  if (!nameBriefing) return false
  const hasColumnsRow = nameBriefing.children.some(
    (c) => c.type === 'FRAME' && (c as FrameNode).name === 'Columns'
  )
  return hasColumnsRow
}

/**
 * Fix layout issues on all non-template Heimdall pages: re-anchor References,
 * lock header widths, ensure hug-content, stretch children, and correct asset ratios.
 */
async function fixLayouts(): Promise<FixLayoutsResult> {
  const result: FixLayoutsResult = { pagesFixed: 0, pagesSkipped: 0 }
  const root = figma.root
  try {
    await figma.loadFontAsync(TEMPLATE_FONT)
    await figma.loadFontAsync(TEMPLATE_FONT_BOLD)
  } catch (_) {}

  for (let i = 0; i < root.children.length; i++) {
    const node = root.children[i]
    if (node.type !== 'PAGE') continue
    const page = node as PageNode
    if (TEMPLATE_PAGE_NAMES.some((n) => page.name.indexOf(n) >= 0 || page.name === n)) continue

    if (typeof (page as any).loadAsync === 'function') {
      try { await (page as any).loadAsync() } catch (_) {}
    }

    if (!isHeimdallTemplatePage(page)) {
      result.pagesSkipped++
      continue
    }

    const nameBriefing = page.children.find(
      (c) => c.type === 'FRAME' && (c as FrameNode).name === 'Name Briefing'
    ) as FrameNode

    // Run normalization phases on the main layout
    const analysis: LayoutAnalysis = { framesConverted: 0, framesHugged: 0, childrenStretched: 0, skippedFrames: [] }
    await phaseFixTextNodes(nameBriefing)
    phaseEnableAutoLayout(nameBriefing, analysis)
    phaseEnsureHugContent(nameBriefing, analysis)
    analysis.childrenStretched = phaseStretchChildren(nameBriefing)
    phaseDisableClipping(nameBriefing)

    // Fix asset frame proportions inside Design column variations
    fixAssetFrameRatios(nameBriefing)

    const gap = 24 * S
    const columnsRow = nameBriefing.children.find(
      (c) => c.type === 'FRAME' && (c as FrameNode).name === 'Columns'
    ) as FrameNode | undefined

    // Widen Design Column (and its children) so the larger asset frames fit
    const targetDesignW = 1200 * S
    if (columnsRow) {
      for (let ci = 0; ci < columnsRow.children.length; ci++) {
        const col = columnsRow.children[ci]
        if (col.type === 'FRAME' && (col as FrameNode).name === 'Design Column') {
          const dc = col as FrameNode
          if (dc.width < targetDesignW) {
            dc.resize(targetDesignW, dc.height)
            for (let vi = 0; vi < dc.children.length; vi++) {
              const child = dc.children[vi]
              if (child.type === 'FRAME' && (child as FrameNode).counterAxisSizingMode === 'FIXED') {
                const cf = child as FrameNode
                if (cf.width < targetDesignW) cf.resize(targetDesignW, cf.height)
              }
            }
          }
          break
        }
      }
    }

    // Re-anchor references column
    const anchorY = columnsRow ? nameBriefing.y + columnsRow.y : nameBriefing.y

    const uploadsBody = findUploadsBody(page)
    if (uploadsBody) {
      const wrapper = uploadsBody.parent
      if (wrapper && wrapper.type === 'FRAME' && wrapper !== page) {
        const wf = wrapper as FrameNode
        wf.x = nameBriefing.x - wf.width - gap
        wf.y = anchorY
        // Run normalization on references wrapper too
        phaseEnsureHugContent(wf, analysis)
        phaseStretchChildren(wf)
        phaseDisableClipping(wf)
      }
    }

    result.pagesFixed++
  }
  return result
}

/** Walk a subtree and correct any asset frames whose dimensions have drifted. */
function fixAssetFrameRatios(node: BaseNode): void {
  if (node.type === 'FRAME') {
    const frame = node as FrameNode
    const name = frame.name

    // Fix Assets rows: hug height, disable clipping, enforce canonical order
    if (name === 'Assets' && frame.layoutMode === 'HORIZONTAL') {
      if (frame.counterAxisSizingMode !== 'AUTO') {
        frame.counterAxisSizingMode = 'AUTO'
      }
      frame.clipsContent = false

      // Reorder children to match canonical size order: 9x16, 4x5, 1x1
      const CANONICAL_ORDER = ['9x16', '4x5', '1x1']
      const kids = [...frame.children] as SceneNode[]
      const sorted = kids.slice().sort((a, b) => {
        const aKey = CANONICAL_ORDER.findIndex((k) => a.name.toLowerCase().endsWith(k))
        const bKey = CANONICAL_ORDER.findIndex((k) => b.name.toLowerCase().endsWith(k))
        return (aKey === -1 ? 99 : aKey) - (bKey === -1 ? 99 : bKey)
      })
      for (let si = 0; si < sorted.length; si++) {
        frame.insertChild(si, sorted[si])
      }
    }

    const nameLower = name.toLowerCase()
    for (const [key, dim] of Object.entries(ASSET_SIZES)) {
      if (nameLower.endsWith(key.toLowerCase())) {
        if (Math.abs(frame.width - dim.w) > 1 || Math.abs(frame.height - dim.h) > 1) {
          frame.resize(dim.w, dim.h)
        }
        return
      }
    }
  }
  const container = node as { children?: readonly BaseNode[] }
  if (container.children) {
    for (const child of container.children) fixAssetFrameRatios(child)
  }
}

// =====================================================
// Smart Layout Normalization System
// =====================================================
// After content is synced from Monday, this system:
//   1. Analyzes how content is placed in the template
//   2. Ensures all text nodes auto-resize to fit content
//   3. Detects stacked frame patterns and enables auto-layout
//   4. Propagates size changes up the frame hierarchy
// Result: components scale proportionally with content,
// siblings reflow automatically, no cramming or overflow.
// =====================================================

interface LayoutAnalysis {
  textNodesFixed: number
  framesConverted: number
  framesHugged: number
  childrenStretched: number
  skippedFrames: string[]
}

/**
 * Detect whether children of a frame are arranged in a vertical stack,
 * horizontal row, or free-form (overlapping / absolute).
 */
function detectChildArrangement(frame: FrameNode): 'VERTICAL' | 'HORIZONTAL' | 'NONE' {
  const kids = frame.children.filter((c) => (c as SceneNode).visible !== false) as SceneNode[]
  if (kids.length < 2) return 'VERTICAL' // single child ├ö├Ñ├å treat as vertical

  // Check vertical stacking: each child starts at/below previous bottom
  const sortedY = [...kids].sort((a, b) => a.y - b.y)
  let vertPairs = 0
  for (let i = 1; i < sortedY.length; i++) {
    if (sortedY[i].y >= sortedY[i - 1].y + sortedY[i - 1].height - 4) vertPairs++
  }

  // Check horizontal stacking: each child starts at/after previous right edge
  const sortedX = [...kids].sort((a, b) => a.x - b.x)
  let horizPairs = 0
  for (let i = 1; i < sortedX.length; i++) {
    if (sortedX[i].x >= sortedX[i - 1].x + sortedX[i - 1].width - 4) horizPairs++
  }

  const threshold = (kids.length - 1) * 0.6
  if (vertPairs >= threshold) return 'VERTICAL'
  if (horizPairs >= threshold) return 'HORIZONTAL'
  return 'NONE'
}

/**
 * Calculate the median spacing between consecutive children along an axis.
 */
function medianChildSpacing(frame: FrameNode, dir: 'VERTICAL' | 'HORIZONTAL'): number {
  const kids = frame.children.filter((c) => (c as SceneNode).visible !== false) as SceneNode[]
  if (kids.length < 2) return 8
  const sorted = [...kids].sort((a, b) => dir === 'VERTICAL' ? a.y - b.y : a.x - b.x)
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const gap = dir === 'VERTICAL'
      ? sorted[i].y - (sorted[i - 1].y + sorted[i - 1].height)
      : sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width)
    if (gap >= 0) gaps.push(gap)
  }
  if (gaps.length === 0) return 8
  gaps.sort((a, b) => a - b)
  return Math.round(gaps[Math.floor(gaps.length / 2)])
}

/**
 * Estimate frame padding by examining child positions relative to frame bounds.
 */
function estimateFramePadding(frame: FrameNode): { top: number; left: number; bottom: number; right: number } {
  const kids = frame.children.filter((c) => (c as SceneNode).visible !== false) as SceneNode[]
  if (kids.length === 0) return { top: 0, left: 0, bottom: 0, right: 0 }
  let minX = Infinity, minY = Infinity, maxR = 0, maxB = 0
  for (const k of kids) {
    minX = Math.min(minX, k.x)
    minY = Math.min(minY, k.y)
    maxR = Math.max(maxR, k.x + k.width)
    maxB = Math.max(maxB, k.y + k.height)
  }
  return {
    top: Math.max(0, Math.round(minY)),
    left: Math.max(0, Math.round(minX)),
    bottom: Math.max(0, Math.round(frame.height - maxB)),
    right: Math.max(0, Math.round(frame.width - maxR)),
  }
}

/**
 * Should we skip this frame from auto-layout conversion?
 * Skips: asset frames (4x5), empty frames, frames without text/frame children.
 */
function shouldSkipAutoLayout(frame: FrameNode): boolean {
  const name = frame.name.toLowerCase()
  // Asset frames with ratio names (design canvases)
  if (/\d+x\d+/.test(name)) return true
  // No children
  if (!frame.children || frame.children.length === 0) return true
  // Already has auto-layout
  if (frame.layoutMode !== 'NONE') return false
  // No structural children (only rects/vectors/images)
  return !frame.children.some((c) => c.type === 'TEXT' || c.type === 'FRAME' || c.type === 'GROUP')
}

/**
 * Phase 1: Walk all text nodes and enable vertical auto-resize.
 * This lets Figma compute the actual height each text node needs.
 * Must run first so child heights are correct before frame sizing.
 */
async function phaseFixTextNodes(node: BaseNode): Promise<number> {
  let count = 0
  if (node.type === 'TEXT') {
    const tn = node as TextNode
    if (tn.characters && tn.characters.trim().length > 0 && tn.textAutoResize !== 'HEIGHT') {
      try {
        await loadFontsForTextNode(tn)
        tn.textAutoResize = 'HEIGHT'
        count++
      } catch (_) {}
    }
  }
  const container = node as { children?: readonly BaseNode[] }
  if (container.children) {
    for (const child of container.children) {
      count += await phaseFixTextNodes(child)
    }
  }
  return count
}

/**
 * Phase 2: Bottom-up auto-layout conversion.
 * For non-auto-layout frames with vertically/horizontally stacked children,
 * detect the pattern, sort children to match visual order, enable auto-layout
 * with inferred spacing and padding.
 */
function phaseEnableAutoLayout(node: BaseNode, analysis: LayoutAnalysis): void {
  const container = node as { children?: readonly BaseNode[] }
  if (container.children) {
    for (const child of container.children) {
      phaseEnableAutoLayout(child, analysis)
    }
  }
  if (node.type !== 'FRAME') return
  const frame = node as FrameNode
  if (frame.layoutMode !== 'NONE') return // already has auto-layout
  if (shouldSkipAutoLayout(frame)) {
    analysis.skippedFrames.push(frame.name)
    return
  }

  const arrangement = detectChildArrangement(frame)
  if (arrangement === 'NONE') {
    analysis.skippedFrames.push(frame.name)
    return
  }

  // Infer spacing and padding from current positions
  const spacing = medianChildSpacing(frame, arrangement)
  const padding = estimateFramePadding(frame)
  const savedWidth = frame.width
  const savedHeight = frame.height

  // Sort children to match visual order before enabling auto-layout.
  // In Figma, auto-layout flows children in array order; we need
  // that order to match the visual top├ö├Ñ├åbottom / left├ö├Ñ├åright order.
  const sorted = [...frame.children].sort((a, b) =>
    arrangement === 'VERTICAL'
      ? (a as SceneNode).y - (b as SceneNode).y
      : (a as SceneNode).x - (b as SceneNode).x
  )
  for (let i = 0; i < sorted.length; i++) {
    frame.insertChild(i, sorted[i])
  }

  // Enable auto-layout with detected settings
  frame.layoutMode = arrangement
  frame.primaryAxisSizingMode = 'AUTO'  // hug content (grows with children)
  frame.counterAxisSizingMode = 'FIXED' // keep cross-axis size
  frame.counterAxisAlignItems = 'MIN'
  frame.itemSpacing = Math.max(spacing, 4)
  frame.paddingTop = padding.top
  frame.paddingBottom = Math.max(padding.bottom, 4)
  frame.paddingLeft = padding.left
  frame.paddingRight = padding.right

  // Restore the cross-axis dimension
  if (arrangement === 'VERTICAL') {
    frame.resize(savedWidth, frame.height)
  } else {
    frame.resize(frame.width, savedHeight)
  }

  analysis.framesConverted++
}

/**
 * Phase 3: For frames already with auto-layout, ensure they hug content.
 *
 * VERTICAL frames: primaryAxis (height) = AUTO, counterAxis (width) = FIXED
 *   ├ö├Ñ├å grows vertically with children, keeps fixed column width
 * HORIZONTAL frames: primaryAxis (width) = AUTO, counterAxis (height) = AUTO
 *   ├ö├Ñ├å grows horizontally with children AND vertically to match tallest child
 *
 * This ensures the Columns row expands to show the full Briefing column.
 */
/** Column headers use HORIZONTAL layout but must keep FIXED width to fill their column. */
function isColumnHeaderFrame(frame: FrameNode): boolean {
  return frame.layoutMode === 'HORIZONTAL' && /header$/i.test(frame.name)
}

function phaseEnsureHugContent(node: BaseNode, analysis: LayoutAnalysis): void {
  if (node.type === 'FRAME') {
    const frame = node as FrameNode
    if (frame.layoutMode !== 'NONE') {
      // Column headers must stay FIXED width so they match their parent column.
      // They hug height (counter axis) only.
      if (isColumnHeaderFrame(frame)) {
        if (frame.primaryAxisSizingMode !== 'FIXED') {
          frame.primaryAxisSizingMode = 'FIXED'
          analysis.framesHugged++
        }
        if (frame.counterAxisSizingMode !== 'AUTO') {
          frame.counterAxisSizingMode = 'AUTO'
          analysis.framesHugged++
        }
      } else {
        if (frame.primaryAxisSizingMode !== 'AUTO') {
          frame.primaryAxisSizingMode = 'AUTO'
          analysis.framesHugged++
        }
        if (frame.layoutMode === 'HORIZONTAL' && frame.counterAxisSizingMode !== 'AUTO') {
          frame.counterAxisSizingMode = 'AUTO'
          analysis.framesHugged++
        }
      }
    }
  }
  const container = node as { children?: readonly BaseNode[] }
  if (container.children) {
    for (const child of container.children) {
      phaseEnsureHugContent(child, analysis)
    }
  }
}

/**
 * Phase 4: Stretch children to fill parent cross-axis.
 * In VERTICAL auto-layout frames, children should fill the parent width
 * so text blocks use the full column width instead of staying at 100px.
 * Skips asset frames (design canvases) and HORIZONTAL layout children.
 */
function phaseStretchChildren(node: BaseNode): number {
  let count = 0
  if (node.type === 'FRAME') {
    const frame = node as FrameNode
    // Only stretch in VERTICAL layouts ├ö├ç├Â makes children fill width.
    // In HORIZONTAL layouts, children keep their own width.
    if (frame.layoutMode === 'VERTICAL') {
      for (let i = 0; i < frame.children.length; i++) {
        const child = frame.children[i] as SceneNode
        // Skip asset frames (design canvases like 4x5, 9x16)
        if (/\d+x\d+/.test(child.name)) continue
        if (child.type === 'FRAME' || child.type === 'TEXT' || child.type === 'GROUP') {
          try {
            if ((child as any).layoutAlign !== 'STRETCH') {
              (child as any).layoutAlign = 'STRETCH'
              count++
            }
          } catch (_) {}
        }
      }
    }
  }
  const container = node as { children?: readonly BaseNode[] }
  if (container.children) {
    for (const child of container.children) {
      count += phaseStretchChildren(child)
    }
  }
  return count
}

/**
 * Phase 5: Disable clipsContent on structural auto-layout frames.
 * Ensures content is never hidden even during layout recalculation.
 * Skips asset frames (design canvases) that need clipping.
 */
function phaseDisableClipping(node: BaseNode): number {
  let count = 0
  if (node.type === 'FRAME') {
    const frame = node as FrameNode
    if (frame.layoutMode !== 'NONE' && frame.clipsContent) {
      // Skip asset-related frames
      if (!/\d+x\d+/.test(frame.name)) {
        frame.clipsContent = false
        count++
      }
    }
  }
  const container = node as { children?: readonly BaseNode[] }
  if (container.children) {
    for (const child of container.children) {
      count += phaseDisableClipping(child)
    }
  }
  return count
}

/** Known template label names/texts that should get bold styling when unfilled. */
const TEMPLATE_LABEL_PATTERNS = new Set([
  'briefing', 'not started', 'copy', 'design', 'uploads', 'frontify',
  'variation a', 'variation b', 'variation c', 'variation d',
  'in design copy', 'headline:', 'subline:', 'cta:', 'note:', 'variants',
  'input visual + copy direction:', 'script:',
])

/** Sub-header labels that get Bold 12px when unfilled (variant block structure). */
const TEMPLATE_SUB_LABELS = new Set(['input visual + copy direction:', 'script:'])

/**
 * Phase 6: Style unfilled template labels as Bold + larger.
 * Primary labels ├ö├Ñ├å 14px Bold; sub-headers (Input visual + copy direction:, Script:) ├ö├Ñ├å 12px Bold.
 */
async function phaseStyleTemplateLabels(node: BaseNode): Promise<number> {
  let count = 0
  if (node.type === 'TEXT') {
    const tn = node as TextNode
    const text = (tn.characters || '').trim()
    // Only style short template labels (not filled multi-line content)
    if (text.length > 0 && text.length <= 40 && !text.includes('\n')) {
      const lower = text.toLowerCase()
      if (TEMPLATE_SUB_LABELS.has(lower)) {
        await styleTemplateSubLabel(tn)
        count++
      } else if (TEMPLATE_LABEL_PATTERNS.has(lower) || /^[A-D] - (image|video|static|carousel)$/i.test(text)) {
        await styleTemplateLabel(tn)
        count++
      }
    }
  }
  const container = node as { children?: readonly BaseNode[] }
  if (container.children) {
    for (const child of container.children) {
      count += await phaseStyleTemplateLabels(child)
    }
  }
  return count
}

/**
 * Main entry: Smart Layout Normalization.
 * Six-phase process that runs after content fill to ensure
 * all components scale proportionally with their content.
 *
 * Phase 1 ├ö├ç├Â Text: auto-resize HEIGHT on all text nodes (vertical growth)
 * Phase 2 ├ö├ç├Â Frames: detect stacked patterns, enable auto-layout (bottom-up)
 * Phase 3 ├ö├ç├Â Hug: ensure all auto-layout frames grow with children (both axes)
 * Phase 4 ├ö├ç├Â Stretch: children fill parent width (no more 100px cramming)
 * Phase 5 ├ö├ç├Â Unclip: disable clipsContent so nothing is hidden
 * Phase 6 ├ö├ç├Â Style: bold template labels, sized content text
 */
async function normalizeLayout(root: BaseNode): Promise<LayoutAnalysis> {
  const analysis: LayoutAnalysis = {
    textNodesFixed: 0,
    framesConverted: 0,
    framesHugged: 0,
    childrenStretched: 0,
    skippedFrames: [],
  }

  // Phase 1: text nodes ├ö├ç├Â must be first so heights settle
  analysis.textNodesFixed = await phaseFixTextNodes(root)

  // Phase 2: bottom-up auto-layout on stacked frames
  phaseEnableAutoLayout(root, analysis)

  // Phase 3: existing auto-layout frames ├ö├Ñ├å hug content on both axes
  phaseEnsureHugContent(root, analysis)

  // Phase 4: stretch children to fill parent width
  analysis.childrenStretched = phaseStretchChildren(root)

  // Phase 5: disable clipping on structural frames
  phaseDisableClipping(root)

  // Phase 6: style unfilled template labels as bold
  await phaseStyleTemplateLabels(root)

  return analysis
}

// =====================================================
// End: Smart Layout Normalization System
// =====================================================

interface DebugEntry {
  nodeName: string
  chars: string
  path: string[]
  matched: boolean
  matchedKey?: string
}

var debugLog: DebugEntry[] = []

// =====================================================
// Image Import System
// =====================================================
// After text sync, images from Monday briefings are imported
// into the "Uploads" column of each experiment page.
// Flow: main thread ├ö├Ñ├å "fetch-images" ├ö├Ñ├å UI iframe fetches bytes
//       UI ├ö├Ñ├å "image-data" ├ö├Ñ├å main thread places in Figma
// =====================================================

/**
 * Find dedicated "Doc Images" frame on the page (below main content). Prefer this for Monday doc images so they don't affect column layout.
 */
function findDocImagesTarget(page: PageNode): FrameNode | null {
  // Direct top-level match (legacy templates)
  for (let i = 0; i < page.children.length; i++) {
    const node = page.children[i]
    if (node.type !== 'FRAME') continue
    const name = (node as FrameNode).name.toLowerCase()
    if (name === 'references' || name === 'doc images') {
      return node as FrameNode
    }
  }
  // Search one level deeper for column-wrapped structure (new template)
  for (let i = 0; i < page.children.length; i++) {
    const node = page.children[i]
    if (node.type !== 'FRAME') continue
    const frame = node as FrameNode
    for (let j = 0; j < frame.children.length; j++) {
      const child = frame.children[j]
      if (child.type !== 'FRAME') continue
      const childName = (child as FrameNode).name.toLowerCase()
      if (childName === 'references' || childName === 'doc images') {
        return child as FrameNode
      }
    }
  }
  return null
}

/**
 * Find image target frame: prefer dedicated below-layout container.
 * (References, fallback-compatible with older Doc Images)
 */
function findUploadsBody(page: PageNode): FrameNode | null {
  const docImages = findDocImagesTarget(page)
  if (docImages) return docImages
  console.warn('findUploadsBody: References/Doc Images frame not found on page', page.name)
  return null
}

/** Create a dedicated References frame on-page as last-resort fallback target. */
function createFallbackDocImagesTarget(page: PageNode): FrameNode {
  const frame = figma.createFrame()
  frame.name = 'References'
  frame.layoutMode = 'VERTICAL'
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'FIXED'
  frame.counterAxisAlignItems = 'MIN'
  frame.itemSpacing = 8 * S
  frame.paddingTop = frame.paddingBottom = 8 * S
  frame.paddingLeft = frame.paddingRight = 8 * S
  frame.fills = [solidPaint(0.97, 0.97, 0.97)]
  frame.strokes = [solidPaint(0.88, 0.89, 0.92)]
  frame.strokeWeight = Math.max(1, S / 2)
  frame.cornerRadius = 6 * S
  frame.clipsContent = false
  frame.resize(280 * S, 60 * S)

  // Place below the main Name Briefing frame when present.
  let x = 0
  let y = 0
  for (let i = 0; i < page.children.length; i++) {
    const child = page.children[i]
    if (child.type === 'FRAME' && (child as FrameNode).name === 'Name Briefing') {
      x = (child as FrameNode).x
      y = (child as FrameNode).y + (child as FrameNode).height + 24 * S
      break
    }
  }
  frame.x = x
  frame.y = y
  page.appendChild(frame)
  return frame
}

/** Figma createImage supports PNG, JPEG, GIF only. Validate by magic bytes and skip unsupported. */
function isSupportedImageFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const gif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && (bytes[3] === 0x38 || bytes[3] === 0x39)
  return png || jpeg || gif
}

/** Result of placing one image: success or failure with reason. */
type PlaceImageResult = { ok: true } | { ok: false; reason: string }

/**
 * Place a single image into the Uploads column body frame.
 * Uses actual image dimensions from getSizeAsync() to preserve aspect ratio; fits to column width.
 */
async function placeImageInUploads(
  uploadsBody: FrameNode,
  imageBytes: Uint8Array,
  imageName: string
): Promise<PlaceImageResult> {
  if (!isSupportedImageFormat(imageBytes)) {
    const reason = 'Unsupported format (use PNG/JPEG/GIF)'
    console.warn('Skipping:', imageName, reason)
    return { ok: false, reason }
  }
  try {
    const image = figma.createImage(imageBytes)
    const rect = figma.createRectangle()
    rect.name = imageName || 'Briefing Image'

    const columnWidth = uploadsBody.width > 0 ? uploadsBody.width : 260
    let thumbWidth = columnWidth
    let thumbHeight = Math.round(columnWidth * 0.6)
    try {
      const size = await image.getSizeAsync()
      if (size.width > 0 && size.height > 0) {
        const scale = columnWidth / size.width
        thumbHeight = Math.round(size.height * scale)
      }
    } catch (_) {
      // keep default aspect if getSizeAsync fails
    }
    rect.resize(thumbWidth, thumbHeight)

    rect.fills = [{
      type: 'IMAGE',
      imageHash: image.hash,
      scaleMode: 'FIT',
    }]
    rect.cornerRadius = 4

    uploadsBody.appendChild(rect)
    try { (rect as any).layoutAlign = 'STRETCH' } catch (_) {}
    return { ok: true }
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Unknown error'
    console.error('Failed to place image:', imageName, e)
    return { ok: false, reason }
  }
}

/** Result of importing images into a page: count placed and per-image failures. */
export type ImportImagesResult = { placed: number; failures: Array<{ name: string; reason: string }> }

/**
 * Import images into a page's Uploads column.
 * Called after image bytes are received from the UI iframe.
 * Caller should ensure page.loadAsync() was called for dynamic pages before this.
 */
async function importImagesToPage(
  pageId: string,
  images: Array<{ bytes: Uint8Array; name: string }>
): Promise<ImportImagesResult> {
  const failures: Array<{ name: string; reason: string }> = []
  const page = await figma.getNodeByIdAsync(pageId)
  if (!page || page.type !== 'PAGE') {
    console.warn('importImagesToPage: page not found or not a PAGE', pageId)
    return { placed: 0, failures }
  }

  let uploadsBody = findUploadsBody(page as PageNode)
  if (!uploadsBody) {
    await new Promise((r) => setTimeout(r, 500))
    uploadsBody = findUploadsBody(page as PageNode)
  }
  if (!uploadsBody) {
    uploadsBody = createFallbackDocImagesTarget(page as PageNode)
  }

  const nameBriefing = (page as PageNode).children.find((c) => c.type === 'FRAME' && (c as FrameNode).name === 'Name Briefing') as FrameNode | undefined
  if (nameBriefing) {
    const gap = 24 * S
    // Align References to the Columns row top (not Name Briefing top) so it
    // stays level with Briefing/Copy/Design and doesn't drift upward on import.
    const columnsRow = nameBriefing.children.find(
      (c) => c.type === 'FRAME' && (c as FrameNode).name === 'Columns'
    ) as FrameNode | undefined
    const anchorY = columnsRow
      ? nameBriefing.y + columnsRow.y
      : nameBriefing.y

    const wrapper = uploadsBody.parent
    if (wrapper && wrapper.type === 'FRAME' && wrapper !== page) {
      const wf = wrapper as FrameNode
      wf.x = nameBriefing.x - wf.width - gap
      wf.y = anchorY
    } else {
      uploadsBody.x = nameBriefing.x - uploadsBody.width - gap
      uploadsBody.y = anchorY
    }
  }

  const PLACEHOLDER_PATTERNS = ['frontify', 'images from monday', 'uploads placeholder', 'references placeholder']
  for (let i = uploadsBody.children.length - 1; i >= 0; i--) {
    const child = uploadsBody.children[i]
    if (child.type === 'TEXT') {
      const text = (child as TextNode).characters.toLowerCase()
      if (PLACEHOLDER_PATTERNS.some((p) => text.includes(p))) {
        child.remove()
      }
    } else if (child.type === 'FRAME') {
      const block = child as FrameNode
      let hasOnlyPlaceholder = true
      for (let j = block.children.length - 1; j >= 0; j--) {
        const nested = block.children[j]
        if (nested.type === 'TEXT') {
          const text = (nested as TextNode).characters.toLowerCase()
          if (PLACEHOLDER_PATTERNS.some((p) => text.includes(p))) {
            nested.remove()
          } else {
            hasOnlyPlaceholder = false
          }
        } else {
          hasOnlyPlaceholder = false
        }
      }
      if (hasOnlyPlaceholder && block.children.length === 0) {
        block.remove()
      }
    }
  }

  let placed = 0
  const existingImageNames = new Set<string>()
  for (let i = 0; i < uploadsBody.children.length; i++) {
    const child = uploadsBody.children[i]
    const name = (child.name || '').trim().toLowerCase()
    if (name) existingImageNames.add(name)
  }
  for (const img of images) {
    const dedupeName = (img.name || 'Briefing Image').trim().toLowerCase()
    if (existingImageNames.has(dedupeName)) {
      continue
    }
    const result = await placeImageInUploads(uploadsBody, img.bytes, img.name)
    if (result.ok) {
      placed++
      existingImageNames.add(dedupeName)
    } else {
      failures.push({ name: img.name, reason: result.reason })
    }
  }
  return { placed, failures }
}

async function processJobs(jobs: QueuedJob[]): Promise<Array<{ idempotencyKey: string; experimentPageName: string; pageId: string; fileUrl: string; error?: string }>> {
  debugLog = []
  var root = figma.root
  var children = root.children || []
  var templatePage: PageNode | null = null
  for (var i = 0; i < children.length; i++) {
    var node = children[i]
    if (node.type !== 'PAGE') continue
    var pageName = (node as PageNode).name
    for (var j = 0; j < TEMPLATE_PAGE_NAMES.length; j++) {
      if (pageName.indexOf(TEMPLATE_PAGE_NAMES[j]) >= 0 || pageName === TEMPLATE_PAGE_NAMES[j]) {
        templatePage = node as PageNode
        break
      }
    }
    if (templatePage) break
  }

  // See KNOWN CONSTRAINTS #3: dynamic pages require loadAsync() before
  // children are accessible. Without this, cloned pages have empty children.
  if (templatePage && typeof (templatePage as any).loadAsync === 'function') {
    try {
      await (templatePage as any).loadAsync()
    } catch (_) {}
  }
  if (!templatePage) {
    return jobs.map(function (job) {
      return { idempotencyKey: job.idempotencyKey, experimentPageName: job.experimentPageName, pageId: '', fileUrl: '', error: 'No template page found' }
    })
  }

  ensureCategoryPages(root, jobs)

  var fileKey = figma.fileKey || ''
  var results: Array<{ idempotencyKey: string; experimentPageName: string; pageId: string; fileUrl: string; error?: string; outcome?: string }> = []

  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i]
    try {
      var briefing = job.briefingPayload as BriefingPayload
      var targetPage: PageNode | null = null
      var createdNew = false

      // Match by Monday item ID (plugin data) first, then by name
      if (job.mondayItemId) {
        for (var e = 0; e < root.children.length; e++) {
          var existing = root.children[e]
          if (existing.type === 'PAGE' && (existing as PageNode).getPluginData('heimdallMondayItemId') === job.mondayItemId) {
            targetPage = existing as PageNode
            break
          }
        }
      }
      if (!targetPage) {
        for (var e = 0; e < root.children.length; e++) {
          var existing = root.children[e]
          if (existing.type === 'PAGE' && (existing as PageNode).name === job.experimentPageName) {
            targetPage = existing as PageNode
            break
          }
        }
      }

      if (!targetPage) {
        targetPage = templatePage.clone()
        targetPage.name = job.experimentPageName
        createdNew = true
      }

      // See KNOWN CONSTRAINTS #3: must loadAsync() before traversing cloned page.
      if (targetPage && typeof (targetPage as any).loadAsync === 'function') {
        try { await (targetPage as any).loadAsync() } catch (_) {}
      }

      targetPage.setPluginData('heimdallIdempotencyKey', job.idempotencyKey)
      targetPage.setPluginData('heimdallMondayItemId', job.mondayItemId || '')
      if (briefing.sectionName) {
        targetPage.setPluginData('heimdallSectionName', briefing.sectionName)
        // Only reposition when we just cloned the page.
        if (createdNew) {
          var allPages: PageNode[] = []
          for (var k = 0; k < root.children.length; k++) {
            if (root.children[k].type === 'PAGE') allPages.push(root.children[k] as PageNode)
          }
          var insertAt = findSectionInsertionIndex(briefing.sectionName, allPages)
          if (insertAt >= 0 && insertAt < root.children.length) {
            root.insertChild(insertAt, targetPage)
          }
        }
      }
      var hasMapping = job.nodeMapping && job.nodeMapping.length > 0
      var childCount = 0
      var wc = targetPage as { children?: readonly BaseNode[] }
      if (wc.children) childCount = wc.children.length

      debugLog.push({
        nodeName: '__PLUGIN_META__',
        chars: 'hasMapping=' + !!hasMapping + ' mappingLen=' + (job.nodeMapping ? job.nodeMapping.length : 0) + ' pageChildren=' + childCount + ' pageName=' + targetPage.name + ' createdNew=' + createdNew,
        path: [],
        matched: false,
      })

      // Scope all expensive traversal to the primary content frame only.
      // This avoids traversing hidden support nodes (e.g. status component set).
      var contentRoot: BaseNode = targetPage
      for (var ci = 0; ci < targetPage.children.length; ci++) {
        var child = targetPage.children[ci]
        if (child.type === 'FRAME' && (child as FrameNode).name === 'Name Briefing') {
          contentRoot = child
          break
        }
      }

      var usedPlaceholderFallback = false
      if (hasMapping) {
        var mappingEntries: MappingEntry[] = []
        for (var m = 0; m < job.nodeMapping!.length; m++) {
          var key = job.nodeMapping![m].nodeName
          var val = job.nodeMapping![m].value
          mappingEntries.push({
            nodeName: key,
            normalizedNodeName: normalizeTextKey(key),
            value: val,
          })
        }
        var mappedCount = await applyNodeMapping(contentRoot, mappingEntries, (job.frameRenames || []).slice())
        debugLog.push({
          nodeName: '__MAPPING_RESULT__',
          chars: 'mappedCount=' + mappedCount + ' totalEntries=' + mappingEntries.length,
          path: [],
          matched: mappedCount > 0,
        })
        await fillTextNodes(contentRoot, briefing)
        usedPlaceholderFallback = true
      } else {
        await fillTextNodes(contentRoot, briefing)
        usedPlaceholderFallback = true
      }

      // See KNOWN CONSTRAINTS #4: normalizeLayout (6 phases, 840+ node
      // visits) will hang the plugin if run after applyNodeMapping already
      // modified all text nodes. Only run it on the placeholder fallback path.
      if (!hasMapping || usedPlaceholderFallback) {
        var layoutResult = await normalizeLayout(contentRoot)
        debugLog.push({
          nodeName: '__LAYOUT_NORM__',
          chars: 'textFixed=' + layoutResult.textNodesFixed
            + ' framesConverted=' + layoutResult.framesConverted
            + ' framesHugged=' + layoutResult.framesHugged
            + ' stretched=' + layoutResult.childrenStretched
            + ' skipped=[' + layoutResult.skippedFrames.slice(0, 5).join(', ') + ']',
          path: [],
          matched: true,
        })
      }

      var pageId = targetPage.id
      var fileUrl = 'https://www.figma.com/file/' + fileKey + '?node-id=' + encodeURIComponent(pageId.replace(':', '-'))
      var outcome = createdNew ? 'created' : 'updated'
      results.push({ idempotencyKey: job.idempotencyKey, experimentPageName: job.experimentPageName, pageId: pageId, fileUrl: fileUrl, outcome: outcome })
    } catch (e) {
      var errMsg = e instanceof Error ? e.message : 'Unknown error'
      results.push({ idempotencyKey: job.idempotencyKey, experimentPageName: job.experimentPageName, pageId: '', fileUrl: '', error: errMsg })
    }
  }

  return results
}

// --- UI HTML (inline) ---
// UI does all HTTP fetching; main thread does Figma operations
var uiHtml = '<html><head><style>'
  + 'body{font-family:Inter,sans-serif;padding:12px;margin:0;}'
  + 'h3{margin:0 0 8px 0;font-size:13px;}'
  + '.tabs{display:flex;gap:0;margin:0 0 10px 0;border-bottom:1px solid #ddd;}'
  + '.tab{width:auto!important;padding:8px 12px;border:none!important;border-radius:0!important;border-bottom:2px solid transparent!important;background:transparent!important;color:#666!important;cursor:pointer;font-size:11px;font-weight:600;}'
  + '.tab:hover{background:#f6f7f9!important;color:#222!important;}'
  + '.tab.active{background:transparent!important;color:#111!important;border-bottom-color:#0d99ff!important;}'
  + '.row{display:flex;gap:8px;align-items:center;margin:8px 0;}'
  + '.label{font-size:11px;color:#555;min-width:68px;}'
  + 'input{flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:11px;}'
  + 'button{padding:8px 16px;background:#0d99ff;color:#fff;border:none;border-radius:6px;cursor:pointer;width:100%;font-size:12px;}'
  + 'button:hover{background:#0b85e0;}'
  + '.secondary{background:#fff;color:#333;border:1px solid #ddd;width:auto;padding:6px 10px;}'
  + '.secondary:hover{background:#f6f6f6;}'
  + '.outlined{background:transparent;color:#0d99ff;border:1.5px solid #0d99ff;}'
  + '.outlined:hover{background:rgba(13,153,255,0.06);}'
  + '.btn-row{display:flex;gap:8px;margin-top:8px;}'
  + '.btn-row button{flex:1;}'
  + '.small-row{display:flex;gap:8px;margin-top:6px;}'
  + '.small-row button{flex:1;padding:5px 8px;font-size:10px;background:#fff;color:#555;border:1px solid #ddd;}'
  + '.small-row button:hover{background:#f4f4f4;color:#333;}'
  + '#msg{font-size:11px;color:#666;margin-top:8px;min-height:20px;}'
  + '.err{color:#f24822;}'
  + '.list{list-style:none;padding:0;margin:8px 0;max-height:220px;overflow-y:auto;}'
  + '.list li{padding:6px 8px;margin:2px 0;background:#f6f6f6;border-radius:4px;font-size:11px;display:flex;justify-content:space-between;align-items:center;border-left:3px solid transparent;}'
  + '.list li.new{border-left-color:#0d99ff;background:#f6f6f6;}'
  + '.list li.synced{border-left-color:#0fa958;background:linear-gradient(90deg,#e8f5e9 0%,#f1f8f2 100%);color:#666;}'
  + '.badge{font-size:9px;padding:2px 6px;border-radius:4px;background:#0d99ff;color:#fff;white-space:nowrap;}'
  + '.badge.synced{background:#0fa958;}'
  + '.badge.new{background:#888;}'
  + 'select{padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:11px;min-width:140px;}'
  + '.list li label{display:flex;align-items:center;gap:6px;flex:1;cursor:pointer;min-width:0;}'
  + '.list li label input[type=checkbox]{margin:0;flex-shrink:0;}'
  + '.list li label span.item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
  + '.list li .badge-group{display:flex;align-items:center;gap:4px;flex-shrink:0;}'
  + '.overwrite-btn{background:none;border:none;padding:2px 4px;cursor:pointer;font-size:11px;color:#999;width:auto;}'
  + '.overwrite-btn:hover{color:#f24822;}'
  + '.overwrite-btn.active{color:#f24822;font-weight:600;}'
  + '.select-bar{display:flex;justify-content:space-between;align-items:center;margin:4px 0;font-size:10px;color:#666;}'
  + '.select-bar a{color:#0d99ff;cursor:pointer;text-decoration:none;font-size:10px;}'
  + '.select-bar a:hover{text-decoration:underline;}'
  + '.list li.exists{border-left-color:#f5a623;background:linear-gradient(90deg,#fef9ef 0%,#fefcf6 100%);}'
  + '.badge.exists{background:#f5a623;}'
  + '</style></head><body>'
  + '<div class="tabs"><button class="tab active" id="tab-sync">Sync Briefings</button><button class="tab" id="tab-comments">Export Comments</button></div>'
  + '<h3>Heimdall Sync</h3>'
  + '<div class="row"><span class="label">API base</span><input id="api-base" placeholder="http://localhost:3846" /><button class="secondary" id="save-api">Save</button></div>'
  + '<div id="sync-panel">'
  + '  <div id="batch-select-wrap" style="display:none;"><span class="label">Batch</span><select id="batch-select"></select><button class="secondary" id="batch-apply">Apply</button></div>'
  + '  <p id="batch-label" style="margin:4px 0;font-size:12px;font-weight:600;"></p>'
  + '  <ul id="briefings-list" class="list"></ul>'
  + '  <p id="msg" style="margin:8px 0;min-height:20px;font-size:11px;color:#666;"></p>'
  + '  <div class="btn-row"><button id="sync">Sync</button><button id="create-template" class="outlined">Create Template</button></div>'
  + '  <div class="small-row"><button id="migrate-widgets">Migrate Status Widgets</button><button id="fix-layouts">Fix Layouts</button></div>'
  + '</div>'
  + '<script>'
  + 'parent.postMessage({ pluginMessage: { type: "ui-boot" } }, "*");'
  + 'window.onerror = function(message, source, lineno, colno) {'
  + '  parent.postMessage({ pluginMessage: { type: "ui-script-error", message: String(message || ""), source: String(source || ""), lineno: Number(lineno || 0), colno: Number(colno || 0) } }, "*");'
  + '};'
  + 'window.addEventListener("unhandledrejection", function(ev) {'
  + '  var reason = ev && ev.reason ? (ev.reason.message || String(ev.reason)) : "unknown";'
  + '  parent.postMessage({ pluginMessage: { type: "ui-script-rejection", reason: String(reason) } }, "*");'
  + '});'
  + 'var DEFAULT_HEIMDALL_API = "http://localhost:3846";'
  + 'var HEIMDALL_API = DEFAULT_HEIMDALL_API;'
  + 'var fileKey = "";'
  + 'var fileName = "";'
  + 'var isSyncing = false;'
  + 'var currentBriefings = [];'
  + 'var queuedJobIds = [];'
  + 'var existingPageNames = [];'
  + 'var existingPageNameSet = {};'
  + 'var existingMondayItemIdSet = {};'
  + 'function sanitizeApiBase(raw) {'
  + '  var v = (raw || "").trim();'
  + '  if (!v) return DEFAULT_HEIMDALL_API;'
  + '  return v.replace(/\\/$/, "");'
  + '}'
  + 'function setApiBase(raw) {'
  + '  HEIMDALL_API = sanitizeApiBase(raw);'
  + '  var input = document.getElementById("api-base");'
  + '  if (input) input.value = HEIMDALL_API;'
  + '}'
  + 'function requestJson(url, options) {'
  + '  return fetch(url, options).then(function(r) {'
  + '    var status = r.status;'
  + '    var contentType = (r.headers.get("content-type") || "").toLowerCase();'
  + '    return r.text().then(function(t) {'
  + '      var raw = t || "";'
  + '      var parsed = null;'
  + '      if (raw) {'
  + '        try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }'
  + '      }'
  + '      if (!r.ok) {'
  + '        var err = parsed && (parsed.error || parsed.reason) ? (parsed.error || parsed.reason) : ("HTTP " + status);'
  + '        throw new Error(err + " @ " + url);'
  + '      }'
  + '      if (parsed !== null) return parsed;'
  + '      var preview = raw.slice(0, 80).replace(/\\s+/g, " ");'
  + '      throw new Error("Expected JSON but got non-JSON response @ " + url + " (status " + status + ", content-type: " + contentType + ", body: " + preview + ")");'
  + '    });'
  + '  });'
  + '}'
  + 'document.getElementById("save-api").onclick = function() {'
  + '  var input = document.getElementById("api-base");'
  + '  setApiBase(input ? input.value : "");'
  + '  parent.postMessage({ pluginMessage: { type: "save-api-base", apiBase: HEIMDALL_API } }, "*");'
  + '  document.getElementById("msg").textContent = "Saved API base: " + HEIMDALL_API;'
  + '  document.getElementById("msg").className = "";'
  + '};'
  + 'document.getElementById("tab-comments").onclick = function() {'
  + '  parent.postMessage({ pluginMessage: { type: "open-export-comments" } }, "*");'
  + '};'
  + 'document.getElementById("create-template").onclick = function() {'
  + '  document.getElementById("msg").textContent = "Creating template...";'
  + '  document.getElementById("msg").className = "";'
  + '  parent.postMessage({ pluginMessage: { type: "create-template" } }, "*");'
  + '};'
  + 'document.getElementById("migrate-widgets").onclick = function() {'
  + '  document.getElementById("msg").textContent = "Migrating status widgets...";'
  + '  document.getElementById("msg").className = "";'
  + '  parent.postMessage({ pluginMessage: { type: "migrate-widgets" } }, "*");'
  + '};'
  + 'document.getElementById("fix-layouts").onclick = function() {'
  + '  document.getElementById("msg").textContent = "Fixing layouts...";'
  + '  document.getElementById("msg").className = "";'
  + '  parent.postMessage({ pluginMessage: { type: "fix-layouts" } }, "*");'
  + '};'
  + 'function normalizeBriefingName(name) {'
  + '  return String(name || "").toLowerCase().replace(/\\s+/g, " ").trim();'
  + '}'
  + 'function rebuildExistingLookupSets(existingMondayItemIds) {'
  + '  existingPageNameSet = {};'
  + '  for (var i = 0; i < existingPageNames.length; i++) {'
  + '    var normalizedPage = normalizeBriefingName(existingPageNames[i]);'
  + '    if (normalizedPage) existingPageNameSet[normalizedPage] = true;'
  + '  }'
  + '  existingMondayItemIdSet = {};'
  + '  for (var j = 0; j < existingMondayItemIds.length; j++) {'
  + '    var id = String(existingMondayItemIds[j] || "").trim();'
  + '    if (id) existingMondayItemIdSet[id] = true;'
  + '  }'
  + '}'
  + 'function briefingExistsInFigma(item) {'
  + '  var itemId = item && item.id != null ? String(item.id).trim() : "";'
  + '  if (itemId && existingMondayItemIdSet[itemId]) return true;'
  + '  var needle = normalizeBriefingName(item && item.name ? item.name : "");'
  + '  if (!needle) return false;'
  + '  return !!existingPageNameSet[needle];'
  + '}'
  + 'function updateSyncBtnCount() {'
  + '  var checked = document.querySelectorAll("#briefings-list input[type=checkbox]:checked");'
  + '  var btn = document.getElementById("sync");'
  + '  btn.textContent = checked.length > 0 ? "Sync " + checked.length + " briefing(s)" : "Sync";'
  + '  btn.disabled = checked.length === 0;'
  + '}'
  + 'function showBriefings(data) {'
  + '  currentBriefings = data.items || [];'
  + '  var listEl = document.getElementById("briefings-list");'
  + '  listEl.innerHTML = "";'
  + '  var batchLabel = document.getElementById("batch-label");'
  + '  batchLabel.textContent = data.batchLabel ? (data.batchLabel + " (" + currentBriefings.length + ")") : "";'
  + '  var selectBar = document.getElementById("select-bar");'
  + '  if (!selectBar) {'
  + '    selectBar = document.createElement("div");'
  + '    selectBar.id = "select-bar";'
  + '    selectBar.className = "select-bar";'
  + '    listEl.parentNode.insertBefore(selectBar, listEl);'
  + '  }'
  + '  selectBar.innerHTML = "<span></span><span><a id=\\"select-all\\">Select all</a> | <a id=\\"deselect-all\\">Deselect all</a></span>";'
  + '  for (var i = 0; i < currentBriefings.length; i++) {'
  + '    var it = currentBriefings[i];'
  + '    var exists = briefingExistsInFigma(it);'
  + '    it._exists = exists;'
  + '    it._overwrite = false;'
  + '    var li = document.createElement("li");'
  + '    li.className = exists ? "exists" : (it.syncState || "new");'
  + '    li.setAttribute("data-idx", String(i));'
  + '    var lbl = document.createElement("label");'
  + '    var cb = document.createElement("input");'
  + '    cb.type = "checkbox";'
  + '    cb.checked = !exists;'
  + '    cb.disabled = exists;'
  + '    cb.setAttribute("data-idx", String(i));'
  + '    cb.onchange = function() { updateSyncBtnCount(); };'
  + '    lbl.appendChild(cb);'
  + '    var nameSpan = document.createElement("span");'
  + '    nameSpan.className = "item-name";'
  + '    nameSpan.textContent = it.name;'
  + '    lbl.appendChild(nameSpan);'
  + '    li.appendChild(lbl);'
  + '    var badgeGroup = document.createElement("span");'
  + '    badgeGroup.className = "badge-group";'
  + '    if (exists) {'
  + '      var owBtn = document.createElement("button");'
  + '      owBtn.className = "overwrite-btn";'
  + '      owBtn.title = "Enable overwrite";'
  + '      owBtn.textContent = "\\u21bb";'
  + '      owBtn.setAttribute("data-idx", String(i));'
  + '      owBtn.onclick = (function(idx, owBtnRef, cbRef) { return function(e) {'
  + '        e.preventDefault();'
  + '        var item = currentBriefings[idx];'
  + '        item._overwrite = !item._overwrite;'
  + '        owBtnRef.className = item._overwrite ? "overwrite-btn active" : "overwrite-btn";'
  + '        cbRef.disabled = !item._overwrite;'
  + '        if (item._overwrite) { cbRef.checked = true; } else { cbRef.checked = false; }'
  + '        updateSyncBtnCount();'
  + '      }; })(i, owBtn, cb);'
  + '      badgeGroup.appendChild(owBtn);'
  + '    }'
  + '    var badge = document.createElement("span");'
  + '    badge.className = "badge " + (exists ? "exists" : (it.syncState === "synced" ? "synced" : "new"));'
  + '    badge.textContent = exists ? "Exists" : (it.syncState === "synced" ? "\\u2713 Synced" : "New");'
  + '    badgeGroup.appendChild(badge);'
  + '    li.appendChild(badgeGroup);'
  + '    listEl.appendChild(li);'
  + '  }'
  + '  document.getElementById("select-all").onclick = function() {'
  + '    var cbs = listEl.querySelectorAll("input[type=checkbox]");'
  + '    for (var j = 0; j < cbs.length; j++) { if (!cbs[j].disabled) cbs[j].checked = true; }'
  + '    updateSyncBtnCount();'
  + '  };'
  + '  document.getElementById("deselect-all").onclick = function() {'
  + '    var cbs = listEl.querySelectorAll("input[type=checkbox]");'
  + '    for (var j = 0; j < cbs.length; j++) { cbs[j].checked = false; }'
  + '    updateSyncBtnCount();'
  + '  };'
  + '  updateSyncBtnCount();'
  + '  document.getElementById("msg").textContent = currentBriefings.length === 0 ? "No briefings match this batch and filters." : "";'
  + '  document.getElementById("msg").className = "";'
  + '}'
  + 'function fetchBriefings(selectedBatch) {'
  + '  document.getElementById("msg").textContent = "Loading briefings...";'
  + '  document.getElementById("msg").className = "";'
  + '  var body = { fileName: fileName, fileKey: fileKey };'
  + '  if (selectedBatch) body.batch = selectedBatch;'
  + '  requestJson(HEIMDALL_API + "/api/plugin/briefings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })'
  + '    .then(function(data) {'
  + '      if (data.needsBatchSelection && data.availableBatches && data.availableBatches.length > 0) {'
  + '        document.getElementById("batch-select-wrap").style.display = "flex";'
  + '        document.getElementById("batch-select-wrap").className = "row";'
  + '        var sel = document.getElementById("batch-select");'
  + '        sel.innerHTML = "";'
  + '        var labels = data.batchLabels || data.availableBatches;'
  + '        for (var i = 0; i < data.availableBatches.length; i++) {'
  + '          var opt = document.createElement("option");'
  + '          opt.value = data.availableBatches[i];'
  + '          opt.textContent = labels[i] || data.availableBatches[i];'
  + '          sel.appendChild(opt);'
  + '        }'
  + '        document.getElementById("batch-label").textContent = "";'
  + '        document.getElementById("briefings-list").innerHTML = "";'
  + '        document.getElementById("msg").textContent = "Select a batch to show briefings.";'
  + '        return;'
  + '      }'
  + '      document.getElementById("batch-select-wrap").style.display = "none";'
  + '      if (data.error) { document.getElementById("msg").textContent = data.error; document.getElementById("msg").className = "err"; return; }'
  + '      showBriefings(data);'
  + '    })'
  + '    .catch(function(e) {'
  + '      document.getElementById("msg").textContent = "Error: " + e.message;'
  + '      document.getElementById("msg").className = "err";'
  + '    });'
  + '}'
  + 'document.getElementById("batch-apply").onclick = function() {'
  + '  var sel = document.getElementById("batch-select");'
  + '  fetchBriefings(sel && sel.value ? sel.value : null);'
  + '};'
  + 'document.getElementById("sync").onclick = function() {'
  + '  if (isSyncing) return;'
  + '  if (currentBriefings.length === 0) {'
  + '    document.getElementById("msg").textContent = "No briefings loaded yet. Wait for load or check API base/filters.";'
  + '    document.getElementById("msg").className = "err";'
  + '    return;'
  + '  }'
  + '  isSyncing = true;'
  + '  document.getElementById("msg").textContent = "Queueing briefings...";'
  + '  document.getElementById("sync").disabled = true;'
  + '  var cbs = document.querySelectorAll("#briefings-list input[type=checkbox]:checked");'
  + '  var selectedIdxs = [];'
  + '  for (var ci = 0; ci < cbs.length; ci++) selectedIdxs.push(parseInt(cbs[ci].getAttribute("data-idx"), 10));'
  + '  var items = selectedIdxs.map(function(idx){ var it = currentBriefings[idx]; return { id: it.id, name: it.name, batch: it.batch }; });'
  + '  if (items.length === 0) {'
  + '    document.getElementById("msg").textContent = "No briefings selected.";'
  + '    isSyncing = false;'
  + '    document.getElementById("sync").disabled = false;'
  + '    return;'
  + '  }'
  + '  requestJson(HEIMDALL_API + "/api/plugin/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileKey: fileKey || "", fileName: fileName || "", items: items }) })'
  + '    .then(function(data) {'
  + '      if (data.error) { document.getElementById("msg").textContent = data.error; document.getElementById("msg").className = "err"; isSyncing = false; document.getElementById("sync").disabled = false; return; }'
  + '      queuedJobIds = (data.jobs || []).map(function(j){ return j.id; });'
  + '      document.getElementById("msg").textContent = "Queued " + (data.queued || 0) + ". Fetching jobs...";'
  + '      var q = "";'
  + '      if (queuedJobIds.length > 0) q = "ids=" + queuedJobIds.map(function(id){ return encodeURIComponent(id); }).join(",");'
  + '      else if (fileKey) q = "fileKey=" + encodeURIComponent(fileKey);'
  + '      else if (items.length > 0 && items[0].batch) q = "batch=" + encodeURIComponent(items[0].batch);'
  + '      return requestJson(HEIMDALL_API + "/api/jobs/queued" + (q ? ("?" + q) : ""));'
  + '    })'
  + '    .then(function(data2) {'
  + '      var jobs = (data2 && data2.jobs) ? data2.jobs : [];'
  + '      if (jobs.length === 0) { document.getElementById("msg").textContent = "No jobs returned. Try again in a moment."; isSyncing = false; document.getElementById("sync").disabled = false; return; }'
  + '      document.getElementById("msg").textContent = "Creating " + jobs.length + " page(s)...";'
  + '      parent.postMessage({ pluginMessage: { type: "process-jobs", jobs: jobs } }, "*");'
  + '    })'
  + '    .catch(function(e) {'
  + '      isSyncing = false;'
  + '      document.getElementById("sync").disabled = false;'
  + '      document.getElementById("msg").textContent = "Error: " + e.message;'
  + '      document.getElementById("msg").className = "err";'
  + '    });'
  + '};'
  + 'parent.postMessage({ pluginMessage: { type: "ui-handlers-bound" } }, "*");'
  + 'function fetchJobs(fk) {'
  + '  fileKey = fk;'
  + '  requestJson(HEIMDALL_API + "/api/jobs/queued?fileKey=" + encodeURIComponent(fk))'
  + '    .then(function(data) {'
  + '      var jobs = data.jobs || [];'
  + '      if (jobs.length === 0) {'
  + '        document.getElementById("msg").textContent = "No file-specific jobs. Checking all queued...";'
  + '        return requestJson(HEIMDALL_API + "/api/jobs/queued").then(function(d2){'
  + '          var all = d2.jobs || [];'
  + '          if (all.length === 0) { document.getElementById("msg").textContent = "No queued jobs."; isSyncing = false; return; }'
  + '          document.getElementById("msg").textContent = "Found " + all.length + " job(s). Creating pages...";'
  + '          parent.postMessage({ pluginMessage: { type: "process-jobs", jobs: all } }, "*");'
  + '        });'
  + '      }'
  + '      document.getElementById("msg").textContent = "Found " + jobs.length + " job(s). Creating pages...";'
  + '      parent.postMessage({ pluginMessage: { type: "process-jobs", jobs: jobs } }, "*");'
  + '    })'
  + '    .catch(function(e) {'
  + '      isSyncing = false;'
  + '      document.getElementById("msg").textContent = "Fetch error: " + e.message;'
  + '      document.getElementById("msg").className = "err";'
  + '    });'
  + '}'
  + 'function reportResults(results) {'
  + '  var done = 0; var updated = 0; var failed = [];'
  + '  var promises = [];'
  + '  for (var i = 0; i < results.length; i++) {'
  + '    var r = results[i];'
  + '    if (r.error) {'
  + '      failed.push(r.experimentPageName);'
  + '      promises.push(fetch(HEIMDALL_API + "/api/jobs/fail", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({idempotencyKey: r.idempotencyKey, errorCode: r.error}) }).catch(function(){}));'
  + '    } else {'
  + '      if (r.outcome === "updated") updated++; else done++;'
  + '      promises.push(fetch(HEIMDALL_API + "/api/jobs/complete", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({idempotencyKey: r.idempotencyKey, figmaPageId: r.pageId, figmaFileUrl: r.fileUrl, outcome: r.outcome || "created"}) }).catch(function(){}));'
  + '    }'
  + '  }'
  + '  Promise.all(promises).then(function() {'
  + '    isSyncing = false;'
  + '    var syncBtn = document.getElementById("sync");'
  + '    if (syncBtn) syncBtn.disabled = false;'
  + '    var el = document.getElementById("msg");'
  + '    var msg = "Done: " + done + " created"; if (updated > 0) msg += ", " + updated + " updated"; msg += "."; if (failed.length) msg += " Failed: " + failed.join(", ");'
  + '    el.textContent = msg;'
  + '    el.className = failed.length ? "err" : "";'
  + '  });'
  + '}'
  + 'function fetchAllImages(images) {'
  + '  var el = document.getElementById("msg");'
  + '  el.textContent = "Fetching " + images.length + " image(s) from Monday...";'
  + '  el.className = "";'
  + '  var results = [];'
  + '  var fetchFailures = [];'
  + '  var done = 0;'
  + '  function next(i) {'
  + '    if (i >= images.length) {'
  + '      el.textContent = "Images fetched: " + results.length + " ok, " + fetchFailures.length + " failed. Importing...";'
  + '      parent.postMessage({ pluginMessage: { type: "images-fetched", images: results, imageCount: images.length, fetchFailures: fetchFailures } }, "*");'
  + '      return;'
  + '    }'
  + '    var img = images[i];'
  + '    el.textContent = "Fetching image " + (i + 1) + "/" + images.length + ": " + img.name;'
  + '    var fetchUrl = img.assetId ? (HEIMDALL_API + "/api/images/proxy?assetId=" + encodeURIComponent(img.assetId)) : (HEIMDALL_API + "/api/images/proxy?url=" + encodeURIComponent(img.url || ""));'
  + '    function doFetch(attempt) {'
  + '      fetch(fetchUrl)'
  + '        .then(function(r) {'
  + '          if (!r.ok) { var errBody = r.status + " " + (r.statusText || ""); return r.json().then(function(j){ throw new Error(j.error || j.reason || errBody); }, function(){ throw new Error(errBody); }); }'
  + '          return r.arrayBuffer();'
  + '        })'
  + '        .then(function(buf) {'
  + '          if (buf && buf.byteLength > 0) results.push({ url: img.url, name: img.name, pageId: img.pageId, bytes: Array.from(new Uint8Array(buf)) });'
  + '          else fetchFailures.push({ name: img.name, reason: "Empty response" });'
  + '          done++; next(i + 1);'
  + '        })'
  + '        .catch(function(err) {'
  + '          if (attempt < 2) { setTimeout(function() { doFetch(attempt + 1); }, 500); }'
  + '          else { var reason = err && err.message ? err.message : String(err); fetchFailures.push({ name: img.name, reason: reason }); console.warn("Image fetch failed:", img.name, reason); done++; next(i + 1); }'
  + '        });'
  + '    }'
  + '    doFetch(1);'
  + '  }'
  + '  next(0);'
  + '}'
  + 'onmessage = function(e) {'
  + '  var d = typeof e.data === "object" && e.data.pluginMessage ? e.data.pluginMessage : e.data;'
  + '  if (d.type === "context") {'
  + '    fileKey = d.fileKey || "";'
  + '    fileName = d.fileName || "";'
  + '    existingPageNames = Array.isArray(d.existingPages) ? d.existingPages : [];'
  + '    rebuildExistingLookupSets(Array.isArray(d.existingMondayItemIds) ? d.existingMondayItemIds : []);'
  + '    fetchBriefings(null);'
  + '    if (!fileKey) document.getElementById("msg").textContent = "File key unavailable in this context. Continuing with batch-based sync.";'
  + '  }'
  + '  if (d.type === "file-key") {'
  + '    fetchJobs(d.fileKey);'
  + '  }'
  + '  if (d.type === "progress") {'
  + '    document.getElementById("msg").textContent = "Creating page " + d.current + "/" + d.total + ": " + (d.name || "");'
  + '  }'
  + '  if (d.type === "jobs-processed") {'
  + '    reportResults(d.results);'
  + '  }'
  + '  if (d.type === "api-base") setApiBase(d.apiBase || DEFAULT_HEIMDALL_API);'
  + '  if (d.type === "create-template-done") {'
  + '    var el = document.getElementById("msg");'
  + '    el.textContent = d.error ? "Template error: " + d.error : "Template created. Place the \'Custom Labels - Status Tracker\' widget in each column header (Briefing, Copy, Design).";'
  + '    el.className = d.error ? "err" : "";'
  + '  }'
  + '  if (d.type === "migrate-widgets-done") {'
  + '    var el = document.getElementById("msg");'
  + '    if (d.error) { el.textContent = "Migrate error: " + d.error; el.className = "err"; }'
  + '    else { el.textContent = "Migrated: " + (d.pagesMigrated || 0) + " pages, skipped: " + (d.pagesSkipped || 0) + (d.pagesFailed ? ", failed: " + d.pagesFailed : ""); el.className = ""; }'
  + '  }'
  + '  if (d.type === "fetch-images" && d.images && d.images.length > 0) {'
  + '    fetchAllImages(d.images);'
  + '  }'
  + '  if (d.type === "images-import-done") {'
  + '    var el = document.getElementById("msg");'
  + '    var prev = el.textContent || "";'
  + '    var line = "Images: " + d.placed + "/" + d.total + " placed in Figma.";'
  + '    var fetchFailures = d.fetchFailures || [];'
  + '    var failures = d.failures || [];'
  + '    if (fetchFailures.length || failures.length) {'
  + '      line += " Failed: ";'
  + '      var parts = [];'
  + '      for (var i = 0; i < fetchFailures.length; i++) parts.push(fetchFailures[i].name + " (fetch: " + fetchFailures[i].reason + ")");'
  + '      for (var j = 0; j < failures.length; j++) parts.push(failures[j].name + " (" + failures[j].reason + ")");'
  + '      line += parts.join("; ");'
  + '      el.className = "err";'
  + '    }'
  + '    el.textContent = prev ? (prev + " | " + line) : line;'
  + '  }'
  + '  if (d.type === "fix-layouts-done") {'
  + '    var el = document.getElementById("msg");'
  + '    if (d.error) { el.textContent = "Error: " + d.error; el.className = "err"; }'
  + '    else { el.textContent = "Fixed " + (d.pagesFixed || 0) + " page(s), skipped " + (d.pagesSkipped || 0) + "."; el.className = ""; }'
  + '  }'
  + '  if (d.type === "debug-log") {'
  + '    var el = document.getElementById("msg");'
  + '    el.style.whiteSpace = "pre-wrap";'
  + '    el.style.fontSize = "9px";'
  + '    el.style.maxHeight = "300px";'
  + '    el.style.overflow = "auto";'
  + '    el.textContent = d.text;'
  + '  }'
  + '};'
  + 'parent.postMessage({ pluginMessage: { type: "get-api-base" } }, "*");'
  + '</script></body></html>'

export function runSyncBriefings() {
  figma.showUI(uiHtml, { width: 460, height: 580 })

  figma.ui.onmessage = async function (msg: {
    type: string;
    jobs?: QueuedJob[];
    apiBase?: string;
    images?: Array<{ url: string; name: string; pageId: string; bytes: number[] }>;
    imageCount?: number;
    message?: string;
    source?: string;
    lineno?: number;
    colno?: number;
    reason?: string;
    hasSync?: boolean;
    hasCreate?: boolean;
    hasSave?: boolean;
  }) {
    if (msg.type === 'open-export-comments') {
      runExportComments()
      return
    }
    if (msg.type === 'ui-boot') {
      const existingPages: string[] = []
      const existingMondayItemIds: string[] = []
      for (let i = 0; i < figma.root.children.length; i++) {
        const p = figma.root.children[i]
        if (p.type === 'PAGE') {
          const page = p as PageNode
          existingPages.push(page.name)
          const mondayItemId = page.getPluginData('heimdallMondayItemId')
          if (mondayItemId) existingMondayItemIds.push(mondayItemId)
        }
      }
      figma.ui.postMessage({
        type: 'context',
        fileName: figma.root.name,
        fileKey: figma.fileKey || '',
        existingPages,
        existingMondayItemIds,
      })
    }
    if (msg.type === 'ui-handlers-bound') {
    }
    if (msg.type === 'get-api-base') {
      const saved = await figma.clientStorage.getAsync('heimdallApiBase')
      const apiBase = typeof saved === 'string' && saved.trim() ? saved.trim() : 'http://localhost:3846'
      figma.ui.postMessage({ type: 'api-base', apiBase })
    }
    if (msg.type === 'save-api-base') {
      const raw = msg.apiBase ?? ''
      const apiBase = raw.trim().replace(/\/$/, '') || 'http://localhost:3846'
      await figma.clientStorage.setAsync('heimdallApiBase', apiBase)
      figma.ui.postMessage({ type: 'api-base', apiBase })
    }
    if (msg.type === 'get-file-key') {
      figma.ui.postMessage({ type: 'file-key', fileKey: figma.fileKey || '' })
    }
    if (msg.type === 'create-template') {
      const result = await createAutoLayoutTemplate()
      figma.ui.postMessage({ type: 'create-template-done', error: result.error })
    }
    if (msg.type === 'migrate-widgets') {
      const result = await migrateStatusWidgets()
      figma.ui.postMessage({
        type: 'migrate-widgets-done',
        error: result.error,
        pagesMigrated: result.pagesMigrated,
        pagesSkipped: result.pagesSkipped,
        pagesFailed: result.pagesFailed,
      })
    }
    if (msg.type === 'fix-layouts') {
      const result = await fixLayouts()
      figma.ui.postMessage({
        type: 'fix-layouts-done',
        error: result.error,
        pagesFixed: result.pagesFixed,
        pagesSkipped: result.pagesSkipped,
      })
    }
    if (msg.type === 'process-jobs' && msg.jobs) {
      var results: Array<{ idempotencyKey: string; experimentPageName: string; pageId: string; fileUrl: string; error?: string }>
      try {
        results = await processJobs(msg.jobs)
      } catch (e) {
        const err = e instanceof Error ? e.message : 'Unknown error'
        results = msg.jobs.map((job) => ({
          idempotencyKey: job.idempotencyKey,
          experimentPageName: job.experimentPageName,
          pageId: '',
          fileUrl: '',
          error: err,
        }))
      }
      figma.ui.postMessage({ type: 'jobs-processed', results: results })

      var matched = debugLog.filter(function (d) { return d.matched })
      var unmatched = debugLog.filter(function (d) { return !d.matched })
      var summary = 'DEBUG: ' + matched.length + ' matched, ' + unmatched.length + ' unmatched.\n'
      summary += 'Unmatched nodes (first 20):\n'
      for (var d = 0; d < Math.min(unmatched.length, 20); d++) {
        var u = unmatched[d]
        summary += '  name="' + u.nodeName + '" chars="' + u.chars + '" path=[' + u.path.join(' > ') + ']\n'
      }
      summary += '\nMatched nodes (first 20):\n'
      for (var d = 0; d < Math.min(matched.length, 20); d++) {
        var m = matched[d]
        summary += '  name="' + m.nodeName + '" -> "' + (m.matchedKey || '') + '"\n'
      }
      figma.ui.postMessage({ type: 'debug-log', text: summary })
      console.log(summary)

      var imageRequests: ImageFetchRequest[] = []
      for (var ji = 0; ji < msg.jobs.length; ji++) {
        var job = msg.jobs[ji]
        if (!job.images || job.images.length === 0) continue
        var matchResult: typeof results[0] | null = null
        for (var ri = 0; ri < results.length; ri++) {
          if (results[ri].idempotencyKey === job.idempotencyKey && !results[ri].error) {
            matchResult = results[ri]
            break
          }
        }
        if (!matchResult || !matchResult.pageId) continue
        for (var ii = 0; ii < job.images.length; ii++) {
          imageRequests.push({
            url: job.images[ii].url,
            name: job.images[ii].name,
            pageId: matchResult.pageId,
            assetId: (job.images[ii] as { assetId?: string }).assetId,
          })
        }
      }
      if (imageRequests.length > 0) {
        setTimeout(function () {
          figma.ui.postMessage({ type: 'fetch-images', images: imageRequests })
        }, 200)
      }
    }

    if (msg.type === 'images-fetched' && msg.images) {
      var totalPlaced = 0
      var allFailures: Array<{ name: string; reason: string }> = []
      var fetchFailures: Array<{ name: string; reason: string }> = (msg.fetchFailures as Array<{ name: string; reason: string }>) ?? []
      var byPage: Record<string, Array<{ bytes: Uint8Array; name: string }>> = {}
      var emptySkipped = 0
      for (var idx = 0; idx < msg.images.length; idx++) {
        var imgData = msg.images[idx]
        if (!imgData.bytes || imgData.bytes.length === 0) { emptySkipped++; continue }
        if (!byPage[imgData.pageId]) byPage[imgData.pageId] = []
        byPage[imgData.pageId].push({
          bytes: new Uint8Array(imgData.bytes),
          name: imgData.name,
        })
      }
      var pageIds = Object.keys(byPage)
      for (var pi = 0; pi < pageIds.length; pi++) {
        var pageId = pageIds[pi]
        var _node = await figma.getNodeByIdAsync(pageId)
        if (_node && _node.type === 'PAGE' && typeof (_node as any).loadAsync === 'function') {
          await (_node as any).loadAsync()
        }
        var result = await importImagesToPage(pageId, byPage[pageId])
        totalPlaced += result.placed
        for (var fi = 0; fi < result.failures.length; fi++) {
          allFailures.push(result.failures[fi])
        }
      }
      var totalRequested = msg.imageCount ?? msg.images.length
      var totalFailed = allFailures.length + fetchFailures.length
      var summary = 'Images: requested=' + totalRequested + ' placed=' + totalPlaced + ' failed=' + totalFailed
      if (allFailures.length + fetchFailures.length > 0) {
        debugLog.push({ nodeName: '__IMAGE_IMPORT__', chars: summary, path: [], matched: true })
      }
      figma.ui.postMessage({
        type: 'images-import-done',
        placed: totalPlaced,
        total: totalRequested,
        failures: allFailures,
        fetchFailures: fetchFailures,
      })
    }
  }
}

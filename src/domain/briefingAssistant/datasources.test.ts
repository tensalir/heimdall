/**
 * Tests for canonical datasource IDs and validation.
 * Run with: npx tsx src/domain/briefingAssistant/datasources.test.ts
 */

import {
  DATASOURCE_IDS,
  UI_DATASOURCE_IDS,
  isCanonicalDatasourceId,
  validateDatasourceIds,
  DATASOURCE_CONFIG,
} from './datasources.js'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

assert(DATASOURCE_IDS.includes('ad_performance'), 'ad_performance is canonical')
assert(DATASOURCE_IDS.includes('social_comments'), 'social_comments is canonical')
assert(DATASOURCE_IDS.includes('static_fallback'), 'static_fallback is canonical')
assert(!DATASOURCE_IDS.includes('ad performance' as any), 'display string is not canonical')

assert(isCanonicalDatasourceId('ad_performance'), 'isCanonical(ad_performance)')
assert(!isCanonicalDatasourceId('ad performance'), '!isCanonical(ad performance)')
assert(!isCanonicalDatasourceId(''), '!isCanonical(empty)')

const valid = validateDatasourceIds(['ad_performance', 'social_comments', 'invalid', 'untapped_use_cases'] as string[])
assert(valid.length === 3, `validateDatasourceIds should drop invalid, got ${valid.length}`)
assert(valid.includes('ad_performance'), 'valid includes ad_performance')
assert(valid.includes('untapped_use_cases'), 'valid includes untapped_use_cases')
assert(!(valid as readonly string[]).includes('invalid'), 'valid excludes invalid')

assert(UI_DATASOURCE_IDS.length === 4, 'UI shows 4 datasources (no static_fallback)')
assert(!UI_DATASOURCE_IDS.includes('static_fallback'), 'static_fallback not in UI list')

assert(DATASOURCE_CONFIG.ad_performance.label === 'Ads', 'ad_performance label is Ads')
assert(DATASOURCE_CONFIG.social_comments.icon === 'MessageSquare', 'social_comments icon')

console.log('Datasources test: OK')
console.log('Canonical IDs:', DATASOURCE_IDS)
console.log('UI IDs:', UI_DATASOURCE_IDS)
console.log('validateDatasourceIds(["ad_performance","invalid"]) ->', validateDatasourceIds(['ad_performance', 'invalid'] as string[]))

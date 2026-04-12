/**
 * Runtime skill loader for Iterator.
 *
 * Reads skill markdown files from the tracked repo at runtime
 * and injects them into Claude system prompts. Follows the same
 * pattern as briefingContextBuilder.ts but generalized for any
 * skill under skills/.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const cache = new Map<string, string>()

/**
 * Load a skill's SKILL.md content from the tracked repo.
 * Returns the full markdown string or empty string if not found.
 * Results are cached for the lifetime of the process.
 */
export function loadSkill(skillName: string): string {
  if (cache.has(skillName)) return cache.get(skillName)!

  try {
    const root = process.cwd()
    const content = readFileSync(
      join(root, 'skills', skillName, 'SKILL.md'),
      'utf-8',
    )
    cache.set(skillName, content)
    return content
  } catch {
    cache.set(skillName, '')
    return ''
  }
}

/**
 * Load a specific reference file from a skill's directory.
 * Path is relative to the skill root, e.g. 'voice/voice.md'.
 */
export function loadSkillReference(skillName: string, refPath: string): string {
  const cacheKey = `${skillName}/${refPath}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)!

  try {
    const root = process.cwd()
    const content = readFileSync(
      join(root, 'skills', skillName, refPath),
      'utf-8',
    )
    cache.set(cacheKey, content)
    return content
  } catch {
    cache.set(cacheKey, '')
    return ''
  }
}

/**
 * Extract JSON from a Claude response that may be wrapped in
 * markdown code fences (```json ... ```).
 */
export function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) return fenceMatch[1].trim()
  const braceStart = text.indexOf('{')
  const braceEnd = text.lastIndexOf('}')
  if (braceStart !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1)
  }
  return text.trim()
}

/**
 * Load the core skill SKILL.md plus a set of reference files,
 * concatenated with section headers. Useful for building a
 * comprehensive system prompt from a skill and its key references.
 */
export function loadSkillWithReferences(
  skillName: string,
  refPaths: string[],
): string {
  const parts: string[] = []

  const main = loadSkill(skillName)
  if (main) parts.push(main)

  for (const ref of refPaths) {
    const content = loadSkillReference(skillName, ref)
    if (content) {
      parts.push(`\n---\n## Reference: ${ref}\n\n${content}`)
    }
  }

  return parts.join('\n')
}

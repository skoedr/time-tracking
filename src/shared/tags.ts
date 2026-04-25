/**
 * Tag utilities for v1.4 PR C.
 *
 * Storage format: leading + trailing comma, e.g. `,bug,ux,`
 * This lets SQLite match exact tags with LIKE `%,bug,%` without false
 * positives for partial substrings (e.g. `bugfix` won't match a search
 * for `bug`). An empty/untagged entry stores an empty string `''`.
 *
 * Rules enforced at parse time:
 *  - All-lowercase (input is lowercased automatically)
 *  - Max 32 characters per tag (silently truncated on parse, rejected on validate)
 *  - Max 10 tags per entry
 *  - Duplicates are silently removed (first occurrence wins)
 *  - Tags may contain letters, digits, hyphens, underscores, and dots
 *  - Empty tokens are ignored
 */

const MAX_TAG_LEN = 32
const MAX_TAGS = 10

/** Regex for a valid single tag: 1-32 lowercase alphanumeric + - _ . */
const TAG_RE = /^[a-z0-9._-]{1,32}$/

/**
 * Parse a raw user input string into a normalised tag array.
 * Splits on commas, spaces, and the `#` prefix character.
 * Lowercases, deduplicates, and silently drops invalid/empty tokens.
 * The resulting array is capped at MAX_TAGS entries.
 */
export function parseTagInput(raw: string): string[] {
  const tokens = raw
    .toLowerCase()
    .split(/[\s,#]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => t.slice(0, MAX_TAG_LEN))
    .filter((t) => TAG_RE.test(t))

  // Deduplicate preserving first occurrence
  const seen = new Set<string>()
  const result: string[] = []
  for (const t of tokens) {
    if (!seen.has(t)) {
      seen.add(t)
      result.push(t)
    }
    if (result.length >= MAX_TAGS) break
  }
  return result
}

/**
 * Serialize a tag array to the DB storage format (`,tag1,tag2,`).
 * Returns an empty string for an empty/null array.
 */
export function serializeTags(tags: string[]): string {
  if (!tags || tags.length === 0) return ''
  return `,${tags.join(',')},`
}

/**
 * Deserialize the DB storage format back to an array of tag strings.
 * Returns an empty array for an empty/null string.
 */
export function deserializeTags(stored: string | null | undefined): string[] {
  if (!stored) return []
  return stored
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/**
 * Return true when the serialized `tags` column value contains `tag`
 * as an exact whole-word match (not a substring of another tag).
 */
export function entryHasTag(serialized: string, tag: string): boolean {
  if (!serialized || !tag) return false
  return serialized.includes(`,${tag.toLowerCase()},`)
}

/**
 * Validate a raw tag array (post-parse). Returns an error message string
 * when the array is invalid, or null when valid.
 */
export function validateTags(tags: string[]): string | null {
  if (tags.length > MAX_TAGS) return `Maximal ${MAX_TAGS} Tags pro Eintrag`
  for (const t of tags) {
    if (t.length > MAX_TAG_LEN) return `Tag "${t}" ist zu lang (max ${MAX_TAG_LEN} Zeichen)`
    if (!TAG_RE.test(t)) return `Tag "${t}" enthält ungültige Zeichen`
  }
  return null
}

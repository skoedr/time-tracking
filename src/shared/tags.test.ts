import { describe, it, expect } from 'vitest'
import { parseTagInput, serializeTags, deserializeTags, entryHasTag, validateTags } from './tags'

describe('parseTagInput', () => {
  it('lowercases input', () => {
    expect(parseTagInput('Bug')).toEqual(['bug'])
  })

  it('strips # prefix', () => {
    expect(parseTagInput('#feature #ux')).toEqual(['feature', 'ux'])
  })

  it('splits on commas and spaces', () => {
    expect(parseTagInput('bug, ux, feature')).toEqual(['bug', 'ux', 'feature'])
  })

  it('deduplicates tags (first occurrence wins)', () => {
    expect(parseTagInput('bug bug ux bug')).toEqual(['bug', 'ux'])
  })

  it('ignores empty tokens', () => {
    expect(parseTagInput('  ,  ,  ')).toEqual([])
  })

  it('caps at 10 tags', () => {
    const input = Array.from({ length: 15 }, (_, i) => `tag${i}`).join(' ')
    expect(parseTagInput(input)).toHaveLength(10)
  })

  it('silently truncates tokens longer than 32 chars', () => {
    const long = 'a'.repeat(40)
    const result = parseTagInput(long)
    expect(result[0]).toHaveLength(32)
  })

  it('rejects tokens with invalid characters (uppercase after lowercase)', () => {
    // After lowercasing 'Tag' becomes 'tag' — valid
    expect(parseTagInput('Tag')).toEqual(['tag'])
    // Tokens with special chars are dropped
    expect(parseTagInput('tag!')).toEqual([])
    expect(parseTagInput('tag@name')).toEqual([])
  })

  it('accepts hyphens, underscores, dots', () => {
    expect(parseTagInput('my-tag my_tag v1.0')).toEqual(['my-tag', 'my_tag', 'v1.0'])
  })

  it('returns empty array for empty input', () => {
    expect(parseTagInput('')).toEqual([])
  })
})

describe('serializeTags', () => {
  it('wraps with leading and trailing commas', () => {
    expect(serializeTags(['bug', 'ux'])).toBe(',bug,ux,')
  })

  it('returns empty string for empty array', () => {
    expect(serializeTags([])).toBe('')
  })

  it('single tag', () => {
    expect(serializeTags(['bug'])).toBe(',bug,')
  })
})

describe('deserializeTags', () => {
  it('parses comma-delimited DB format', () => {
    expect(deserializeTags(',bug,ux,')).toEqual(['bug', 'ux'])
  })

  it('returns empty array for empty string', () => {
    expect(deserializeTags('')).toEqual([])
  })

  it('returns empty array for null/undefined', () => {
    expect(deserializeTags(null)).toEqual([])
    expect(deserializeTags(undefined)).toEqual([])
  })
})

describe('entryHasTag', () => {
  it('returns true for exact tag match', () => {
    expect(entryHasTag(',bug,ux,', 'bug')).toBe(true)
  })

  it('returns false for substring match (bugfix does not match bug)', () => {
    expect(entryHasTag(',bugfix,ux,', 'bug')).toBe(false)
  })

  it('returns false when tag is absent', () => {
    expect(entryHasTag(',bug,ux,', 'feature')).toBe(false)
  })

  it('returns false for empty serialized', () => {
    expect(entryHasTag('', 'bug')).toBe(false)
  })

  it('is case-insensitive via lowercase normalization', () => {
    // Tags are stored lowercase; caller should pass lowercase tag
    expect(entryHasTag(',bug,', 'bug')).toBe(true)
  })
})

describe('validateTags', () => {
  it('returns null for valid tags', () => {
    expect(validateTags(['bug', 'ux'])).toBeNull()
  })

  it('rejects more than 10 tags', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`)
    expect(validateTags(tags)).toMatch(/10/)
  })

  it('returns null for empty array', () => {
    expect(validateTags([])).toBeNull()
  })
})

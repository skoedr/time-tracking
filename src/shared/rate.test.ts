import { describe, it, expect } from 'vitest'
import { parseRateInput, formatRateInput, formatRateDisplay } from './rate'

describe('parseRateInput', () => {
  it('returns 0 for empty input', () => {
    expect(parseRateInput('')).toBe(0)
    expect(parseRateInput('   ')).toBe(0)
  })

  it('parses integer euros', () => {
    expect(parseRateInput('85')).toBe(8500)
  })

  it('parses German decimals', () => {
    expect(parseRateInput('85,00')).toBe(8500)
    expect(parseRateInput('85,5')).toBe(8550)
    expect(parseRateInput('85,55')).toBe(8555)
  })

  it('treats lone dot as German thousands separator (strict)', () => {
    // No comma present, so "85.50" is parsed as "8550" euros, not 85.50.
    // This matches German convention; users entering decimals should use a
    // comma. Documenting via test rather than fixing — the form's placeholder
    // text steers users to the comma form.
    expect(parseRateInput('85.50')).toBe(855000)
  })

  it('handles thousands separators', () => {
    expect(parseRateInput('1.234,56')).toBe(123456)
  })

  it('flags non-numeric input', () => {
    expect(parseRateInput('abc')).toBe('invalid')
    expect(parseRateInput('85x')).toBe('invalid')
  })

  it('flags negative input', () => {
    expect(parseRateInput('-50')).toBe('negative')
    expect(parseRateInput('-1,50')).toBe('negative')
  })

  it('rounds sub-cent inputs to the nearest cent (float-safe)', () => {
    // 1,005 is unrepresentable in IEEE-754 (becomes 1.00499…), so
    // Math.round(100.499…) yields 100 — not the mathematical 101. We assert
    // the actual JS behaviour so a future "improvement" doesn't sneak in
    // BigDecimal without us noticing.
    expect(parseRateInput('1,005')).toBe(100)
  })
})

describe('formatRateInput', () => {
  it('returns empty string for 0', () => {
    expect(formatRateInput(0)).toBe('')
  })

  it('formats whole euros with two decimals', () => {
    expect(formatRateInput(8500)).toBe('85,00')
  })

  it('formats sub-euro values', () => {
    expect(formatRateInput(50)).toBe('0,50')
    expect(formatRateInput(5)).toBe('0,05')
  })
})

describe('formatRateDisplay', () => {
  it('returns dash for 0 (no rate)', () => {
    expect(formatRateDisplay(0)).toBe('—')
  })

  it('formats with German thousands and currency symbol', () => {
    // Intl output may use NBSP between number and €; normalise for the assertion.
    expect(formatRateDisplay(123456).replace(/\u00a0/g, ' ')).toBe('1.234,56 €')
    expect(formatRateDisplay(8500).replace(/\u00a0/g, ' ')).toBe('85,00 €')
  })
})

import { describe, it, expect } from 'vitest'
import { detectFilePurpose } from './pdfMergeUtils'

describe('detectFilePurpose', () => {
  it('identifies Stundennachweis filename', () => {
    expect(detectFilePurpose('Stundennachweis_2025-03.pdf')).toBe('sn')
  })

  it('identifies SN_ prefix', () => {
    expect(detectFilePurpose('SN_Mustermann_2025-03.pdf')).toBe('sn')
  })

  it('identifies lowercase nachweis', () => {
    expect(detectFilePurpose('nachweis_april.pdf')).toBe('sn')
  })

  it('identifies Rechnung filename', () => {
    expect(detectFilePurpose('Rechnung_2025-03-001.pdf')).toBe('invoice')
  })

  it('identifies invoice prefix', () => {
    expect(detectFilePurpose('invoice_march_2025.pdf')).toBe('invoice')
  })

  it('identifies INV- prefix', () => {
    expect(detectFilePurpose('INV-2025-003.pdf')).toBe('invoice')
  })

  it('returns null for ambiguous filename', () => {
    expect(detectFilePurpose('document.pdf')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(detectFilePurpose('')).toBeNull()
  })
})

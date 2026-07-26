import { describe, it, expect } from 'vitest'
import { formatDuration, roundDuration } from './duration'

describe('formatDuration', () => {
  it('formats zero as 00:00:00', () => {
    expect(formatDuration(0)).toBe('00:00:00')
  })

  it('formats sub-minute values', () => {
    expect(formatDuration(7)).toBe('00:00:07')
    expect(formatDuration(59)).toBe('00:00:59')
  })

  it('formats sub-hour values', () => {
    expect(formatDuration(60)).toBe('00:01:00')
    expect(formatDuration(125)).toBe('00:02:05')
  })

  it('formats multi-hour values', () => {
    expect(formatDuration(3661)).toBe('01:01:01')
    expect(formatDuration(36000)).toBe('10:00:00')
  })

  it('truncates fractional seconds', () => {
    expect(formatDuration(59.9)).toBe('00:00:59')
  })

  it('clamps negative values to 00:00:00', () => {
    expect(formatDuration(-1)).toBe('00:00:00')
    expect(formatDuration(-3600)).toBe('00:00:00')
  })

  it('clamps non-finite values to 00:00:00', () => {
    expect(formatDuration(NaN)).toBe('00:00:00')
    expect(formatDuration(Infinity)).toBe('00:00:00')
  })
})

// v1.12 #106
describe('roundDuration', () => {
  it('pass-through when roundMinutes is 0', () => {
    expect(roundDuration(3723, 0)).toBe(3723)
    expect(roundDuration(0, 0)).toBe(0)
  })

  it('pass-through when roundMinutes is negative', () => {
    expect(roundDuration(3723, -5)).toBe(3723)
  })

  it('returns 0 for negative seconds', () => {
    expect(roundDuration(-1, 15)).toBe(0)
    expect(roundDuration(-3600, 30)).toBe(0)
  })

  it('exact multiples are unchanged', () => {
    expect(roundDuration(900, 15)).toBe(900) // 15min exact
    expect(roundDuration(1800, 30)).toBe(1800) // 30min exact
    expect(roundDuration(0, 5)).toBe(0)
  })

  it('rounds up to next 5-minute interval (ceiling)', () => {
    expect(roundDuration(1, 5)).toBe(300) // 0s → 5min
    expect(roundDuration(299, 5)).toBe(300) // 4:59 → 5min
    expect(roundDuration(301, 5)).toBe(600) // 5:01 → 10min
  })

  it('rounds up to next 15-minute interval', () => {
    expect(roundDuration(60, 15)).toBe(900) // 1min → 15min
    expect(roundDuration(899, 15)).toBe(900) // 14:59 → 15min
    expect(roundDuration(901, 15)).toBe(1800) // 15:01 → 30min
    expect(roundDuration(1380, 15)).toBe(1800) // 23min → 30min
  })

  it('rounds up to next 30-minute interval', () => {
    expect(roundDuration(1, 30)).toBe(1800)
    expect(roundDuration(1799, 30)).toBe(1800)
    expect(roundDuration(1801, 30)).toBe(3600)
  })

  it('rounds up to next 60-minute interval', () => {
    expect(roundDuration(3599, 60)).toBe(3600)
    expect(roundDuration(3601, 60)).toBe(7200)
  })

  it('handles non-finite seconds gracefully', () => {
    expect(roundDuration(NaN, 15)).toBe(0)
    expect(roundDuration(Infinity, 15)).toBe(0)
  })
})

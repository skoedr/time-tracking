import { describe, it, expect } from 'vitest'
import { getQuickRange } from './dateRanges'

/**
 * Construct a Date in local time (Y/M/D/H/M). All assertions below also use
 * local-time getters so the suite is timezone-agnostic — it verifies the
 * ranges relative to the host's wall-clock, not against a hardcoded UTC offset.
 */
function local(y: number, m: number, d: number, h = 12, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('getQuickRange', () => {
  it('thisWeek anchors to Monday and ends on Sunday 23:59:59.999', () => {
    // 2026-04-24 is a Friday.
    const now = local(2026, 4, 24)
    const r = getQuickRange('thisWeek', now)
    expect(dayKey(r.from)).toBe('2026-04-20') // Mon
    expect(dayKey(r.to)).toBe('2026-04-26') // Sun
    expect(r.from.getHours()).toBe(0)
    expect(r.to.getHours()).toBe(23)
    expect(r.to.getMinutes()).toBe(59)
    expect(r.to.getMilliseconds()).toBe(999)
  })

  it('thisWeek when today is Monday returns the same Monday', () => {
    // 2026-04-20 is a Monday.
    const now = local(2026, 4, 20)
    const r = getQuickRange('thisWeek', now)
    expect(dayKey(r.from)).toBe('2026-04-20')
    expect(dayKey(r.to)).toBe('2026-04-26')
  })

  it('thisWeek when today is Sunday still anchors to the previous Monday', () => {
    // 2026-04-26 is a Sunday.
    const now = local(2026, 4, 26)
    const r = getQuickRange('thisWeek', now)
    expect(dayKey(r.from)).toBe('2026-04-20')
    expect(dayKey(r.to)).toBe('2026-04-26')
  })

  it('lastWeek returns the prior Mon–Sun', () => {
    const now = local(2026, 4, 24) // Fri
    const r = getQuickRange('lastWeek', now)
    expect(dayKey(r.from)).toBe('2026-04-13')
    expect(dayKey(r.to)).toBe('2026-04-19')
  })

  it('thisMonth returns the first to last day of the current month', () => {
    const now = local(2026, 4, 24)
    const r = getQuickRange('thisMonth', now)
    expect(dayKey(r.from)).toBe('2026-04-01')
    expect(dayKey(r.to)).toBe('2026-04-30')
  })

  it('lastMonth returns the previous month, not "30 days ago"', () => {
    const now = local(2026, 4, 24)
    const r = getQuickRange('lastMonth', now)
    expect(dayKey(r.from)).toBe('2026-03-01')
    expect(dayKey(r.to)).toBe('2026-03-31')
  })

  it('lastMonth across year boundary (January → December)', () => {
    const now = local(2026, 1, 5)
    const r = getQuickRange('lastMonth', now)
    expect(dayKey(r.from)).toBe('2025-12-01')
    expect(dayKey(r.to)).toBe('2025-12-31')
  })

  it('thisMonth handles February in a non-leap year', () => {
    const now = local(2026, 2, 14)
    const r = getQuickRange('thisMonth', now)
    expect(dayKey(r.from)).toBe('2026-02-01')
    expect(dayKey(r.to)).toBe('2026-02-28')
  })

  it('lastWeek across DST spring-forward stays on Mon–Sun', () => {
    // EU DST 2026 spring-forward is Sun 2026-03-29.
    // From Mon 2026-04-06: lastWeek = Mon 2026-03-30 .. Sun 2026-04-05.
    // The Sunday inside that range (2026-03-29) is the DST day — we must
    // still get a clean Mon–Sun span without losing or gaining a day.
    const now = local(2026, 4, 6) // Mon after DST week
    const r = getQuickRange('lastWeek', now)
    expect(dayKey(r.from)).toBe('2026-03-30')
    expect(dayKey(r.to)).toBe('2026-04-05')
  })
})

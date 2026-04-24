import { describe, it, expect } from 'vitest'
import { splitAtMidnight } from './midnightSplit'

function local(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

describe('splitAtMidnight', () => {
  it('returns one segment for a same-day entry', () => {
    const start = local(2026, 4, 24, 9, 0)
    const stop = local(2026, 4, 24, 17, 30)
    const segs = splitAtMidnight(start, stop)
    expect(segs).toHaveLength(1)
    expect(segs[0].start).toEqual(start)
    expect(segs[0].stop).toEqual(stop)
  })

  it('splits a 23:30 → 01:15 entry at local midnight', () => {
    const start = local(2026, 4, 24, 23, 30)
    const stop = local(2026, 4, 25, 1, 15)
    const segs = splitAtMidnight(start, stop)
    expect(segs).toHaveLength(2)
    expect(key(segs[0].start)).toBe('2026-04-24 23:30')
    expect(key(segs[0].stop)).toBe('2026-04-25 00:00')
    expect(key(segs[1].start)).toBe('2026-04-25 00:00')
    expect(key(segs[1].stop)).toBe('2026-04-25 01:15')
  })

  it('treats stop = exact midnight as a single segment (no empty tail)', () => {
    // An entry ending precisely at 00:00 of the next day should NOT produce
    // a zero-length second segment. The first segment owns the boundary.
    const start = local(2026, 4, 24, 22, 0)
    const stop = local(2026, 4, 25, 0, 0)
    const segs = splitAtMidnight(start, stop)
    expect(segs).toHaveLength(1)
    expect(segs[0].stop).toEqual(stop)
  })

  it('handles a 1-minute-after-midnight tail', () => {
    const start = local(2026, 4, 24, 23, 59)
    const stop = local(2026, 4, 25, 0, 1)
    const segs = splitAtMidnight(start, stop)
    expect(segs).toHaveLength(2)
    expect(key(segs[0].stop)).toBe('2026-04-25 00:00')
    expect(key(segs[1].start)).toBe('2026-04-25 00:00')
  })

  it('rejects stop <= start', () => {
    const start = local(2026, 4, 24, 9, 0)
    expect(() => splitAtMidnight(start, start)).toThrow(/stop must be after start/)
    expect(() => splitAtMidnight(start, local(2026, 4, 24, 8, 0))).toThrow(/stop must be after/)
  })

  it('handles DST spring-forward (2026-03-29 EU)', () => {
    // EU spring-forward: the wall clock jumps 02:00 → 03:00 on Sun 29.03.2026.
    // An entry spanning that night still splits at LOCAL midnight, not at
    // some UTC offset. We anchor on a 23:00 → 04:00 entry crossing the DST
    // boundary inside the second segment.
    const start = local(2026, 3, 28, 23, 0)
    const stop = local(2026, 3, 29, 4, 0)
    const segs = splitAtMidnight(start, stop)
    expect(segs).toHaveLength(2)
    expect(key(segs[0].start)).toBe('2026-03-28 23:00')
    expect(key(segs[0].stop)).toBe('2026-03-29 00:00')
    expect(key(segs[1].start)).toBe('2026-03-29 00:00')
    expect(key(segs[1].stop)).toBe('2026-03-29 04:00')
  })

  it('handles DST fall-back (2026-10-25 EU)', () => {
    // EU fall-back: 03:00 → 02:00 on Sun 25.10.2026. Same property — split
    // at local midnight, segment lengths are wall-clock, not UTC.
    const start = local(2026, 10, 24, 23, 0)
    const stop = local(2026, 10, 25, 4, 0)
    const segs = splitAtMidnight(start, stop)
    expect(segs).toHaveLength(2)
    expect(key(segs[0].stop)).toBe('2026-10-25 00:00')
    expect(key(segs[1].start)).toBe('2026-10-25 00:00')
  })

  it('handles a multi-midnight span (>2 segments) — defensive, IPC caps at 24h', () => {
    // The IPC validator rejects entries longer than 24h, so this never fires
    // through the public API. The helper still supports it so we don't need
    // a hidden coupling between "length cap" and "max 2 segments".
    const start = local(2026, 4, 24, 22, 0)
    const stop = local(2026, 4, 26, 1, 0)
    const segs = splitAtMidnight(start, stop)
    expect(segs).toHaveLength(3)
    expect(key(segs[0].stop)).toBe('2026-04-25 00:00')
    expect(key(segs[1].start)).toBe('2026-04-25 00:00')
    expect(key(segs[1].stop)).toBe('2026-04-26 00:00')
    expect(key(segs[2].start)).toBe('2026-04-26 00:00')
  })
})

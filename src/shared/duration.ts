/**
 * Format a non-negative duration in seconds as `HH:MM:SS`.
 * Negative or non-finite inputs collapse to `00:00:00`.
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

/**
 * Round a duration (in seconds) up to the next multiple of `roundMinutes`
 * using ceiling arithmetic.
 *
 * - `roundMinutes <= 0`: pass-through (returns `seconds` unchanged).
 * - Already an exact multiple: no change.
 * - Negative `seconds`: returns 0.
 *
 * v1.12 #106
 */
export function roundDuration(seconds: number, roundMinutes: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  if (!Number.isFinite(roundMinutes) || roundMinutes <= 0) return seconds
  const stepSeconds = roundMinutes * 60
  return Math.ceil(seconds / stepSeconds) * stepSeconds
}

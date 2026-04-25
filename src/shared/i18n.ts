/**
 * Minimal i18n runtime (v1.5 PR D).
 *
 * No runtime deps, fully tree-shakeable. Locale files are plain TS objects
 * so TypeScript catches dead/missing keys at compile time.
 *
 * Interpolation: single-brace `{key}` syntax.
 *   translate(strings, 'update.available', { version: '1.5.1' })
 *   → "Version 1.5.1 verfügbar — wird heruntergeladen …"
 */

export type Locale = 'de' | 'en'

/**
 * Translate a single key with optional variable substitution.
 *
 * Falls back to the key string itself when no translation is found so the
 * UI never shows `undefined`.
 */
export function translate(
  strings: Record<string, string>,
  key: string,
  vars?: Record<string, string | number>
): string {
  let s = strings[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v))
    }
  }
  return s
}

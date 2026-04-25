import type { TranslationKey } from './de'

/**
 * English locale (v1.5 PR D).
 *
 * Covers the same keys as `de.ts`. TypeScript enforces completeness via the
 * `Record<TranslationKey, string>` type — a missing key is a compile error.
 *
 * Scope: only components migrated in v1.5 (UpdateBanner, SettingsView new
 * sections). Remaining DE-only UI strings get an EN translation in v1.6.
 */
export const en: Record<TranslationKey, string> = {
  // ── UpdateBanner ────────────────────────────────────────────────────────
  'update.checking': 'Checking for updates …',
  'update.available': 'Version {version} available — downloading …',
  'update.downloading': 'Downloading version {version}: {progress}%',
  'update.ready.text': 'Version {version} ready — restart now?',
  'update.ready.install': 'Restart now',
  'update.ready.dismiss': 'Not now',
  'update.error.text': 'Update error: {message}',
  'update.error.details': 'Details in Settings',

  // ── Settings → Diagnose ─────────────────────────────────────────────────
  'settings.diagnose.title': 'Diagnostics',
  'settings.diagnose.reveal': 'Show log file in Explorer',
  'settings.diagnose.open': 'Open log directory',
  'settings.diagnose.hint': 'If something goes wrong: attach the log file to your bug report.',

  // ── Settings → Updates ──────────────────────────────────────────────────
  'settings.update.title': 'Updates',
  'settings.update.version': 'Current version: {version}',
  'settings.update.checkNow': 'Check for updates now',
  'settings.update.checking': 'Checking …',
  'settings.update.lastCheck': 'Last check',
  'settings.update.never': 'Never checked',
  'settings.update.status': 'Status',
  'settings.update.errorLabel': 'Error',

  // ── Settings → Language ─────────────────────────────────────────────────
  'settings.language.title': 'Language',
  'settings.language.de': 'Deutsch',
  'settings.language.en': 'English',
}

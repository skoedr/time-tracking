/**
 * German locale — source of truth for all translatable strings (v1.5 PR D).
 *
 * Conventions:
 * - Keys are dot-namespaced: `component.section.label`
 * - Interpolation slots use single braces: `{variable}`
 * - EN locale must contain every key defined here (enforced by type).
 *
 * Migrated components in v1.5: UpdateBanner, SettingsView (Diagnose +
 * Update + Language sections). Other views stay hardcoded until v1.6.
 */
export const de = {
  // ── UpdateBanner ────────────────────────────────────────────────────────
  'update.checking': 'Suche nach Updates …',
  'update.available': 'Version {version} verfügbar — wird heruntergeladen …',
  'update.downloading': 'Lade Version {version}: {progress}%',
  'update.ready.text': 'Version {version} bereit — App neu starten?',
  'update.ready.install': 'Jetzt neu starten',
  'update.ready.dismiss': 'Nicht jetzt',
  'update.error.text': 'Update-Fehler: {message}',
  'update.error.details': 'Details in Einstellungen',

  // ── Settings → Diagnose ─────────────────────────────────────────────────
  'settings.diagnose.title': 'Diagnose',
  'settings.diagnose.reveal': 'Log-Datei im Explorer zeigen',
  'settings.diagnose.open': 'Log-Verzeichnis öffnen',
  'settings.diagnose.hint':
    'Bei Problemen: Log-Datei kopieren und beim Bug-Report anhängen.',

  // ── Settings → Updates ──────────────────────────────────────────────────
  'settings.update.title': 'Updates',
  'settings.update.version': 'Aktuelle Version: {version}',
  'settings.update.checkNow': 'Jetzt nach Updates suchen',
  'settings.update.checking': 'Suche …',
  'settings.update.lastCheck': 'Letzter Check',
  'settings.update.never': 'Noch nie geprüft',
  'settings.update.status': 'Status',
  'settings.update.errorLabel': 'Fehler',

  // ── Settings → Sprache ──────────────────────────────────────────────────
  'settings.language.title': 'Sprache',
  'settings.language.de': 'Deutsch',
  'settings.language.en': 'English',
} as const

export type TranslationKey = keyof typeof de

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
  // ── Onboarding-Wizard ───────────────────────────────────────
  'onboarding.step': 'Schritt {current} von {total}',
  'onboarding.skip': 'Überspringen',
  'onboarding.next': 'Weiter',
  'onboarding.finish': 'Loslegen',

  // Step 1 — Willkommen
  'onboarding.welcome.title': 'Willkommen bei TimeTrack',
  'onboarding.welcome.body':
    'Erfasse deine Arbeitszeiten sekundengenau — für Kunden, Stundennachweise und den Überblick am Ende des Monats.',
  'onboarding.welcome.languageLabel': 'Sprache',

  // Step 2 — Erster Kunde
  'onboarding.client.title': 'Erster Kunde',
  'onboarding.client.body': 'Lege direkt deinen ersten Kunden an oder überspringe diesen Schritt.',
  'onboarding.client.namePlaceholder': 'z. B. Acme GmbH',
  'onboarding.client.nameLabel': 'Kundenname',
  'onboarding.client.rateLabel': 'Stundensatz (optional)',
  'onboarding.client.ratePlaceholder': 'z. B. 85',
  'onboarding.client.rateUnit': '€ / Stunde',
  'onboarding.client.colorLabel': 'Farbe',
  'onboarding.client.create': 'Kunden anlegen',

  // Step 3 — Hotkey
  'onboarding.hotkey.title': 'Globaler Hotkey',
  'onboarding.hotkey.body':
    'Starte und stoppe den Timer von überall — auch wenn TimeTrack im Hintergrund läuft.',
  'onboarding.hotkey.default': 'Standard-Hotkey: {hotkey}',
  'onboarding.hotkey.mini':
    'Das Mini-Widget bleibt immer im Bild und zeigt den laufenden Timer. Einblenden mit {hotkey}.',
  'onboarding.hotkey.hint': 'Beide Hotkeys sind in Einstellungen änderbar.',

  // Settings — Re-Trigger
  'settings.onboarding.retrigger': 'Onboarding erneut anzeigen',

  // ── About-Dialog ─────────────────────────────────────────────
  'about.title': 'Über TimeTrack',
  'about.version': 'Version',
  'about.ownLicense': 'Lizenz',
  'about.thirdParty': 'Drittanbieter-Pakete',
  'about.loading': 'Lade Lizenzinformationen …',
  'about.noLicenseText': 'Kein Lizenztext verfügbar.',
  'about.close': 'Schließen',
  'about.open': 'Lizenzen & Über',
} as const

export type TranslationKey = keyof typeof de

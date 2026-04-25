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
  // ── Onboarding wizard ───────────────────────────────────────
  'onboarding.step': 'Step {current} of {total}',
  'onboarding.skip': 'Skip',
  'onboarding.next': 'Next',
  'onboarding.finish': 'Get started',

  // Step 1 — Welcome
  'onboarding.welcome.title': 'Welcome to TimeTrack',
  'onboarding.welcome.body':
    'Track your working hours to the second — for clients, invoices, and your end-of-month overview.',
  'onboarding.welcome.languageLabel': 'Language',

  // Step 2 — First client
  'onboarding.client.title': 'First client',
  'onboarding.client.body': 'Create your first client now or skip this step.',
  'onboarding.client.namePlaceholder': 'e.g. Acme Inc.',
  'onboarding.client.nameLabel': 'Client name',
  'onboarding.client.rateLabel': 'Hourly rate (optional)',
  'onboarding.client.ratePlaceholder': 'e.g. 85',
  'onboarding.client.rateUnit': '€ / hour',
  'onboarding.client.colorLabel': 'Color',
  'onboarding.client.create': 'Create client',

  // Step 3 — Hotkey
  'onboarding.hotkey.title': 'Global hotkey',
  'onboarding.hotkey.body':
    'Start and stop the timer from anywhere — even when TimeTrack is running in the background.',
  'onboarding.hotkey.default': 'Default hotkey: {hotkey}',
  'onboarding.hotkey.mini':
    'The mini widget stays always on top and shows the running timer. Show it with {hotkey}.',
  'onboarding.hotkey.hint': 'Both hotkeys can be changed in Settings.',

  // Settings — Re-Trigger
  'settings.onboarding.retrigger': 'Show onboarding again',}

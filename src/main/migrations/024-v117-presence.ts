import type { Migration } from './index'

/**
 * v1.17 #132 — Teams presence mirroring settings.
 *
 * `presence_enabled` gates the feature (work/school accounts only — personal
 * Microsoft accounts have no presence API). `presence_show_client` decides
 * whether the status message names the client or stays generic ("Fokus") —
 * generic by default so no client name leaves the machine without an explicit
 * opt-in.
 *
 * `INSERT OR IGNORE` keeps it idempotent and never overwrites a user choice.
 */
export const migration024: Migration = {
  version: 24,
  name: 'v1.17-presence',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('presence_enabled', '0'),
      ('presence_show_client', '0');
  `
}

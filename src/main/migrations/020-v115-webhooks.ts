import type { Migration } from './index'

/**
 * v1.15 #134 — Outbound-Webhooks.
 *
 * Seeds `webhook_targets`, the JSON blob that holds the configured targets
 * (URL, secret, subscribed events, enabled flag). Stored as one settings row
 * just like `export_prefs`; parsed with field-wise validation in
 * src/shared/webhooks.ts, never trusted via a bare JSON.parse.
 *
 * `INSERT OR IGNORE` keeps this idempotent and never clobbers a user's list.
 */
export const migration020: Migration = {
  version: 20,
  name: 'v1.15-webhooks',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('webhook_targets', '[]');
  `
}

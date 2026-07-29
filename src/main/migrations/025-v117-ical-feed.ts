import type { Migration } from './index'

/**
 * v1.17 #169 — subscribable iCal feed settings.
 *
 * `ical_feed_enabled` gates the local webcal server; `ical_feed_port` is the
 * listen port (empty ⇒ built-in default); `ical_feed_token` stays empty until
 * the feature is first enabled — the token is persistent because calendar
 * clients store the subscription URL.
 *
 * `INSERT OR IGNORE` keeps it idempotent and never overwrites a user choice.
 */
export const migration025: Migration = {
  version: 25,
  name: 'v1.17-ical-feed',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('ical_feed_enabled', '0'),
      ('ical_feed_port', ''),
      ('ical_feed_token', '');
  `
}

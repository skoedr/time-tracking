import type { Migration } from './index'

/**
 * v1.17 #133 — hardware-key controller setting.
 *
 * Seeds `controller_enabled`, the master gate for the controller scope of the
 * local write bridge (Stream Deck & co.). Controller clients authenticate with
 * their own token file and may only call the controller ops (toggle_timer,
 * get_timer_status, list_targets) — never the MCP write ops, and vice versa.
 *
 * `INSERT OR IGNORE` keeps it idempotent and never overwrites a user choice.
 */
export const migration023: Migration = {
  version: 23,
  name: 'v1.17-hardware-keys',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('controller_enabled', '0');
  `
}

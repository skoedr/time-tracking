import type { Migration } from './index'

/**
 * v1.1 settings additions:
 * - idle_threshold_minutes — for idle-detection modal
 * - language              — UI language stub (i18n proper lands in v1.2)
 * - auto_start            — Windows auto-launch toggle
 * - hotkey_toggle         — global hotkey for start/stop
 */
export const migration002: Migration = {
  version: 2,
  name: 'v1.1-settings',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES ('idle_threshold_minutes', '5');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('language', 'de');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_start', '0');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('hotkey_toggle', 'Alt+Shift+S');
  `
}

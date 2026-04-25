import type { Migration } from './index'

/**
 * v1.4 — Mini-Widget settings. The widget is opt-in (default off) so existing
 * users get no surprise overlay on update. Position sentinels (-1/-1) mean
 * "never positioned, place at bottom-right of primary display".
 */
export const migration006: Migration = {
  version: 6,
  name: 'v1.4-mini-widget',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES ('mini_enabled', '0');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('mini_hotkey', 'Alt+Shift+M');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('mini_x', '-1');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('mini_y', '-1');
  `
}

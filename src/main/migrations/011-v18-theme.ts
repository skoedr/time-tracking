import type { Migration } from './index'

/**
 * v1.8 #76 — Light / Dark / System theme preference.
 *
 * Seeds `theme_mode = 'system'` for all installs — existing users get the
 * same system-follow behaviour they implicitly had (dark-only app matched
 * most people's OS setting). Fresh installs also start on system-follow.
 */
export const migration011: Migration = {
  version: 11,
  name: 'v1.8-theme',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES ('theme_mode', 'system');
  `
}

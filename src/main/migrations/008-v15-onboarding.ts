import type { Migration } from './index'

/**
 * v1.5 PR E — Onboarding.
 *
 * Adds `onboarding_completed` to the settings table.
 *
 * Smart backfill: existing users (those who already have entries) get
 * `onboarding_completed = 1` so they never see the welcome wizard after
 * upgrading from v1.4.x. Fresh installs get 0 (the DEFAULT) and will
 * see the wizard on first launch.
 */
export const migration008: Migration = {
  version: 8,
  name: 'v1.5-onboarding',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES ('onboarding_completed', '0');
    UPDATE settings
      SET value = '1'
      WHERE key = 'onboarding_completed'
        AND (SELECT COUNT(*) FROM entries) > 0;
  `
}

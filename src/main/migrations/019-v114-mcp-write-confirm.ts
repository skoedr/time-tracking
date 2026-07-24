import type { Migration } from './index'

/**
 * v1.14 #127 — MCP write-mode confirmation setting.
 *
 * Seeds `mcp_write_confirm_mode`, which controls how a write coming from the
 * MCP bridge is confirmed in the app:
 *   'per-write' (default) → native confirm dialog on every mutation
 *   'session'             → confirm once per app run, then silent
 *   'silent'              → no dialog (opt-in + preview + audit log only)
 *
 * `INSERT OR IGNORE` keeps it idempotent and never overwrites a user choice.
 */
export const migration019: Migration = {
  version: 19,
  name: 'v1.14-mcp-write-confirm',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('mcp_write_confirm_mode', 'per-write');
  `
}

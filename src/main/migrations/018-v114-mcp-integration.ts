import type { Migration } from './index'

/**
 * v1.14 #128 — MCP-Integration settings.
 *
 * Seeds the key-value flags that back the new "Integrationen" settings
 * submenu. All default to off ('0'):
 *
 *  - mcp_expose_rates          → let the read-only MCP server include hourly
 *                                rates and derived revenue in its responses.
 *  - mcp_expose_private_notes  → let it include the internal `private_note`.
 *  - mcp_write_enabled         → master gate for the (future) guarded write
 *                                path (#127). Present now so the UI can render
 *                                the toggle; the server ignores it until the
 *                                write feature lands.
 *
 * `INSERT OR IGNORE` keeps this idempotent and never clobbers a user choice.
 * The read-only MCP server reads these keys directly from the DB; an
 * environment variable, when set, overrides the stored flag.
 */
export const migration018: Migration = {
  version: 18,
  name: 'v1.14-mcp-integration',
  up: `
    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('mcp_expose_rates', '0'),
      ('mcp_expose_private_notes', '0'),
      ('mcp_write_enabled', '0');
  `
}

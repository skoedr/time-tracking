/**
 * Privacy gates for the read-only MCP surface.
 *
 * Read access means client names, descriptions, hourly rates and internal
 * notes flow into an LLM's context. Two categories are considered sensitive
 * and hidden by default; each can be re-enabled explicitly via env var:
 *
 *   TIMETRACK_MCP_EXPOSE_RATES=1          → include rate_cent / revenue fields
 *   TIMETRACK_MCP_EXPOSE_PRIVATE_NOTES=1  → include Entry.private_note
 *
 * Everything else (names, colours, descriptions, timestamps, tags, references)
 * is always exposed — it is the point of the integration.
 */

export interface PrivacyConfig {
  /** Include hourly rates (client/project rate_cent) and derived revenue. */
  exposeRates: boolean
  /** Include the internal-only `private_note` field on entries. */
  exposePrivateNotes: boolean
}

function truthy(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

export function privacyFromEnv(env: NodeJS.ProcessEnv = process.env): PrivacyConfig {
  return {
    exposeRates: truthy(env.TIMETRACK_MCP_EXPOSE_RATES),
    exposePrivateNotes: truthy(env.TIMETRACK_MCP_EXPOSE_PRIVATE_NOTES)
  }
}

/**
 * Effective privacy config for a request. A category is exposed when EITHER
 * the stored app setting (Einstellungen → Integrationen) OR the corresponding
 * environment variable enables it — so the in-app toggle and an explicit env
 * override are both honoured, and either one alone suffices.
 */
export function resolvePrivacy(
  stored: { exposeRates?: boolean; exposePrivateNotes?: boolean },
  env: NodeJS.ProcessEnv = process.env
): PrivacyConfig {
  const fromEnv = privacyFromEnv(env)
  return {
    exposeRates: fromEnv.exposeRates || stored.exposeRates === true,
    exposePrivateNotes: fromEnv.exposePrivateNotes || stored.exposePrivateNotes === true
  }
}

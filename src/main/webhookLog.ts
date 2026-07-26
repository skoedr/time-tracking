/**
 * Delivery log for outbound webhooks (v1.15 #134).
 *
 * Own electron-log scope so records land next to the app logs
 * (%AppData%/time-tracking/logs on Windows) as `webhooks.log`, with the same
 * size-based rotation. Mirrors mcpAudit.ts.
 *
 * NEVER logs the secret or the signature — only what's needed to see whether a
 * delivery went out and why it failed. The full URL is reduced to its host so a
 * token embedded in a query string can't leak into the log file.
 */
import log from 'electron-log/main'

const whLog = log.create({ logId: 'webhooks' })
whLog.transports.file.fileName = 'webhooks.log'
// Console transport would duplicate into the main log; keep it file-only.
whLog.transports.console.level = false

export interface WebhookLogRecord {
  delivery_id: string
  event: string
  target_id: string
  /** Host only (no path, no query) — avoids leaking query-string tokens. */
  host: string
  ok: boolean
  /** HTTP status of the final attempt, when a response was received. */
  status?: number
  /** Number of attempts made (1–3). */
  attempts: number
  /** Short error class for a network/timeout failure. Never the payload. */
  error?: string
}

/** Append one delivery outcome. Must never throw into the delivery path. */
export function logWebhookDelivery(record: WebhookLogRecord): void {
  try {
    whLog.info('delivery', JSON.stringify(record))
  } catch {
    // Logging must never break (or block) a delivery — let alone a timer.
  }
}

/**
 * The bracket around the calendar import (#130b): time range in, proposal list
 * out. Wires together what the other modules deliberately keep apart —
 * `graphAccount.getAccessToken` (token, refreshed if needed),
 * `graphCalendar.fetchCalendarView` (the I/O), `clientDomains.domainMapping`
 * (domain → client), the dedupe set from `entries.graph_event_id`, and finally
 * `shared/graphCalendar.mapEvents` (the rules).
 *
 * Nothing here decides anything; it only fetches inputs and hands them to the
 * pure mapping. That keeps this file small enough that the one thing it must
 * get right is visible: WHICH rows count as already imported. Soft-deleted
 * entries do not — deleting an imported entry is "I did not mean this one",
 * and the event must be offered again (see migration 021).
 */
import type Database from 'better-sqlite3'
import { getAccessToken, getStatus, type GraphAccountDeps } from './graphAccount'
import { fetchCalendarView, GraphCalendarError, type CalendarRange } from './graphCalendar'
import { domainMapping } from './clientDomains'
import { domainOf, mapEvents, type FilterOptions, type MappedEvents } from '../shared/graphCalendar'

export interface PreviewDeps {
  account: GraphAccountDeps
  fetchFn?: typeof fetch
  log?: (message: string) => void
}

/** Graph event ids of entries that still exist — the dedupe input. */
export function importedEventIds(db: Database.Database): Set<string> {
  const rows = db
    .prepare(
      `SELECT graph_event_id AS id FROM entries
       WHERE graph_event_id IS NOT NULL AND deleted_at IS NULL`
    )
    .all() as Array<{ id: string }>
  return new Set(rows.map((r) => r.id))
}

/**
 * The user's own mail domain, used to strip internal attendees. Empty when no
 * account is connected or the username carries no usable domain — then no
 * domain is "own" and every attendee counts as external, which is the honest
 * fallback.
 */
export function ownDomains(deps: GraphAccountDeps): string[] {
  const domain = domainOf(getStatus(deps).account?.username)
  return domain ? [domain] : []
}

function validRange(range: CalendarRange): boolean {
  const start = Date.parse(range?.startIso ?? '')
  const end = Date.parse(range?.endIso ?? '')
  return Number.isFinite(start) && Number.isFinite(end) && start < end
}

/**
 * Fetch the range and translate it into entry drafts. Throws
 * `GraphCalendarError` with a user-facing message on every failure mode the
 * user can do something about; the IPC layer only stringifies.
 */
export async function previewCalendarImport(
  db: Database.Database,
  range: CalendarRange,
  deps: PreviewDeps,
  filters?: FilterOptions
): Promise<MappedEvents> {
  if (!validRange(range)) {
    throw new GraphCalendarError('Der Zeitraum ist ungültig: Beginn muss vor dem Ende liegen.')
  }

  const token = await getAccessToken(deps.account)
  if (!token) {
    throw new GraphCalendarError(
      'Kein Microsoft-Konto verbunden. Bitte in den Einstellungen verbinden.'
    )
  }

  const events = await fetchCalendarView(token, range, { fetchFn: deps.fetchFn, log: deps.log })
  return mapEvents(events, {
    ownDomains: ownDomains(deps.account),
    mapping: domainMapping(db),
    alreadyImported: importedEventIds(db),
    filters
  })
}

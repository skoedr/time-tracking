/**
 * Terminabruf über Microsoft Graph (#130b) — die I/O-Hälfte.
 *
 * Die Regeln, was aus einem Termin wird, stehen in `shared/graphCalendar.ts`.
 * Hier wird nur geholt. `fetch` ist injiziert, damit Paging und Fehlerbehandlung
 * ohne Netz prüfbar sind.
 *
 * Endpunkt ist `calendarView`, nicht `events`: Ersteres löst Serien in einzelne
 * Vorkommen auf. Wer den täglichen Stand-up übernehmen will, meint die einzelnen
 * Termine — `events` lieferte den Serienkopf und damit einen einzigen Eintrag
 * für ein halbes Jahr.
 */
import type { GraphEvent } from '../shared/graphCalendar'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const REQUEST_TIMEOUT_MS = 30_000

/**
 * Nur die Felder anfordern, die gebraucht werden.
 *
 * Nicht dabei: `body` und `bodyPreview`. Der Termintext enthält regelmäßig
 * Einwahldaten, PINs und ganze Mailverläufe — was gar nicht erst geholt wird,
 * kann auch nicht versehentlich in einem Stundennachweis landen.
 */
const SELECT_FIELDS = [
  'id',
  'subject',
  'start',
  'end',
  'isAllDay',
  'isCancelled',
  'showAs',
  'organizer',
  'attendees',
  'responseStatus'
].join(',')

/** Obergrenze pro Seite. Graph erlaubt bei calendarView maximal 1000. */
const PAGE_SIZE = 200

/**
 * Reißleine gegen eine endlose Paging-Kette. 50 Seiten sind 10.000 Termine —
 * jenseits von allem, was ein Zeitraum für eine Zeiterfassung hergibt, und
 * damit ein Zeichen für einen Fehler statt für einen vollen Kalender.
 */
const MAX_PAGES = 50

export class GraphCalendarError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null
  ) {
    super(message)
    this.name = 'GraphCalendarError'
  }
}

export interface CalendarFetchDeps {
  fetchFn?: typeof fetch
  log?: (message: string) => void
}

export interface CalendarRange {
  /** Inklusiver Beginn, ISO mit Zone. */
  startIso: string
  /** Exklusives Ende, ISO mit Zone. */
  endIso: string
}

export function calendarViewUrl(range: CalendarRange): string {
  const q = new URLSearchParams({
    startDateTime: range.startIso,
    endDateTime: range.endIso,
    $select: SELECT_FIELDS,
    $orderby: 'start/dateTime',
    $top: String(PAGE_SIZE)
  })
  return `${GRAPH_BASE}/me/calendarView?${q.toString()}`
}

interface Page {
  value?: unknown[]
  '@odata.nextLink'?: string
}

/**
 * Alle Termine eines Zeitraums holen, über alle Seiten hinweg.
 *
 * `Prefer: outlook.timezone="UTC"` ist wichtig: ohne den Header liefert Graph
 * die Zeiten in der Kalenderzone des Postfachs, und `shared/graphCalendar.ts`
 * würde sie als UTC lesen — Termine lägen dann um den Zonenversatz daneben.
 *
 * Die Folge-URL aus `@odata.nextLink` wird UNVERÄNDERT verwendet. Sie trägt
 * bereits alle Parameter samt Skip-Token; sie neu zusammenzubauen ist der
 * klassische Weg, sich eine Endlosschleife über Seite 1 zu bauen.
 */
export async function fetchCalendarView(
  accessToken: string,
  range: CalendarRange,
  deps: CalendarFetchDeps = {}
): Promise<GraphEvent[]> {
  const fetchFn = deps.fetchFn ?? fetch
  const log = deps.log ?? ((): void => {})

  const events: GraphEvent[] = []
  let url: string | null = calendarViewUrl(range)
  let pages = 0

  while (url) {
    if (pages >= MAX_PAGES) {
      log(`graph calendar: stopped after ${MAX_PAGES} pages`)
      throw new GraphCalendarError(
        `Der Zeitraum liefert mehr als ${MAX_PAGES * PAGE_SIZE} Termine. Bitte enger wählen.`
      )
    }
    pages++

    const res: Response = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        // Ohne diesen Header kommen die Zeiten in der Postfachzone zurück.
        Prefer: 'outlook.timezone="UTC"'
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })

    if (!res.ok) {
      log(`graph calendar: request failed (HTTP ${res.status}, page ${pages})`)
      throw new GraphCalendarError(describeStatus(res.status), res.status)
    }

    let page: Page
    try {
      page = (await res.json()) as Page
    } catch {
      throw new GraphCalendarError('Antwort von Microsoft Graph war kein JSON.', res.status)
    }

    for (const item of page.value ?? []) {
      if (item !== null && typeof item === 'object') events.push(item as GraphEvent)
    }
    url = typeof page['@odata.nextLink'] === 'string' ? page['@odata.nextLink'] : null
  }

  log(`graph calendar: ${events.length} Termine über ${pages} Seite(n)`)
  return events
}

/**
 * HTTP-Status in etwas übersetzen, mit dem ein Nutzer etwas anfangen kann.
 *
 * 403 ist der interessante Fall: Das Token ist gültig, aber der Kalender-Scope
 * fehlt — typischerweise, weil eine ältere Verbindung ohne `Calendars.Read`
 * besteht. Dann hilft nur neu verbinden, und das soll dastehen, statt den
 * Nutzer über einen generischen Fehler rätseln zu lassen.
 */
function describeStatus(status: number): string {
  switch (status) {
    case 401:
      return 'Microsoft hat das Zugriffstoken abgelehnt. Bitte das Konto erneut verbinden.'
    case 403:
      return 'Der Zugriff auf den Kalender wurde verweigert. Bitte das Konto erneut verbinden, damit die Kalender-Berechtigung erteilt wird.'
    case 429:
      return 'Microsoft drosselt gerade die Anfragen. Bitte kurz warten und erneut versuchen.'
    default:
      return `Microsoft Graph antwortete mit HTTP ${status}.`
  }
}

/**
 * Outlook-Termin → Eintrags-Entwurf (#130b) — reine Logik.
 *
 * Kein `fetch`, keine Uhr, keine Datenbank: alles hier ist eine totale Funktion
 * über seine Eingaben, damit die Filter- und Zuordnungsregeln ohne Netz und ohne
 * Kalender prüfbar sind. Der Abruf liegt in `main/graphCalendar.ts`.
 *
 * Abgerufen wird `calendarView`, nicht `events`: Ersteres löst Serien in einzelne
 * Termine auf. Wer den täglichen Stand-up importieren will, meint die einzelnen
 * Vorkommen, nicht den Serienkopf — `events` lieferte genau den und damit einen
 * einzigen Eintrag für die ganze Serie.
 *
 * Feld-Struktur nach der `event`-Ressource der Graph-API v1.0:
 * https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview
 */

/** Was Graph liefert, soweit wir es anfassen. Alles optional — Antworten variieren. */
export interface GraphEvent {
  id?: string
  subject?: string | null
  bodyPreview?: string | null
  isAllDay?: boolean
  isCancelled?: boolean
  /** `free` markiert Termine, die keine Arbeitszeit sind (geblockte Fokuszeit u. Ä.). */
  showAs?: string | null
  start?: { dateTime?: string; timeZone?: string } | null
  end?: { dateTime?: string; timeZone?: string } | null
  organizer?: { emailAddress?: { name?: string | null; address?: string | null } | null } | null
  attendees?: Array<{
    type?: string | null
    status?: { response?: string | null } | null
    emailAddress?: { name?: string | null; address?: string | null } | null
  }> | null
  /** Die EIGENE Antwort auf die Einladung, nicht die der anderen. */
  responseStatus?: { response?: string | null } | null
}

/** Ein Vorschlag für die Übernahme. Wird erst mit Bestätigung ein Eintrag. */
export interface EntryDraft {
  /** Graph-Event-ID — Anker für das Dedupe. */
  graphEventId: string
  description: string
  startedAt: string
  stoppedAt: string
  /** Aus der Domain abgeleitet, `null` wenn nichts oder mehreres passt. */
  clientId: number | null
  /** Domains der externen Teilnehmer, für die manuelle Zuordnung und das Lernen. */
  domains: string[]
  /** Warum kein Kunde zugeordnet wurde — die UI kann das erklären. */
  clientHint: 'matched' | 'no-domain' | 'unknown-domain' | 'ambiguous'
}

export interface FilterOptions {
  /** Ganztägige Termine ausblenden. Default an: das ist selten Arbeitszeit am Stück. */
  hideAllDay?: boolean
  /** Abgelehnte Einladungen ausblenden. Default an. */
  hideDeclined?: boolean
  /** Als „frei" markierte Termine ausblenden. Default an. */
  hideFree?: boolean
}

export const DEFAULT_FILTERS: Required<FilterOptions> = {
  hideAllDay: true,
  hideDeclined: true,
  hideFree: true
}

/** Warum ein Termin nicht angeboten wird — nur zum Erklären, nicht zum Filtern. */
export type SkipReason =
  | 'cancelled'
  | 'all-day'
  | 'declined'
  | 'free'
  | 'no-id'
  | 'no-times'
  | 'already-imported'

export interface SkippedEvent {
  graphEventId: string | null
  subject: string
  reason: SkipReason
}

export interface MappedEvents {
  drafts: EntryDraft[]
  skipped: SkippedEvent[]
}

/**
 * Die eigene Absage erkennen.
 *
 * Graph kennt `none`, `organizer`, `tentativelyAccepted`, `accepted`,
 * `declined`, `notResponded`. Nur `declined` ist eine Absage — `notResponded`
 * ist ausdrücklich KEINE, sonst verschwänden alle Termine, die man nie
 * beantwortet, obwohl man hingegangen ist.
 */
export function isDeclinedByMe(event: GraphEvent): boolean {
  return event.responseStatus?.response === 'declined'
}

/** `showAs: 'free'` heißt: im Kalender, aber nicht als Beschäftigung gemeint. */
export function isFree(event: GraphEvent): boolean {
  return event.showAs === 'free'
}

/**
 * Domain aus einer Mailadresse, kleingeschrieben.
 *
 * `null` bei allem, was nicht wie eine Adresse aussieht — Graph liefert bei
 * Raum-Ressourcen und externen Systemen gelegentlich Unfug an dieser Stelle.
 */
export function domainOf(address: string | null | undefined): string | null {
  if (!address) return null
  const at = address.lastIndexOf('@')
  if (at <= 0 || at === address.length - 1) return null
  const domain = address
    .slice(at + 1)
    .trim()
    .toLowerCase()
  return domain.includes('.') ? domain : null
}

/**
 * Die Domains, die für die Kundenzuordnung taugen.
 *
 * Die eigene Domain fliegt raus, und das ist der Kern: Ohne diesen Schritt
 * trüge jeder interne Termin die eigene Firmendomain und würde bei einer
 * einzigen Fehlkonfiguration jedem Kunden zugeordnet. Übrig bleiben genau die
 * Gegenüber.
 */
export function externalDomains(event: GraphEvent, ownDomains: readonly string[]): string[] {
  const own = new Set(ownDomains.map((d) => d.toLowerCase()))
  const addresses = [
    event.organizer?.emailAddress?.address,
    ...(event.attendees ?? []).map((a) => a?.emailAddress?.address)
  ]
  const domains = new Set<string>()
  for (const addr of addresses) {
    const d = domainOf(addr)
    if (d && !own.has(d)) domains.add(d)
  }
  return [...domains].sort()
}

/**
 * Kunde aus den Domains — nur wenn die Antwort eindeutig ist.
 *
 * Zeigen zwei Domains desselben Termins auf verschiedene Kunden, wird bewusst
 * NICHTS zugeordnet: Ein Meeting mit zwei Kunden ist eine echte Situation, und
 * einen davon zu raten wäre schlimmer als zu fragen.
 */
export function resolveClient(
  domains: readonly string[],
  mapping: ReadonlyMap<string, number>
): { clientId: number | null; hint: EntryDraft['clientHint'] } {
  if (domains.length === 0) return { clientId: null, hint: 'no-domain' }
  const matches = new Set<number>()
  for (const d of domains) {
    const id = mapping.get(d.toLowerCase())
    if (id !== undefined) matches.add(id)
  }
  if (matches.size === 1) return { clientId: [...matches][0], hint: 'matched' }
  if (matches.size === 0) return { clientId: null, hint: 'unknown-domain' }
  return { clientId: null, hint: 'ambiguous' }
}

/**
 * Beschreibung des Entwurfs.
 *
 * Nur der Betreff. Die Vorschau des Termintexts wäre verlockend, enthält aber
 * regelmäßig Einwahldaten, Telefonnummern und ganze Mailverläufe — nichts
 * davon gehört in eine Zeiterfassung, die später in einem Stundennachweis beim
 * Kunden landet.
 */
export function describeEvent(event: GraphEvent): string {
  return (event.subject ?? '').trim()
}

/**
 * Graph-Zeitstempel → ISO mit Zone.
 *
 * Graph liefert `dateTime` ohne Zonen-Suffix und die Zone separat. Wir fragen
 * mit `Prefer: outlook.timezone="UTC"` ab, sodass hier UTC ankommt — das `Z`
 * fehlt aber trotzdem, und ohne es würde `new Date()` den Wert als Ortszeit
 * lesen und die Termine um den UTC-Versatz verschieben.
 */
export function toIsoUtc(
  part: { dateTime?: string; timeZone?: string } | null | undefined
): string | null {
  const raw = part?.dateTime?.trim()
  if (!raw) return null
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`
  const ms = Date.parse(withZone)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/**
 * Termine in Entwürfe übersetzen und dabei aussortieren, was keiner ist.
 *
 * `alreadyImported` kommt aus der Datenbank (`entries.graph_event_id`) und ist
 * das Dedupe: ein einmal übernommener Termin wird nicht erneut angeboten.
 */
export function mapEvents(
  events: readonly GraphEvent[],
  opts: {
    ownDomains: readonly string[]
    mapping: ReadonlyMap<string, number>
    alreadyImported: ReadonlySet<string>
    filters?: FilterOptions
  }
): MappedEvents {
  const filters = { ...DEFAULT_FILTERS, ...opts.filters }
  const drafts: EntryDraft[] = []
  const skipped: SkippedEvent[] = []
  const note = (id: string | null, event: GraphEvent, reason: SkipReason): void => {
    skipped.push({ graphEventId: id, subject: describeEvent(event), reason })
  }

  for (const event of events) {
    const id = event.id?.trim() || null
    if (!id) {
      note(null, event, 'no-id')
      continue
    }
    // Abgesagte immer raus — die sind kein Filter, sondern keine Termine mehr.
    if (event.isCancelled === true) {
      note(id, event, 'cancelled')
      continue
    }
    if (opts.alreadyImported.has(id)) {
      note(id, event, 'already-imported')
      continue
    }
    if (filters.hideAllDay && event.isAllDay === true) {
      note(id, event, 'all-day')
      continue
    }
    if (filters.hideDeclined && isDeclinedByMe(event)) {
      note(id, event, 'declined')
      continue
    }
    if (filters.hideFree && isFree(event)) {
      note(id, event, 'free')
      continue
    }

    const startedAt = toIsoUtc(event.start)
    const stoppedAt = toIsoUtc(event.end)
    // Ohne verwertbare Zeiten gibt es nichts zu erfassen. Ende vor Anfang ist
    // kein theoretischer Fall: über Zonenwechsel hinweg kommt das vor.
    if (!startedAt || !stoppedAt || Date.parse(stoppedAt) <= Date.parse(startedAt)) {
      note(id, event, 'no-times')
      continue
    }

    const domains = externalDomains(event, opts.ownDomains)
    const { clientId, hint } = resolveClient(domains, opts.mapping)
    drafts.push({
      graphEventId: id,
      description: describeEvent(event),
      startedAt,
      stoppedAt,
      clientId,
      domains,
      clientHint: hint
    })
  }

  // Chronologisch — so liest man einen Tag, und so steht es später im Dialog.
  drafts.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  return { drafts, skipped }
}

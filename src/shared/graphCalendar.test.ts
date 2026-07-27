import { describe, it, expect } from 'vitest'
import {
  DEFAULT_FILTERS,
  describeEvent,
  domainOf,
  externalDomains,
  isDeclinedByMe,
  isFree,
  mapEvents,
  resolveClient,
  toIsoUtc,
  type GraphEvent
} from './graphCalendar'

const OWN = ['wald-it.com']

/**
 * Fixture in der Struktur, die die Graph-`event`-Ressource wirklich hat —
 * `start.dateTime` + `timeZone`, Teilnehmer unter `emailAddress.address`, die
 * eigene Antwort unter `responseStatus.response`. Inhalte sind erfunden, die
 * Form nicht: eine ausgedachte Form würde die Filter blind testen.
 */
function event(over: Partial<GraphEvent> = {}): GraphEvent {
  return {
    id: 'evt-1',
    subject: 'Abstimmung Migration',
    isAllDay: false,
    isCancelled: false,
    showAs: 'busy',
    start: { dateTime: '2026-07-27T09:00:00.0000000', timeZone: 'UTC' },
    end: { dateTime: '2026-07-27T10:30:00.0000000', timeZone: 'UTC' },
    organizer: { emailAddress: { name: 'Robin Wald', address: 'robin@wald-it.com' } },
    attendees: [
      {
        type: 'required',
        status: { response: 'accepted' },
        emailAddress: { name: 'Alice', address: 'alice@kunde-x.de' }
      }
    ],
    responseStatus: { response: 'organizer' },
    ...over
  }
}

const MAPPING = new Map<string, number>([
  ['kunde-x.de', 1],
  ['kunde-y.de', 2]
])

function map(
  events: GraphEvent[],
  over: Partial<Parameters<typeof mapEvents>[1]> = {}
): ReturnType<typeof mapEvents> {
  return mapEvents(events, {
    ownDomains: OWN,
    mapping: MAPPING,
    alreadyImported: new Set<string>(),
    ...over
  })
}

describe('domainOf', () => {
  it('nimmt die Domain und schreibt sie klein', () => {
    expect(domainOf('Alice@Kunde-X.de')).toBe('kunde-x.de')
  })

  it('nutzt das LETZTE @ — Adressen mit Sonderzeichen im lokalen Teil', () => {
    expect(domainOf('"weird@name"@kunde-x.de')).toBe('kunde-x.de')
  })

  it('liefert null für alles, was keine Adresse ist', () => {
    for (const bad of [null, undefined, '', 'kein-at-zeichen', '@nur-domain', 'lokal@', 'a@b']) {
      expect(domainOf(bad)).toBeNull()
    }
  })
})

describe('externalDomains', () => {
  it('lässt die eigene Domain weg — sonst trüge jeder interne Termin sie', () => {
    expect(externalDomains(event(), OWN)).toEqual(['kunde-x.de'])
  })

  it('nimmt den Organisator mit, wenn der extern ist', () => {
    const e = event({
      organizer: { emailAddress: { address: 'bob@kunde-y.de' } },
      attendees: []
    })
    expect(externalDomains(e, OWN)).toEqual(['kunde-y.de'])
  })

  it('entdoppelt und sortiert', () => {
    const e = event({
      attendees: [
        { emailAddress: { address: 'a@kunde-y.de' } },
        { emailAddress: { address: 'b@kunde-y.de' } },
        { emailAddress: { address: 'c@kunde-x.de' } }
      ]
    })
    expect(externalDomains(e, OWN)).toEqual(['kunde-x.de', 'kunde-y.de'])
  })

  it('ist leer bei einem rein internen Termin', () => {
    const e = event({
      attendees: [{ emailAddress: { address: 'kollege@wald-it.com' } }]
    })
    expect(externalDomains(e, OWN)).toEqual([])
  })

  it('vergleicht die eigene Domain ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    const e = event({ attendees: [{ emailAddress: { address: 'x@WALD-IT.COM' } }] })
    expect(externalDomains(e, ['wald-it.com'])).toEqual([])
  })

  it('überspringt Teilnehmer ohne brauchbare Adresse (Räume, Fremdsysteme)', () => {
    const e = event({
      attendees: [
        { emailAddress: { address: null } },
        { emailAddress: null },
        { emailAddress: { address: 'Konferenzraum 3' } },
        { emailAddress: { address: 'alice@kunde-x.de' } }
      ]
    })
    expect(externalDomains(e, OWN)).toEqual(['kunde-x.de'])
  })
})

describe('resolveClient', () => {
  it('ordnet zu, wenn genau ein Kunde passt', () => {
    expect(resolveClient(['kunde-x.de'], MAPPING)).toEqual({ clientId: 1, hint: 'matched' })
  })

  it('ordnet zu, wenn mehrere Domains auf DENSELBEN Kunden zeigen', () => {
    const m = new Map([
      ['kunde-x.de', 1],
      ['kunde-x.at', 1]
    ])
    expect(resolveClient(['kunde-x.de', 'kunde-x.at'], m)).toEqual({
      clientId: 1,
      hint: 'matched'
    })
  })

  it('ordnet NICHTS zu, wenn zwei Kunden im Termin sitzen', () => {
    // Ein Meeting mit zwei Kunden ist real. Einen davon zu raten wäre
    // schlimmer als zu fragen.
    expect(resolveClient(['kunde-x.de', 'kunde-y.de'], MAPPING)).toEqual({
      clientId: null,
      hint: 'ambiguous'
    })
  })

  it('unterscheidet „keine Domain" von „Domain unbekannt"', () => {
    expect(resolveClient([], MAPPING).hint).toBe('no-domain')
    expect(resolveClient(['fremd.de'], MAPPING).hint).toBe('unknown-domain')
  })

  it('trifft auch bei abweichender Schreibweise', () => {
    expect(resolveClient(['KUNDE-X.DE'], MAPPING).clientId).toBe(1)
  })
})

describe('toIsoUtc', () => {
  it('ergänzt das fehlende Z — sonst läse new Date() den Wert als Ortszeit', () => {
    expect(toIsoUtc({ dateTime: '2026-07-27T09:00:00.0000000', timeZone: 'UTC' })).toBe(
      '2026-07-27T09:00:00.000Z'
    )
  })

  it('respektiert einen bereits vorhandenen Versatz', () => {
    expect(toIsoUtc({ dateTime: '2026-07-27T11:00:00+02:00' })).toBe('2026-07-27T09:00:00.000Z')
  })

  it('liefert null statt Invalid Date', () => {
    for (const bad of [null, undefined, {}, { dateTime: '' }, { dateTime: 'übermorgen' }]) {
      expect(toIsoUtc(bad as never)).toBeNull()
    }
  })
})

describe('isDeclinedByMe / isFree', () => {
  it('erkennt die eigene Absage', () => {
    expect(isDeclinedByMe(event({ responseStatus: { response: 'declined' } }))).toBe(true)
  })

  it('wertet „nicht geantwortet" NICHT als Absage', () => {
    // Sonst verschwänden alle Termine, die man nie beantwortet, obwohl man
    // hingegangen ist — der Normalfall bei internen Einladungen.
    for (const r of ['none', 'notResponded', 'accepted', 'tentativelyAccepted', 'organizer']) {
      expect(isDeclinedByMe(event({ responseStatus: { response: r } }))).toBe(false)
    }
  })

  it('erkennt als frei markierte Termine', () => {
    expect(isFree(event({ showAs: 'free' }))).toBe(true)
    expect(isFree(event({ showAs: 'busy' }))).toBe(false)
    expect(isFree(event({ showAs: 'tentative' }))).toBe(false)
  })
})

describe('describeEvent', () => {
  it('nimmt den Betreff', () => {
    expect(describeEvent(event({ subject: '  Abstimmung  ' }))).toBe('Abstimmung')
  })

  it('nimmt NICHT den Termintext mit', () => {
    // bodyPreview enthält regelmäßig Einwahldaten und ganze Mailverläufe —
    // nichts davon gehört in einen Stundennachweis beim Kunden.
    const e = event({ subject: 'Abstimmung', bodyPreview: 'Teams-Einwahl: 123-456, PIN 9999' })
    expect(describeEvent(e)).toBe('Abstimmung')
    expect(describeEvent(e)).not.toContain('PIN')
  })

  it('kommt mit fehlendem Betreff klar', () => {
    expect(describeEvent(event({ subject: null }))).toBe('')
  })
})

describe('mapEvents', () => {
  it('macht aus einem Termin einen Entwurf mit Kunde', () => {
    const { drafts } = map([event()])
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      graphEventId: 'evt-1',
      description: 'Abstimmung Migration',
      startedAt: '2026-07-27T09:00:00.000Z',
      stoppedAt: '2026-07-27T10:30:00.000Z',
      clientId: 1,
      domains: ['kunde-x.de'],
      clientHint: 'matched'
    })
  })

  it('bietet einen bereits übernommenen Termin nicht erneut an — das Dedupe', () => {
    const { drafts, skipped } = map([event()], { alreadyImported: new Set(['evt-1']) })
    expect(drafts).toHaveLength(0)
    expect(skipped[0]).toMatchObject({ graphEventId: 'evt-1', reason: 'already-imported' })
  })

  it('wirft abgesagte Termine immer raus, auch ohne Filter', () => {
    const { drafts, skipped } = map([event({ isCancelled: true })], {
      filters: { hideAllDay: false, hideDeclined: false, hideFree: false }
    })
    expect(drafts).toHaveLength(0)
    expect(skipped[0].reason).toBe('cancelled')
  })

  it.each([
    ['all-day', { isAllDay: true }],
    ['declined', { responseStatus: { response: 'declined' } }],
    ['free', { showAs: 'free' }]
  ] as const)('blendet %s standardmäßig aus', (reason, over) => {
    const { drafts, skipped } = map([event(over)])
    expect(drafts).toHaveLength(0)
    expect(skipped[0].reason).toBe(reason)
  })

  it.each([
    ['all-day', { isAllDay: true }, { hideAllDay: false }],
    ['declined', { responseStatus: { response: 'declined' } }, { hideDeclined: false }],
    ['free', { showAs: 'free' }, { hideFree: false }]
  ] as const)('nimmt %s mit, wenn der Filter aus ist', (_r, over, filters) => {
    expect(map([event(over)], { filters }).drafts).toHaveLength(1)
  })

  it('überspringt Termine ohne verwertbare Zeiten', () => {
    const { drafts, skipped } = map([event({ end: { dateTime: '' } })])
    expect(drafts).toHaveLength(0)
    expect(skipped[0].reason).toBe('no-times')
  })

  it('überspringt Termine, deren Ende nicht nach dem Anfang liegt', () => {
    const e = event({ end: { dateTime: '2026-07-27T09:00:00.0000000', timeZone: 'UTC' } })
    expect(map([e]).skipped[0].reason).toBe('no-times')
  })

  it('überspringt Termine ohne id — ohne die gibt es kein Dedupe', () => {
    expect(map([event({ id: undefined })]).skipped[0].reason).toBe('no-id')
  })

  it('liefert einen internen Termin ohne Kunde, aber als Entwurf', () => {
    // Interne Arbeit ist erfassenswert; nur zuordnen kann man sie nicht.
    const e = event({ attendees: [{ emailAddress: { address: 'kollege@wald-it.com' } }] })
    const { drafts } = map([e])
    expect(drafts[0]).toMatchObject({ clientId: null, clientHint: 'no-domain', domains: [] })
  })

  it('sortiert chronologisch, unabhängig von der Reihenfolge der Antwort', () => {
    const spaet = event({
      id: 'b',
      start: { dateTime: '2026-07-27T14:00:00' },
      end: { dateTime: '2026-07-27T15:00:00' }
    })
    const frueh = event({
      id: 'a',
      start: { dateTime: '2026-07-27T08:00:00' },
      end: { dateTime: '2026-07-27T09:00:00' }
    })
    expect(map([spaet, frueh]).drafts.map((d) => d.graphEventId)).toEqual(['a', 'b'])
  })

  it('nennt für jeden aussortierten Termin einen Grund', () => {
    const { skipped } = map([
      event({ id: 'a', isCancelled: true }),
      event({ id: 'b', isAllDay: true })
    ])
    expect(skipped.map((s) => s.reason)).toEqual(['cancelled', 'all-day'])
    expect(skipped.every((s) => s.subject.length > 0)).toBe(true)
  })

  it('kommt mit einer leeren Antwort klar', () => {
    expect(map([])).toEqual({ drafts: [], skipped: [] })
  })

  it('blendet standardmäßig ganztägig, abgelehnt und frei aus', () => {
    expect(DEFAULT_FILTERS).toEqual({ hideAllDay: true, hideDeclined: true, hideFree: true })
  })
})

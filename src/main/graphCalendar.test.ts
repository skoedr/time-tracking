import { describe, it, expect } from 'vitest'
import { GraphCalendarError, calendarViewUrl, fetchCalendarView } from './graphCalendar'

const RANGE = { startIso: '2026-07-27T00:00:00+02:00', endIso: '2026-07-28T00:00:00+02:00' }

interface Call {
  url: string
  headers: Record<string, string>
}

type Canned = { status: number; body: unknown } | { throws: Error }

function scriptedFetch(queue: Canned[]): { fetchFn: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> })
    const next = queue.shift()
    if (!next) throw new Error(`kein Response mehr für ${String(url)}`)
    if ('throws' in next) throw next.throws
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => {
        if (next.body === '<<invalid json>>') throw new Error('kein JSON')
        return next.body
      }
    } as unknown as Response
  }) as unknown as typeof fetch
  return { fetchFn, calls }
}

const evt = (id: string): Record<string, unknown> => ({ id, subject: `Termin ${id}` })

describe('calendarViewUrl', () => {
  it('nutzt calendarView, nicht events — Serien müssen aufgelöst werden', () => {
    const url = calendarViewUrl(RANGE)
    expect(url).toContain('/me/calendarView')
    expect(url).not.toContain('/me/events')
  })

  it('übergibt den Zeitraum als Query-Parameter', () => {
    const q = new URL(calendarViewUrl(RANGE)).searchParams
    expect(q.get('startDateTime')).toBe(RANGE.startIso)
    expect(q.get('endDateTime')).toBe(RANGE.endIso)
  })

  it('fordert die Felder an, die die Abbildung braucht', () => {
    const select = new URL(calendarViewUrl(RANGE)).searchParams.get('$select') ?? ''
    for (const f of [
      'id',
      'subject',
      'start',
      'end',
      'isAllDay',
      'isCancelled',
      'responseStatus'
    ]) {
      expect(select.split(',')).toContain(f)
    }
  })

  it('fordert den Termintext NICHT an', () => {
    // Was nicht geholt wird, kann nicht versehentlich in einem Stundennachweis
    // landen — bodyPreview enthält Einwahldaten und ganze Mailverläufe.
    const select = new URL(calendarViewUrl(RANGE)).searchParams.get('$select') ?? ''
    expect(select).not.toContain('body')
  })
})

describe('fetchCalendarView', () => {
  it('liefert die Termine einer einzelnen Seite', async () => {
    const s = scriptedFetch([{ status: 200, body: { value: [evt('a'), evt('b')] } }])
    const events = await fetchCalendarView('tok', RANGE, { fetchFn: s.fetchFn })
    expect(events.map((e) => e.id)).toEqual(['a', 'b'])
    expect(s.calls).toHaveLength(1)
  })

  it('schickt das Token und erzwingt UTC', async () => {
    // Ohne den Prefer-Header kämen die Zeiten in der Postfachzone zurück und
    // würden anschließend als UTC gelesen — Termine lägen um den Versatz daneben.
    const s = scriptedFetch([{ status: 200, body: { value: [] } }])
    await fetchCalendarView('tok-123', RANGE, { fetchFn: s.fetchFn })
    expect(s.calls[0].headers.Authorization).toBe('Bearer tok-123')
    expect(s.calls[0].headers.Prefer).toBe('outlook.timezone="UTC"')
  })

  it('folgt @odata.nextLink über mehrere Seiten', async () => {
    const s = scriptedFetch([
      { status: 200, body: { value: [evt('a')], '@odata.nextLink': 'https://graph.test/seite2' } },
      { status: 200, body: { value: [evt('b')], '@odata.nextLink': 'https://graph.test/seite3' } },
      { status: 200, body: { value: [evt('c')] } }
    ])
    const events = await fetchCalendarView('tok', RANGE, { fetchFn: s.fetchFn })
    expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(s.calls).toHaveLength(3)
  })

  it('verwendet die Folge-URL UNVERÄNDERT', async () => {
    // Sie neu zusammenzubauen verlöre das Skip-Token und lieferte ewig Seite 1.
    const s = scriptedFetch([
      {
        status: 200,
        body: { value: [], '@odata.nextLink': 'https://graph.test/x?$skiptoken=ABC123' }
      },
      { status: 200, body: { value: [] } }
    ])
    await fetchCalendarView('tok', RANGE, { fetchFn: s.fetchFn })
    expect(s.calls[1].url).toBe('https://graph.test/x?$skiptoken=ABC123')
  })

  it('schickt das Token auch auf den Folgeseiten mit', async () => {
    const s = scriptedFetch([
      { status: 200, body: { value: [], '@odata.nextLink': 'https://graph.test/seite2' } },
      { status: 200, body: { value: [] } }
    ])
    await fetchCalendarView('tok-123', RANGE, { fetchFn: s.fetchFn })
    expect(s.calls[1].headers.Authorization).toBe('Bearer tok-123')
  })

  it('bricht eine endlose Paging-Kette ab, statt ewig zu laufen', async () => {
    const endlos: Canned[] = Array.from({ length: 80 }, () => ({
      status: 200 as const,
      body: { value: [evt('x')], '@odata.nextLink': 'https://graph.test/immer-weiter' }
    }))
    const s = scriptedFetch(endlos)
    await expect(fetchCalendarView('tok', RANGE, { fetchFn: s.fetchFn })).rejects.toThrow(
      /enger wählen/
    )
    expect(s.calls.length).toBeLessThanOrEqual(50)
  })

  it('kommt mit einer Seite ohne value klar', async () => {
    const s = scriptedFetch([{ status: 200, body: {} }])
    await expect(fetchCalendarView('tok', RANGE, { fetchFn: s.fetchFn })).resolves.toEqual([])
  })

  it('überspringt Einträge, die keine Objekte sind', async () => {
    const s = scriptedFetch([{ status: 200, body: { value: [null, 'text', 42, evt('a')] } }])
    const events = await fetchCalendarView('tok', RANGE, { fetchFn: s.fetchFn })
    expect(events.map((e) => e.id)).toEqual(['a'])
  })

  it.each([
    [401, /erneut verbinden/],
    [403, /Kalender-Berechtigung/],
    [429, /gedrosselt|drosselt/]
  ])('übersetzt HTTP %i in etwas Handlungsfähiges', async (status, pattern) => {
    const s = scriptedFetch([{ status, body: {} }])
    const err = await fetchCalendarView('tok', RANGE, { fetchFn: s.fetchFn }).catch((e) => e)
    expect(err).toBeInstanceOf(GraphCalendarError)
    expect(err.status).toBe(status)
    expect(err.message).toMatch(pattern)
  })

  it('nennt bei unbekanntem Status wenigstens den Code', async () => {
    const s = scriptedFetch([{ status: 500, body: {} }])
    await expect(fetchCalendarView('tok', RANGE, { fetchFn: s.fetchFn })).rejects.toThrow(
      /HTTP 500/
    )
  })

  it('scheitert sauber, wenn die Antwort kein JSON ist', async () => {
    const s = scriptedFetch([{ status: 200, body: '<<invalid json>>' }])
    await expect(fetchCalendarView('tok', RANGE, { fetchFn: s.fetchFn })).rejects.toThrow(
      /kein JSON/
    )
  })

  it('reicht einen Netzfehler durch, statt ihn als leeren Kalender auszugeben', async () => {
    const s = scriptedFetch([{ throws: new Error('getaddrinfo ENOTFOUND') }])
    await expect(fetchCalendarView('tok', RANGE, { fetchFn: s.fetchFn })).rejects.toThrow(
      /ENOTFOUND/
    )
  })

  it('schreibt das Token nicht ins Log', async () => {
    const lines: string[] = []
    const s = scriptedFetch([{ status: 403, body: {} }])
    await fetchCalendarView('GEHEIM-TOKEN', RANGE, {
      fetchFn: s.fetchFn,
      log: (m) => lines.push(m)
    }).catch(() => {})
    expect(lines.join('\n')).not.toContain('GEHEIM-TOKEN')
  })
})

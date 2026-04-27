import { describe, expect, it } from 'vitest'
import { formatCsv } from './csv'
import type { Entry, Client } from './types'

const BASE_CLIENT: Client = {
  id: 1,
  name: 'Acme GmbH',
  color: '#4f46e5',
  active: 1,
  rate_cent: 7500, // 75,00 €/h
  created_at: '2024-01-01T00:00:00.000Z'
}

const CLIENT_MAP = new Map([[1, BASE_CLIENT]])

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 1,
    client_id: 1,
    description: 'Meeting',
    started_at: '2026-04-25T09:00:00.000Z',
    stopped_at: '2026-04-25T10:30:00.000Z',
    heartbeat_at: null,
    rounded_min: null,
    deleted_at: null,
    created_at: '2026-04-25T09:00:00.000Z',
    link_id: null,
    tags: '',
    reference: '',
    billable: 1,
    private_note: '',
    ...overrides
  }
}

describe('formatCsv', () => {
  it('produces UTF-8 BOM', () => {
    const csv = formatCsv([], CLIENT_MAP)
    expect(csv.startsWith('﻿')).toBe(true)
  })

  it('produces CRLF line endings', () => {
    const csv = formatCsv([], CLIENT_MAP)
    expect(csv).toContain('\r\n')
    expect(csv).not.toMatch(/(?<!\r)\n/)
  })

  it('outputs header row', () => {
    const csv = formatCsv([], CLIENT_MAP)
    expect(csv).toContain('Datum;Start;Ende;Dauer;Kunde;Beschreibung;Tags;Referenz;Stundensatz;Betrag')
  })

  it('empty list → header only', () => {
    const csv = formatCsv([], CLIENT_MAP)
    const lines = csv.replace('﻿', '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(1) // just the header
  })

  it('skips running entries (stopped_at = null)', () => {
    const running = makeEntry({ stopped_at: null })
    const csv = formatCsv([running], CLIENT_MAP)
    const lines = csv.replace('﻿', '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(1) // only header
  })

  it('DE format defaults: semicolon sep + comma decimal', () => {
    const entry = makeEntry()
    const csv = formatCsv([entry], CLIENT_MAP)
    // Rate 75.00 → "75,00", all fields semicolon-separated
    expect(csv).toContain(';75,00;')
  })

  it('US format: comma sep + dot decimal', () => {
    const entry = makeEntry()
    const csv = formatCsv([entry], CLIENT_MAP, { fieldSeparator: ',', decimalSeparator: '.' })
    expect(csv).toContain(',75.00,')
  })

  it('calculates Betrag correctly (1.5h × 75 €/h = 112.50)', () => {
    // 09:00 → 10:30 = 5400s = 1.5h × 7500 cent = 11250 cent = 112.50 €
    const entry = makeEntry()
    const csv = formatCsv([entry], CLIENT_MAP)
    expect(csv).toContain('112,50')
  })

  it('leaves Stundensatz + Betrag empty when no rate', () => {
    const noRateClient: Client = { ...BASE_CLIENT, rate_cent: 0 }
    const map = new Map([[1, noRateClient]])
    const csv = formatCsv([makeEntry()], map)
    // last two fields should be empty → line ends with ";;..." trailing sep
    const dataLine = csv.replace('﻿', '').split('\r\n')[1]
    expect(dataLine).toMatch(/;;$/)
  })

  it('renders tags pipe-separated', () => {
    const entry = makeEntry({ tags: ',bug,ux,' })
    const csv = formatCsv([entry], CLIENT_MAP)
    expect(csv).toContain('bug|ux')
  })

  it('empty tags → empty tags field', () => {
    const entry = makeEntry({ tags: '' })
    const csv = formatCsv([entry], CLIENT_MAP)
    // tags column is index 6: Datum(0) Start(1) Ende(2) Dauer(3) Kunde(4) Beschreibung(5) Tags(6)
    const dataLine = csv.replace('﻿', '').split('\r\n')[1]
    const fields = dataLine.split(';')
    expect(fields[6]).toBe('') // tags
  })

  it('reference field appears as Referenz column (index 7)', () => {
    const entry = makeEntry({ reference: 'JIRA-123' })
    const csv = formatCsv([entry], CLIENT_MAP)
    const dataLine = csv.replace('﻿', '').split('\r\n')[1]
    const fields = dataLine.split(';')
    expect(fields[7]).toBe('JIRA-123')
  })

  it('empty reference → empty Referenz column', () => {
    const entry = makeEntry({ reference: '' })
    const csv = formatCsv([entry], CLIENT_MAP)
    const dataLine = csv.replace('﻿', '').split('\r\n')[1]
    const fields = dataLine.split(';')
    expect(fields[7]).toBe('')
  })

  it('reference containing separator is quoted', () => {
    const entry = makeEntry({ reference: 'PROJ; TICKET-42' })
    const csv = formatCsv([entry], CLIENT_MAP)
    expect(csv).toContain('"PROJ; TICKET-42"')
  })

  it('escapes fields containing the separator', () => {
    const entry = makeEntry({ description: 'Projekt; Detail' })
    const csv = formatCsv([entry], CLIENT_MAP)
    expect(csv).toContain('"Projekt; Detail"')
  })

  it('escapes fields containing double quotes', () => {
    const entry = makeEntry({ description: 'Er sagte "Hallo"' })
    const csv = formatCsv([entry], CLIENT_MAP)
    expect(csv).toContain('"Er sagte ""Hallo"""')
  })

  it('escapes fields containing newlines', () => {
    const entry = makeEntry({ description: 'Zeile1\nZeile2' })
    const csv = formatCsv([entry], CLIENT_MAP)
    expect(csv).toContain('"Zeile1\nZeile2"')
  })

  it('handles unknown client_id gracefully (empty client name)', () => {
    const entry = makeEntry({ client_id: 999 })
    const csv = formatCsv([entry], CLIENT_MAP)
    // client name field (index 4) should be empty string
    const dataLine = csv.replace('﻿', '').split('\r\n')[1]
    const fields = dataLine.split(';')
    expect(fields[4]).toBe('') // no client → empty
  })

  it('midnight-split: two separate entries → two data rows', () => {
    const linkId = 'abc-123'
    const first = makeEntry({
      id: 1,
      started_at: '2026-04-24T23:00:00.000Z',
      stopped_at: '2026-04-24T23:59:59.000Z',
      link_id: linkId
    })
    const second = makeEntry({
      id: 2,
      started_at: '2026-04-25T00:00:00.000Z',
      stopped_at: '2026-04-25T01:00:00.000Z',
      link_id: linkId
    })
    const csv = formatCsv([first, second], CLIENT_MAP)
    const lines = csv.replace('﻿', '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(3) // header + 2 data rows
  })
  it('skips non-billable entries (billable = 0)', () => {
    const nonBillable = makeEntry({ billable: 0 })
    const csv = formatCsv([nonBillable], CLIENT_MAP)
    const lines = csv.replace('\uFEFF', '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(1) // header only
  })

  it('includes billable entries (billable = 1)', () => {
    const billable = makeEntry({ billable: 1 })
    const csv = formatCsv([billable], CLIENT_MAP)
    const lines = csv.replace('\uFEFF', '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(2) // header + 1 data row
  })

  it('mixed billable + non-billable: only billable rows exported', () => {
    const b = makeEntry({ id: 1, billable: 1 })
    const nb = makeEntry({ id: 2, billable: 0 })
    const csv = formatCsv([b, nb], CLIENT_MAP)
    const lines = csv.replace('\uFEFF', '').split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(2) // header + 1
  })})

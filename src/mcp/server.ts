/**
 * TimeTrack MCP server — read-only (MVP).
 *
 * Exposes the local TimeTrack SQLite database to any MCP client (Claude Code,
 * …) over stdio. This server can ONLY read: the DB is opened read-only and no
 * write tools exist. The guarded write path is a separate, opt-in feature —
 * see the "MCP-Write-Mode" issue.
 *
 * Tools:
 *   list_clients        — clients (active by default)
 *   list_projects       — projects, optionally filtered by client
 *   list_entries        — entries by month or date range, with filters + totals
 *   get_running_timer   — the currently running entry, if any
 *   get_dashboard       — today/week totals, recent entries, top clients (30d)
 *   get_analytics       — monthly hours (+ revenue when rates are exposed)
 *
 * Privacy: rates and internal notes are hidden by default. Enable with
 *   TIMETRACK_MCP_EXPOSE_RATES=1 / TIMETRACK_MCP_EXPOSE_PRIVATE_NOTES=1
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { openReadonly } from './db'
import { resolveDbPath } from './dbPath'
import { privacyFromEnv } from './privacy'
import {
  listClients,
  listProjects,
  listEntries,
  getRunningTimer,
  getDashboard,
  getAnalytics,
  type SqliteDb
} from './queries'

const privacy = privacyFromEnv()

/**
 * Open the DB fresh per call and close it afterwards. TimeTrack uses WAL, so a
 * read-only connection never blocks the app's writer, and reopening guarantees
 * every tool call sees the latest committed state.
 */
function withDb<T>(fn: (db: SqliteDb) => T): T {
  const { db } = openReadonly()
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

/** Standard JSON tool result. Data is serialised for the model to read. */
function jsonResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function errorResult(e: unknown): {
  content: Array<{ type: 'text'; text: string }>
  isError: true
} {
  return { content: [{ type: 'text', text: `Fehler: ${String(e)}` }], isError: true }
}

export function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'timetrack', version: '0.1.0' },
    {
      instructions:
        'Read-only Zugriff auf die lokale TimeTrack-Zeiterfassung. Nutze list_entries ' +
        'und get_analytics für Auswertungen (z. B. Stunden pro Kunde/Projekt), ' +
        'get_dashboard für den aktuellen Tag/Woche. Stundensätze und interne Notizen ' +
        'sind standardmäßig ausgeblendet.'
    }
  )

  server.registerTool(
    'list_clients',
    {
      title: 'Kunden auflisten',
      description:
        'Alle Kunden (Name, Farbe, USt-ID, Ansprechpartner). Standardmäßig nur aktive; ' +
        'include_archived=true zeigt auch archivierte. Stundensätze nur, wenn freigeschaltet.',
      inputSchema: {
        include_archived: z.boolean().optional().describe('Auch archivierte Kunden einschließen')
      }
    },
    async ({ include_archived }) => {
      try {
        const clients = withDb((db) =>
          listClients(db, privacy, { includeArchived: include_archived })
        )
        return jsonResult({ count: clients.length, clients })
      } catch (e) {
        return errorResult(e)
      }
    }
  )

  server.registerTool(
    'list_projects',
    {
      title: 'Projekte auflisten',
      description:
        'Projekte inkl. Status, Budget, verbrauchten Minuten und Eintragszahl. ' +
        'Optional nach Kunde gefiltert (client_id, oder null für Projekte ohne Kunde).',
      inputSchema: {
        client_id: z
          .number()
          .int()
          .nullable()
          .optional()
          .describe('Nach Kunde filtern; null = Projekte ohne Kunde'),
        include_archived: z.boolean().optional().describe('Auch archivierte Projekte einschließen')
      }
    },
    async ({ client_id, include_archived }) => {
      try {
        const projects = withDb((db) =>
          listProjects(db, privacy, {
            clientId: client_id === undefined ? undefined : client_id,
            includeArchived: include_archived
          })
        )
        return jsonResult({ count: projects.length, projects })
      } catch (e) {
        return errorResult(e)
      }
    }
  )

  server.registerTool(
    'list_entries',
    {
      title: 'Zeiteinträge auflisten',
      description:
        'Zeiteinträge in einem Zeitraum — entweder per year+month oder per from/to ' +
        '(ISO-Zeitstempel, from inklusive, to exklusiv). Zusätzliche Filter: client_id, ' +
        'project_id, tag. Liefert die Einträge samt Gesamtzahl und Gesamtdauer in Sekunden.',
      inputSchema: {
        year: z.number().int().optional().describe('Jahr (mit month kombinieren)'),
        month: z.number().int().min(1).max(12).optional().describe('Monat 1–12 (mit year)'),
        from: z.string().optional().describe('Start ISO-Zeitstempel (inklusive)'),
        to: z.string().optional().describe('Ende ISO-Zeitstempel (exklusiv)'),
        client_id: z.number().int().optional().describe('Nach Kunde filtern'),
        project_id: z.number().int().optional().describe('Nach Projekt filtern'),
        tag: z.string().optional().describe('Nach exaktem Tag filtern'),
        limit: z.number().int().min(1).max(10000).optional().describe('Max. Anzahl (Default 1000)')
      }
    },
    async (args) => {
      try {
        const result = withDb((db) =>
          listEntries(
            db,
            privacy,
            {
              year: args.year,
              month: args.month,
              from: args.from,
              to: args.to,
              clientId: args.client_id,
              projectId: args.project_id,
              tag: args.tag,
              limit: args.limit
            },
            Date.now()
          )
        )
        return jsonResult(result)
      } catch (e) {
        return errorResult(e)
      }
    }
  )

  server.registerTool(
    'get_running_timer',
    {
      title: 'Laufenden Timer abfragen',
      description: 'Gibt den aktuell laufenden Eintrag zurück, oder null wenn kein Timer läuft.',
      inputSchema: {}
    },
    async () => {
      try {
        const entry = withDb((db) => getRunningTimer(db, privacy, Date.now()))
        return jsonResult({ running: entry !== null, entry })
      } catch (e) {
        return errorResult(e)
      }
    }
  )

  server.registerTool(
    'get_dashboard',
    {
      title: 'Dashboard-Übersicht',
      description:
        'Heutige und wöchentliche Gesamtdauer (Sekunden), die letzten 5 Einträge und die ' +
        'Top-Kunden der letzten 30 Tage — analog zur Heute-Ansicht der App.',
      inputSchema: {}
    },
    async () => {
      try {
        const dash = withDb((db) => getDashboard(db, privacy, Date.now()))
        return jsonResult(dash)
      } catch (e) {
        return errorResult(e)
      }
    }
  )

  server.registerTool(
    'get_analytics',
    {
      title: 'Monatsauswertung',
      description:
        'Monatliche Auswertung: Gesamt-/abrechenbare Stunden sowie Aufschlüsselung nach Kunde ' +
        'und Projekt. Rundung folgt der PDF-Einstellung (pdf_round_minutes). Umsätze nur, wenn ' +
        'Stundensätze freigeschaltet sind.',
      inputSchema: {
        year: z.number().int().describe('Jahr, z. B. 2026'),
        month: z.number().int().min(1).max(12).describe('Monat 1–12')
      }
    },
    async ({ year, month }) => {
      try {
        const analytics = withDb((db) => getAnalytics(db, privacy, year, month))
        return jsonResult(analytics)
      } catch (e) {
        return errorResult(e)
      }
    }
  )

  return server
}

async function main(): Promise<void> {
  // Fail fast with a clear message if the DB is missing, before wiring stdio.
  const dbPath = resolveDbPath()
  const server = buildServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stderr is safe for logs; stdout is the MCP protocol channel.
  process.stderr.write(`[timetrack-mcp] read-only server bereit (DB: ${dbPath})\n`)
}

// Run only when executed directly (not when imported by tests).
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  /mcp[/\\]server(\.[cm]?[jt]s)?$/.test(process.argv[1])

if (isMain) {
  main().catch((e) => {
    process.stderr.write(`[timetrack-mcp] Fatal: ${String(e)}\n`)
    process.exit(1)
  })
}

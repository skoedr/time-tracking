import { useEffect, useState } from 'react'
import type { Settings, BackupInfo } from '../../../shared/types'

const DEFAULT_HOTKEY = 'Alt+Shift+S'
const DEFAULT_MINI_HOTKEY = 'Alt+Shift+M'

/** Settings keys that hold a global accelerator string. */
type HotkeyKey = 'hotkey_toggle' | 'mini_hotkey'

function parseAccelerator(e: KeyboardEvent): string | null {
  // Need at least one modifier and a non-modifier key.
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Super')
  if (mods.length === 0) return null

  const k = e.key
  if (k === 'Control' || k === 'Alt' || k === 'Shift' || k === 'Meta') return null
  // Single letter / digit / function key.
  let key: string
  if (k.length === 1) {
    key = k.toUpperCase()
  } else if (/^F\d{1,2}$/.test(k)) {
    key = k
  } else {
    return null
  }
  return [...mods, key].join('+')
}

export default function SettingsView(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [paths, setPaths] = useState<{ db: string; backups: string } | null>(null)
  const [version, setVersion] = useState<string>('')
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [capturingHotkey, setCapturingHotkey] = useState<HotkeyKey | null>(null)
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  async function loadAll(): Promise<void> {
    const [s, p, v, b] = await Promise.all([
      window.api.settings.getAll(),
      window.api.paths.get(),
      window.api.app.getVersion(),
      window.api.backups.list()
    ])
    if (s.ok) setSettings(s.data)
    if (p.ok) setPaths(p.data)
    if (v.ok) setVersion(v.data)
    if (b.ok) setBackups(b.data)
  }

  useEffect(() => {
    loadAll()
  }, [])

  // Capture next key combo for hotkey change.
  useEffect(() => {
    if (!capturingHotkey) return
    const targetKey = capturingHotkey
    // Pause registered global shortcuts while we capture, otherwise pressing
    // an already-bound combo (e.g. Alt+Shift+S) fires its handler instead of
    // reaching this listener.
    window.api.hotkeyCapture.begin()
    const handler = async (e: KeyboardEvent): Promise<void> => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturingHotkey(null)
        setHotkeyError(null)
        return
      }
      const accel = parseAccelerator(e)
      if (!accel) return // wait for valid combo
      const res = await window.api.settings.set(targetKey, accel)
      if (res.ok) {
        setSettings((prev) => (prev ? { ...prev, [targetKey]: accel } : prev))
        setHotkeyError(null)
        setCapturingHotkey(null)
      } else {
        setHotkeyError(res.error)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      // Re-register the previously-bound shortcuts. Safe to call even if
      // the capture succeeded — settings:set will have already re-registered
      // the new accelerator via its hook side-effect, and resume only
      // re-binds whatever the main process currently has stored.
      window.api.hotkeyCapture.end()
    }
  }, [capturingHotkey])

  async function update<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
    const res = await window.api.settings.set(String(key), String(value))
    if (!res.ok) {
      setStatusMsg(`Fehler: ${res.error}`)
      // revert by reloading
      await loadAll()
    }
  }

  async function createBackupNow(): Promise<void> {
    setStatusMsg('Backup wird erstellt …')
    const res = await window.api.backups.create()
    if (res.ok) {
      setStatusMsg('Backup erstellt.')
      const list = await window.api.backups.list()
      if (list.ok) setBackups(list.data)
    } else {
      setStatusMsg(`Fehler: ${res.error}`)
    }
  }

  async function exportJson(): Promise<void> {
    setStatusMsg('Export wird vorbereitet …')
    const res = await window.api.exporter.json()
    if (res.ok) {
      const kb = (res.data.bytes / 1024).toFixed(1)
      setStatusMsg(`Export gespeichert (${kb} KB).`)
    } else if (res.error === 'Export abgebrochen') {
      // User cancelled the save dialog; surface no error noise.
      setStatusMsg(null)
    } else {
      setStatusMsg(`Export fehlgeschlagen: ${res.error}`)
    }
  }

  async function pickLogo(): Promise<void> {
    setStatusMsg('Logo wird gewählt …')
    const res = await window.api.logo.set()
    if (res.ok) {
      setSettings((prev) => (prev ? { ...prev, pdf_logo_path: res.data.path } : prev))
      setStatusMsg('Logo gespeichert.')
    } else if (res.error === 'Auswahl abgebrochen') {
      setStatusMsg(null)
    } else {
      setStatusMsg(`Logo-Fehler: ${res.error}`)
    }
  }

  async function clearLogo(): Promise<void> {
    const res = await window.api.logo.clear()
    if (res.ok) {
      setSettings((prev) => (prev ? { ...prev, pdf_logo_path: '' } : prev))
      setStatusMsg('Logo entfernt.')
    } else {
      setStatusMsg(`Fehler: ${res.error}`)
    }
  }

  if (!settings || !paths) {
    return <div className="text-slate-400">Lade Einstellungen …</div>
  }

  const latestBackup = backups[0] ?? null

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8 pb-12">
      <h1 className="text-2xl font-semibold text-slate-100">Einstellungen</h1>

      {statusMsg && (
        <div className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-300">{statusMsg}</div>
      )}

      {/* Allgemein */}
      <Section title="Allgemein">
        <Row label="Sprache" hint="Übersetzungen folgen in v1.2 — die Auswahl wird gespeichert.">
          <select
            aria-label="Sprache"
            value={settings.language}
            onChange={(e) => update('language', e.target.value)}
            className={inputClass}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </Row>
        <Row label="Mit Windows starten">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.auto_start === '1'}
              onChange={(e) => update('auto_start', e.target.checked ? '1' : '0')}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800"
            />
            <span className="text-sm text-slate-300">Beim Anmelden automatisch starten</span>
          </label>
        </Row>
        <Row label="Firma (für Exporte)">
          <input
            type="text"
            value={settings.company_name}
            onChange={(e) => update('company_name', e.target.value)}
            className={inputClass}
            placeholder={'z.\u202fB. Meine Firma GmbH'}
          />
        </Row>
      </Section>

      {/* Timer */}
      <Section title="Timer">
        <Row label="Inaktivitäts-Schwelle" hint="Nach wie vielen Minuten soll die App nachfragen?">
          <div className="flex items-center gap-2">
            <input
              aria-label="Inaktivitäts-Schwelle in Minuten"
              type="number"
              min={1}
              max={60}
              value={settings.idle_threshold_minutes}
              onChange={(e) => update('idle_threshold_minutes', e.target.value)}
              className={`${inputClass} w-24`}
            />
            <span className="text-sm text-slate-400">Minuten</span>
          </div>
        </Row>
        <Row
          label="Globaler Hotkey"
          hint="Start/Stop von überall. Modifier (Ctrl/Alt/Shift) + Buchstabe oder F-Taste."
        >
          <div className="flex items-center gap-2">
            <code className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-200">
              {capturingHotkey === 'hotkey_toggle'
                ? 'Drücke eine Tastenkombi …'
                : settings.hotkey_toggle}
            </code>
            <button
              type="button"
              onClick={() => {
                setCapturingHotkey((v) => (v === 'hotkey_toggle' ? null : 'hotkey_toggle'))
                setHotkeyError(null)
              }}
              className={btnSecondaryClass}
            >
              {capturingHotkey === 'hotkey_toggle' ? 'Abbrechen' : 'Ändern'}
            </button>
            {settings.hotkey_toggle !== DEFAULT_HOTKEY && (
              <button
                type="button"
                onClick={() => update('hotkey_toggle', DEFAULT_HOTKEY)}
                className={btnSecondaryClass}
              >
                Zurücksetzen
              </button>
            )}
          </div>
          {hotkeyError && capturingHotkey === 'hotkey_toggle' && (
            <p className="mt-1 text-xs text-red-400">{hotkeyError}</p>
          )}
        </Row>
        <Row label="Rundung" hint="Aktuell nur intern verfügbar — UI-Auswahl folgt.">
          <select
            aria-label="Rundungsmodus"
            value={settings.rounding_mode}
            onChange={(e) => update('rounding_mode', e.target.value as Settings['rounding_mode'])}
            className={inputClass}
          >
            <option value="none">Keine</option>
            <option value="ceil">Aufrunden</option>
            <option value="floor">Abrunden</option>
            <option value="round">Kaufmännisch</option>
          </select>
        </Row>
      </Section>

      {/* Mini-Widget (v1.4) */}
      <Section title="Mini-Widget">
        <Row
          label="Aktivieren"
          hint="Always-on-top 200×40-Overlay mit Timer und Stop-Button. Standardmäßig deaktiviert."
        >
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.mini_enabled === '1'}
              onChange={(e) => update('mini_enabled', e.target.checked ? '1' : '0')}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800"
            />
            <span className="text-sm text-slate-300">Mini-Widget anzeigen</span>
          </label>
        </Row>
        <Row
          label="Hotkey"
          hint="Mini-Widget ein-/ausblenden. Modifier + Buchstabe oder F-Taste."
        >
          <div className="flex items-center gap-2">
            <code className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-200">
              {capturingHotkey === 'mini_hotkey'
                ? 'Drücke eine Tastenkombi …'
                : settings.mini_hotkey}
            </code>
            <button
              type="button"
              onClick={() => {
                setCapturingHotkey((v) => (v === 'mini_hotkey' ? null : 'mini_hotkey'))
                setHotkeyError(null)
              }}
              className={btnSecondaryClass}
            >
              {capturingHotkey === 'mini_hotkey' ? 'Abbrechen' : 'Ändern'}
            </button>
            {settings.mini_hotkey !== DEFAULT_MINI_HOTKEY && (
              <button
                type="button"
                onClick={() => update('mini_hotkey', DEFAULT_MINI_HOTKEY)}
                className={btnSecondaryClass}
              >
                Zurücksetzen
              </button>
            )}
          </div>
          {hotkeyError && capturingHotkey === 'mini_hotkey' && (
            <p className="mt-1 text-xs text-red-400">{hotkeyError}</p>
          )}
        </Row>
        <Row
          label="Position"
          hint="Setzt das Mini-Widget beim nächsten Anzeigen wieder auf rechts unten."
        >
          <button
            type="button"
            onClick={async () => {
              await window.api.settings.set('mini_x', '-1')
              await window.api.settings.set('mini_y', '-1')
              setSettings((prev) => (prev ? { ...prev, mini_x: '-1', mini_y: '-1' } : prev))
              setStatusMsg('Mini-Widget-Position zurückgesetzt.')
            }}
            className={btnSecondaryClass}
          >
            Position zurücksetzen
          </button>
        </Row>
      </Section>

      {/* Daten */}
      <Section title="Daten">
        <Row label="Datenbank">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
              {paths.db}
            </code>
            <button
              type="button"
              onClick={() => window.api.shell.showItemInFolder(paths.db)}
              className={btnSecondaryClass}
            >
              Im Explorer öffnen
            </button>
          </div>
        </Row>
        <Row label="Backups-Ordner">
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
              {paths.backups}
            </code>
            <button
              type="button"
              onClick={() => window.api.shell.openPath(paths.backups)}
              className={btnSecondaryClass}
            >
              Öffnen
            </button>
          </div>
        </Row>
        <Row label="Letztes Backup">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-300">
              {latestBackup
                ? `${new Date(latestBackup.createdAt).toLocaleString('de-DE')} (${latestBackup.reason})`
                : 'Noch keins vorhanden'}
            </span>
            <button type="button" onClick={createBackupNow} className={btnSecondaryClass}>
              Backup jetzt erstellen
            </button>
          </div>
          {backups.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Insgesamt {backups.length} Backup{backups.length === 1 ? '' : 's'} gespeichert.
            </p>
          )}
        </Row>
        <Row label="JSON-Vollexport">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-300">
              Alle Kunden, Einträge und Einstellungen als JSON-Datei.
            </span>
            <button type="button" onClick={exportJson} className={btnSecondaryClass}>
              Export speichern …
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Lesbares Format zum Backup oder zur Weiterverarbeitung. CSV/PDF folgen.
          </p>
        </Row>
      </Section>

      {/* PDF-Vorlage (v1.3 PR C, issues #16 + #19) */}
      <Section title="PDF-Vorlage">
        <Row label="Logo" hint="PNG, JPG, SVG oder WebP, max. 1 MB.">
          <div className="flex items-center gap-3">
            {settings.pdf_logo_path ? (
              <code className="flex-1 truncate rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
                {settings.pdf_logo_path}
              </code>
            ) : (
              <span className="flex-1 text-sm text-slate-500">Kein Logo gesetzt.</span>
            )}
            <button type="button" onClick={pickLogo} className={btnSecondaryClass}>
              Logo wählen …
            </button>
            {settings.pdf_logo_path && (
              <button type="button" onClick={clearLogo} className={btnSecondaryClass}>
                Entfernen
              </button>
            )}
          </div>
        </Row>
        <Row label="Absenderadresse" hint="Erscheint rechts oben im PDF.">
          <textarea
            rows={4}
            value={settings.pdf_sender_address}
            onChange={(e) => update('pdf_sender_address', e.target.value)}
            placeholder={'Robin GmbH\nMusterstr. 1\n12345 Berlin'}
            className={`${inputClass} resize-y font-sans`}
          />
        </Row>
        <Row label="Steuernummer">
          <input
            type="text"
            value={settings.pdf_tax_id}
            onChange={(e) => update('pdf_tax_id', e.target.value)}
            placeholder="DE123456789"
            className={inputClass}
          />
        </Row>
        <Row label="Akzentfarbe" hint="Tabellenkopf, Linien, Hervorhebungen.">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={
                /^#[0-9a-fA-F]{6}$/.test(settings.pdf_accent_color)
                  ? settings.pdf_accent_color
                  : '#4f46e5'
              }
              onChange={(e) => update('pdf_accent_color', e.target.value)}
              className="h-10 w-16 cursor-pointer rounded border border-slate-700 bg-slate-800"
              aria-label="Akzentfarbe wählen"
            />
            <code className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
              {settings.pdf_accent_color || '#4f46e5'}
            </code>
          </div>
        </Row>
        <Row label="Footer-Text" hint="Z. B. Bankverbindung oder Zahlungshinweis.">
          <textarea
            rows={3}
            value={settings.pdf_footer_text}
            onChange={(e) => update('pdf_footer_text', e.target.value)}
            placeholder="Bitte überweisen Sie bis zum 15. des Folgemonats."
            className={`${inputClass} resize-y font-sans`}
          />
        </Row>
        <Row label="Stunden runden auf" hint="Auf Wunsch werden alle Einträge im PDF gerundet.">
          <select
            value={settings.pdf_round_minutes || '0'}
            onChange={(e) => update('pdf_round_minutes', e.target.value)}
            className={inputClass}
          >
            <option value="0">Keine Rundung</option>
            <option value="5">5 Minuten</option>
            <option value="10">10 Minuten</option>
            <option value="15">15 Minuten</option>
            <option value="30">30 Minuten</option>
          </select>
        </Row>
      </Section>

      {/* Über */}
      <Section title="Über">
        <Row label="Version">
          <span className="text-sm text-slate-300">{version || '—'}</span>
        </Row>
      </Section>
    </div>
  )
}

const inputClass =
  'bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent'

const btnSecondaryClass =
  'rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-600 ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500'

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      <div className="flex flex-col gap-5 rounded-lg border border-slate-800 bg-slate-900/50 p-5">
        {children}
      </div>
    </section>
  )
}

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-slate-200">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

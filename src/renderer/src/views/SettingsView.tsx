import { useEffect, useState } from 'react'
import type { Settings, BackupInfo } from '../../../shared/types'
import { useUpdateStore } from '../store/updateStore'
import { useT, useLocale } from '../contexts/I18nContext'
import type { Locale } from '../../../shared/i18n'
import { AboutDialog } from '../components/AboutDialog'
import { useTheme, type ThemeMode } from '../contexts/ThemeContext'

const DEFAULT_HOTKEY = 'Alt+Shift+S'
const DEFAULT_MINI_HOTKEY = 'Alt+Shift+M'

type SettingsTab = 'general' | 'timer' | 'export' | 'data' | 'about'

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
  const t = useT()
  const { locale, setLocale } = useLocale()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [paths, setPaths] = useState<{
    db: string
    backups: string
    logs: string
    logFile: string
  } | null>(null)
  const [version, setVersion] = useState<string>('')
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [capturingHotkey, setCapturingHotkey] = useState<HotkeyKey | null>(null)
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [showAbout, setShowAbout] = useState(false)
  const [tab, setTab] = useState<SettingsTab>('general')

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
      setStatusMsg(t('common.error', { error: res.error }))
      // revert by reloading
      await loadAll()
    }
  }

  async function createBackupNow(): Promise<void> {
    setStatusMsg(t('settings.data.backupCreating'))
    const res = await window.api.backups.create()
    if (res.ok) {
      setStatusMsg(t('settings.data.backupCreated'))
      const list = await window.api.backups.list()
      if (list.ok) setBackups(list.data)
    } else {
      setStatusMsg(t('common.error', { error: res.error }))
    }
  }

  async function exportJson(): Promise<void> {
    setStatusMsg(t('settings.data.jsonExporting'))
    const res = await window.api.exporter.json()
    if (res.ok) {
      const kb = (res.data.bytes / 1024).toFixed(1)
      setStatusMsg(t('settings.data.jsonExportSaved', { kb }))
    } else if (res.error === 'Export abgebrochen') {
      setStatusMsg(null)
    } else {
      setStatusMsg(t('settings.data.jsonExportFailed', { error: res.error }))
    }
  }

  async function pickLogo(): Promise<void> {
      setStatusMsg(t('settings.pdf.logoPicking'))
    const res = await window.api.logo.set()
    if (res.ok) {
      setSettings((prev) => (prev ? { ...prev, pdf_logo_path: res.data.path } : prev))
      setStatusMsg(t('settings.pdf.logoSaved'))
    } else if (res.error === 'Auswahl abgebrochen') {
      setStatusMsg(null)
    } else {
      setStatusMsg(t('settings.pdf.logoError', { error: res.error }))
    }
  }

  async function clearLogo(): Promise<void> {
    const res = await window.api.logo.clear()
    if (res.ok) {
      setSettings((prev) => (prev ? { ...prev, pdf_logo_path: '' } : prev))
      setStatusMsg(t('settings.pdf.logoRemoved'))
    } else {
      setStatusMsg(`${t('settings.update.idle')}: ${res.error}`)
    }
  }

  if (!settings || !paths) {
    return <div className="text-slate-400">{t('settings.loading')}</div>
  }

  const latestBackup = backups[0] ?? null

  const { themeMode, setThemeMode } = useTheme()

  const NAV_ITEMS: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: t('settings.nav.general') },
    { id: 'timer', label: t('settings.nav.timer') },
    { id: 'export', label: t('settings.nav.export') },
    { id: 'data', label: t('settings.nav.data') },
    { id: 'about', label: t('settings.nav.about') }
  ]

  return (
    <div className="flex flex-row gap-8 pb-12">
      {/* Sidebar navigation */}
      <nav className="w-44 shrink-0 flex flex-col gap-1 pt-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => { setTab(item.id); setStatusMsg(null) }}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              tab === item.id
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-8">
        {statusMsg && (
          <div className="rounded-md bg-slate-800 px-3 py-2 text-sm text-slate-300">{statusMsg}</div>
        )}

        {/* Allgemein */}
        {tab === 'general' && (
          <Section title={t('settings.section.general')}>
            <Row label={t('settings.theme.title')}>
              <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
                {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setThemeMode(m)}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                      themeMode === m
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {t(`settings.theme.${m}` as `settings.theme.${'light' | 'dark' | 'system'}`)}
                  </button>
                ))}
              </div>
            </Row>
            <Row label={t('settings.language.title')}>
              <select
                aria-label={t('settings.language.title')}
                value={locale}
                onChange={(e) => void setLocale(e.target.value as Locale)}
                className={inputClass}
              >
                <option value="de">{t('settings.language.de')}</option>
                <option value="en">{t('settings.language.en')}</option>
              </select>
            </Row>
            <Row label={t('settings.general.onboarding')}>
              <button
                type="button"
                onClick={async () => {
                  await window.api.settings.set('onboarding_completed', '0')
                  setStatusMsg(t('settings.general.onboardingReset'))
                }}
                className={btnSecondaryClass}
              >
                {t('settings.onboarding.retrigger')}
              </button>
            </Row>
            <Row label={t('settings.general.autoStart')}>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.auto_start === '1'}
                  onChange={(e) => update('auto_start', e.target.checked ? '1' : '0')}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                />
                <span className="text-sm text-slate-300">{t('settings.general.autoStartLabel')}</span>
              </label>
            </Row>
            <Row label={t('settings.general.company')}>
              <input
                type="text"
                value={settings.company_name}
                onChange={(e) => update('company_name', e.target.value)}
                className={inputClass}
                placeholder={t('settings.general.companyPlaceholder')}
              />
            </Row>
          </Section>
        )}

        {/* Timer & Hotkeys */}
        {tab === 'timer' && (
          <>
            <Section title={t('settings.section.timer')}>
              <Row label={t('settings.timer.idle')} hint={t('settings.timer.idleHint')}>
                <div className="flex items-center gap-2">
                  <input
                    aria-label={t('settings.timer.idleAria')}
                    type="number"
                    min={1}
                    max={60}
                    value={settings.idle_threshold_minutes}
                    onChange={(e) => update('idle_threshold_minutes', e.target.value)}
                    className={`${inputClass} w-24`}
                  />
                  <span className="text-sm text-slate-400">{t('settings.timer.idleUnit')}</span>
                </div>
              </Row>
              <Row
                label={t('settings.timer.hotkey')}
                hint={t('settings.timer.hotkeyHint')}
              >
                <div className="flex items-center gap-2">
                  <code className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-200">
                    {capturingHotkey === 'hotkey_toggle'
                      ? t('settings.timer.hotkeyCapturing')
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
                    {capturingHotkey === 'hotkey_toggle' ? t('common.cancel') : t('settings.timer.hotkeyChange')}
                  </button>
                  {settings.hotkey_toggle !== DEFAULT_HOTKEY && (
                    <button
                      type="button"
                      onClick={() => update('hotkey_toggle', DEFAULT_HOTKEY)}
                      className={btnSecondaryClass}
                    >
                      {t('settings.timer.hotkeyReset')}
                    </button>
                  )}
                </div>
                {hotkeyError && capturingHotkey === 'hotkey_toggle' && (
                  <p className="mt-1 text-xs text-red-400">{hotkeyError}</p>
                )}
              </Row>
              <Row label={t('settings.timer.rounding')} hint={t('settings.timer.roundingHint')}>
                <select
                  aria-label={t('settings.timer.roundingHint')}
                  value={settings.rounding_mode}
                  onChange={(e) => update('rounding_mode', e.target.value as Settings['rounding_mode'])}
                  className={inputClass}
                >
                  <option value="none">{t('settings.timer.roundingNone')}</option>
                  <option value="ceil">{t('settings.timer.roundingCeil')}</option>
                  <option value="floor">{t('settings.timer.roundingFloor')}</option>
                  <option value="round">{t('settings.timer.roundingRound')}</option>
                </select>
              </Row>
            </Section>

            {/* Mini-Widget (v1.4) */}
            <Section title={t('settings.section.miniWidget')}>
              <Row
                label={t('settings.mini.enable')}
                hint={t('settings.mini.enableHint')}
              >
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.mini_enabled === '1'}
                    onChange={(e) => update('mini_enabled', e.target.checked ? '1' : '0')}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800"
                  />
                  <span className="text-sm text-slate-300">{t('settings.mini.enableLabel')}</span>
                </label>
              </Row>
              <Row
                label={t('settings.mini.hotkey')}
                hint={t('settings.mini.hotkeyHint')}
              >
                <div className="flex items-center gap-2">
                  <code className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-200">
                    {capturingHotkey === 'mini_hotkey'
                      ? t('settings.timer.hotkeyCapturing')
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
                    {capturingHotkey === 'mini_hotkey' ? t('common.cancel') : t('settings.timer.hotkeyChange')}
                  </button>
                  {settings.mini_hotkey !== DEFAULT_MINI_HOTKEY && (
                    <button
                      type="button"
                      onClick={() => update('mini_hotkey', DEFAULT_MINI_HOTKEY)}
                      className={btnSecondaryClass}
                    >
                      {t('settings.timer.hotkeyReset')}
                    </button>
                  )}
                </div>
                {hotkeyError && capturingHotkey === 'mini_hotkey' && (
                  <p className="mt-1 text-xs text-red-400">{hotkeyError}</p>
                )}
              </Row>
              <Row
                label={t('settings.mini.position')}
                hint={t('settings.mini.positionHint')}
              >
                <button
                  type="button"
                  onClick={async () => {
                    await window.api.settings.set('mini_x', '-1')
                    await window.api.settings.set('mini_y', '-1')
                    setSettings((prev) => (prev ? { ...prev, mini_x: '-1', mini_y: '-1' } : prev))
                    setStatusMsg(t('settings.mini.positionResetDone'))
                  }}
                  className={btnSecondaryClass}
                >
                  {t('settings.mini.positionReset')}
                </button>
              </Row>
            </Section>
          </>
        )}

        {/* PDF & Export */}
        {tab === 'export' && (
          <Section title={t('settings.section.pdf')}>
            <Row label={t('settings.pdf.logo')} hint={t('settings.pdf.logoHint')}>
              <div className="flex items-center gap-3">
                {settings.pdf_logo_path ? (
                  <code className="flex-1 truncate rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
                    {settings.pdf_logo_path}
                  </code>
                ) : (
                  <span className="flex-1 text-sm text-slate-500">{t('settings.pdf.noLogo')}</span>
                )}
                <button type="button" onClick={pickLogo} className={btnSecondaryClass}>
                  {t('settings.pdf.chooseLogo')}
                </button>
                {settings.pdf_logo_path && (
                  <button type="button" onClick={clearLogo} className={btnSecondaryClass}>
                    {t('settings.pdf.removeLogo')}
                  </button>
                )}
              </div>
            </Row>
            <Row label={t('settings.pdf.sender')} hint={t('settings.pdf.senderHint')}>
              <textarea
                rows={4}
                value={settings.pdf_sender_address}
                onChange={(e) => update('pdf_sender_address', e.target.value)}
                placeholder={'Robin GmbH\nMusterstr. 1\n12345 Berlin'}
                className={`${inputClass} resize-y font-sans`}
              />
            </Row>
            <Row label={t('settings.pdf.taxId')}>
              <input
                type="text"
                value={settings.pdf_tax_id}
                onChange={(e) => update('pdf_tax_id', e.target.value)}
                placeholder="DE123456789"
                className={inputClass}
              />
            </Row>
            <Row label={t('settings.pdf.accentColor')} hint={t('settings.pdf.accentColorHint')}>
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
                  aria-label={t('settings.pdf.accentColorAria')}
                />
                <code className="rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
                  {settings.pdf_accent_color || '#4f46e5'}
                </code>
              </div>
            </Row>
            <Row label={t('settings.pdf.footer')} hint={t('settings.pdf.footerHint')}>
              <textarea
                rows={3}
                value={settings.pdf_footer_text}
                onChange={(e) => update('pdf_footer_text', e.target.value)}
                placeholder="Bitte überweisen Sie bis zum 15. des Folgemonats."
                className={`${inputClass} resize-y font-sans`}
              />
            </Row>
            <Row label={t('settings.pdf.roundMinutes')} hint={t('settings.pdf.roundMinutesHint')}>
              <select
                value={settings.pdf_round_minutes || '0'}
                onChange={(e) => update('pdf_round_minutes', e.target.value)}
                className={inputClass}
              >
                <option value="0">{t('settings.pdf.roundNone')}</option>
                <option value="5">5 Minuten</option>
                <option value="10">10 Minuten</option>
                <option value="15">15 Minuten</option>
                <option value="30">30 Minuten</option>
              </select>
            </Row>
          </Section>
        )}

        {/* Daten */}
        {tab === 'data' && (
          <>
            <Section title={t('settings.section.data')}>
              <Row label={t('settings.data.database')}>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
                    {paths.db}
                  </code>
                  <button
                    type="button"
                    onClick={() => window.api.shell.showItemInFolder(paths.db)}
                    className={btnSecondaryClass}
                  >
                    {t('settings.data.openInExplorer')}
                  </button>
                </div>
              </Row>
              <Row label={t('settings.data.backupsFolder')}>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
                    {paths.backups}
                  </code>
                  <button
                    type="button"
                    onClick={() => window.api.shell.openPath(paths.backups)}
                    className={btnSecondaryClass}
                  >
                    {t('settings.data.open')}
                  </button>
                </div>
              </Row>
              <Row label={t('settings.data.lastBackup')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-300">
                    {latestBackup
                      ? `${new Date(latestBackup.createdAt).toLocaleString('de-DE')} (${latestBackup.reason})`
                      : t('settings.data.noBackup')}
                  </span>
                  <button type="button" onClick={createBackupNow} className={btnSecondaryClass}>
                    {t('settings.data.createBackup')}
                  </button>
                </div>
                {backups.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {backups.length === 1 ? t('settings.data.backupCount') : t('settings.data.backupCountPlural', { count: String(backups.length) })}
                  </p>
                )}
              </Row>
              <Row label={t('settings.data.jsonExport')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-300">
                    {t('settings.data.jsonExportDesc')}
                  </span>
                  <button type="button" onClick={exportJson} className={btnSecondaryClass}>
                    {t('settings.data.jsonExportBtn')}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t('settings.data.jsonExportHint')}
                </p>
              </Row>
            </Section>

            {/* Diagnose (v1.5 PR A, issue #34) */}
            <Section title={t('settings.diagnose.title')}>
              <Row
                label="Log-Datei"
                hint={t('settings.diagnose.hint')}
              >
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
                    {paths.logFile}
                  </code>
                  <button
                    type="button"
                    onClick={() => window.api.shell.showItemInFolder(paths.logFile)}
                    className={btnSecondaryClass}
                  >
                    {t('settings.diagnose.reveal')}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.api.shell.openPath(paths.logs)}
                    className={btnSecondaryClass}
                  >
                    {t('settings.diagnose.open')}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Rotiert automatisch bei 5 MB. Enthält App-Ereignisse und Fehler aus Main- und Renderer-Process.
                </p>
              </Row>
            </Section>
          </>
        )}

        {/* Über */}
        {tab === 'about' && (
          <>
            {/* Updates (v1.5 PR B, issue #28) */}
            <UpdatesSection />

            <Section title={t('settings.section.about')}>
              <Row label={t('settings.about.version')}>
                <span className="text-sm text-slate-300">{version || '—'}</span>
              </Row>
              <Row label={t('about.open')}>
                <button
                  type="button"
                  onClick={() => setShowAbout(true)}
                  className={btnSecondaryClass}
                >
                  {t('about.open')}
                </button>
              </Row>
            </Section>
          </>
        )}

        <AboutDialog open={showAbout} onClose={() => setShowAbout(false)} version={version} />
      </div>
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

/**
 * v1.5 PR B — Updates section. Reads + drives state from useUpdateStore.
 * The store auto-initializes on first mount via UpdateBanner; we still call
 * `init()` here defensively in case Settings is opened before the banner
 * has appeared in some future layout change.
 */
function UpdatesSection(): React.JSX.Element {
  const { status, appVersion, lastCheckedAt, checkNow, installNow, init } = useUpdateStore()
  const t = useT()
  useEffect(() => {
    void init()
  }, [init])

  const busy = status.status === 'checking' || status.status === 'downloading'
  const lastCheckedLabel = lastCheckedAt
    ? new Date(lastCheckedAt).toLocaleString('de-DE')
    : t('settings.update.never')

  let statusLabel = ''
  switch (status.status) {
    case 'idle':
      statusLabel = t('settings.update.idle')
      break
    case 'checking':
      statusLabel = t('settings.update.checking')
      break
    case 'available':
      statusLabel = t('update.available', { version: status.version ?? '' })
      break
    case 'downloading':
      statusLabel = t('update.downloading', {
        version: status.version ?? '…',
        progress: status.progress ?? 0
      })
      break
    case 'ready':
      statusLabel = t('update.ready.text', { version: status.version ?? '' })
      break
    case 'not-available':
      statusLabel = t('settings.update.upToDate')
      break
    case 'error':
      statusLabel = t('update.error.text', { message: status.message ?? '' })
      break
  }

  return (
    <Section title={t('settings.update.title')}>
      <Row label={t('settings.update.version', { version: appVersion || '—' })}>
        <code className="inline-block w-fit rounded bg-slate-800 px-3 py-1.5 text-xs text-slate-300">
          {appVersion || '—'}
        </code>
      </Row>
      <Row label={t('settings.update.status')} hint={`${t('settings.update.lastCheck')}: ${lastCheckedLabel}`}>
        <p
          className={`text-sm ${
            status.status === 'error' ? 'text-amber-300' : 'text-slate-200'
          }`}
        >
          {statusLabel}
        </p>
      </Row>
      <Row label={t('settings.update.actions')}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void checkNow()}
            disabled={busy}
            className={`${btnSecondaryClass} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {t('settings.update.checkNow')}
          </button>
          {status.status === 'ready' && (
            <button
              type="button"
              onClick={() => void installNow()}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {t('update.ready.install')}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {t('settings.update.autoInfo')}
        </p>
      </Row>
    </Section>
  )
}

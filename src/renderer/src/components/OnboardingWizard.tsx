import { useState } from 'react'
import { useT, useLocale } from '../contexts/I18nContext'
import type { TFunction } from '../contexts/I18nContext'
import type { Locale } from '../../../shared/i18n'

interface Props {
  open: boolean
  onFinish: () => void
}

const TOTAL_STEPS = 3

// Default colors for new clients — same palette as ClientsView.
const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#f97316', '#84cc16',
]

/**
 * Three-step onboarding wizard (v1.5 PR E, issue #32).
 *
 * Step 1 — Welcome + language picker (live, uses I18nProvider)
 * Step 2 — Create first client (skippable)
 * Step 3 — Global hotkey hint
 *
 * All strings go through `t()` so DE/EN switching in step 1 immediately
 * reflects in subsequent steps.
 *
 * `onFinish` is called both by "Get started" and by "Skip" — the caller
 * is responsible for persisting `onboarding_completed = 1`.
 */
export function OnboardingWizard({ open, onFinish }: Props): React.JSX.Element | null {
  const t = useT()
  const { locale, setLocale } = useLocale()

  const [step, setStep] = useState(1)

  // Step 2 form state
  const [clientName, setClientName] = useState('')
  const [clientRate, setClientRate] = useState('')
  const [clientColor, setClientColor] = useState(PRESET_COLORS[0])
  const [clientBusy, setClientBusy] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)
  const [clientCreated, setClientCreated] = useState(false)

  if (!open) return null

  async function createClientAndNext(): Promise<void> {
    if (!clientName.trim()) {
      next()
      return
    }
    setClientBusy(true)
    setClientError(null)
    const rateCent = clientRate.trim()
      ? Math.round(parseFloat(clientRate.replace(',', '.')) * 100)
      : 0
    const res = await window.api.clients.create({
      name: clientName.trim(),
      color: clientColor,
      rate_cent: isNaN(rateCent) || rateCent < 0 ? 0 : rateCent
    })
    setClientBusy(false)
    if (res.ok) {
      setClientCreated(true)
      next()
    } else {
      setClientError(res.error)
    }
  }

  function next(): void {
    if (step < TOTAL_STEPS) setStep((s) => s + 1)
    else onFinish()
  }

  const stepLabel = t('onboarding.step', { current: step, total: TOTAL_STEPS })

  const inputClass =
    'rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-indigo-400 w-full'

  return (
    // Full-screen overlay — sits above everything including UpdateBanner.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative flex w-full max-w-md flex-col gap-6 rounded-2xl bg-zinc-900 p-8 shadow-2xl ring-1 ring-zinc-800">
        {/* Skip link */}
        <button
          type="button"
          onClick={onFinish}
          className="absolute right-5 top-5 text-xs text-zinc-500 hover:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 rounded"
        >
          {t('onboarding.skip')}
        </button>

        {/* Step indicator */}
        <p className="text-xs text-zinc-500">{stepLabel}</p>

        {/* ── Step 1: Welcome + Language ── */}
        {step === 1 && (
          <>
            <div className="flex flex-col gap-3">
              {/* Logo / icon placeholder */}
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-600 text-3xl font-black text-white select-none">
                T
              </div>
              <h1 className="text-2xl font-bold text-zinc-100">
                {t('onboarding.welcome.title')}
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {t('onboarding.welcome.body')}
              </p>
            </div>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-zinc-300">
                {t('onboarding.welcome.languageLabel')}
              </span>
              <select
                value={locale}
                onChange={(e) => void setLocale(e.target.value as Locale)}
                className={inputClass}
              >
                <option value="de">{t('settings.language.de')}</option>
                <option value="en">{t('settings.language.en')}</option>
              </select>
            </label>

            <WizardFooter
              step={step}
              onNext={next}
              onFinish={onFinish}
              t={t}
            />
          </>
        )}

        {/* ── Step 2: First Client ── */}
        {step === 2 && (
          <>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold text-zinc-100">{t('onboarding.client.title')}</h2>
              <p className="text-sm text-zinc-400">{t('onboarding.client.body')}</p>
            </div>

            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-zinc-300">{t('onboarding.client.nameLabel')}</span>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder={t('onboarding.client.namePlaceholder')}
                  className={inputClass}
                  autoFocus
                  disabled={clientBusy}
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-zinc-300">{t('onboarding.client.rateLabel')}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={clientRate}
                    onChange={(e) => setClientRate(e.target.value)}
                    placeholder={t('onboarding.client.ratePlaceholder')}
                    className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-28"
                    disabled={clientBusy}
                  />
                  <span className="text-sm text-zinc-400">{t('onboarding.client.rateUnit')}</span>
                </div>
              </label>

              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-zinc-300">{t('onboarding.client.colorLabel')}</span>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setClientColor(c)}
                      title={c}
                      className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-zinc-900 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                        clientColor === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              {clientError && (
                <p className="rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-200" role="alert">
                  {clientError}
                </p>
              )}
            </div>

            <WizardFooter
              step={step}
              onNext={() => void createClientAndNext()}
              onFinish={onFinish}
              nextLabel={clientName.trim() ? t('onboarding.client.create') : undefined}
              disabled={clientBusy}
              t={t}
            />
          </>
        )}

        {/* ── Step 3: Hotkey hint ── */}
        {step === 3 && (
          <>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold text-zinc-100">{t('onboarding.hotkey.title')}</h2>
              <p className="text-sm text-zinc-400">{t('onboarding.hotkey.body')}</p>
            </div>

            <div className="flex flex-col gap-4">
              <HotkeyHint label={t('onboarding.hotkey.default', { hotkey: 'Alt+Shift+S' })} />
              <HotkeyHint label={t('onboarding.hotkey.mini', { hotkey: 'Alt+Shift+M' })} />
              <p className="text-xs text-zinc-500">{t('onboarding.hotkey.hint')}</p>

              {clientCreated && (
                <p className="rounded-lg bg-emerald-900/30 px-3 py-2 text-sm text-emerald-300">
                  ✓ {clientName} angelegt.
                </p>
              )}
            </div>

            <WizardFooter
              step={step}
              onNext={onFinish}
              onFinish={onFinish}
              t={t}
            />
          </>
        )}
      </div>
    </div>
  )
}

// ── Small helper components ──────────────────────────────────────────────────

interface FooterProps {
  step: number
  onNext: () => void
  onFinish: () => void
  nextLabel?: string
  disabled?: boolean
  t: TFunction
}

function WizardFooter({ step, onNext, nextLabel, disabled, t }: FooterProps): React.JSX.Element {
  const isLast = step === TOTAL_STEPS
  const label = isLast ? t('onboarding.finish') : (nextLabel ?? t('onboarding.next'))

  return (
    <div className="flex justify-end pt-2">
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {label}
      </button>
    </div>
  )
}

function HotkeyHint({ label }: { label: string }): React.JSX.Element {
  // Extract and bold the hotkey token (looks like "Alt+Shift+S" or "Alt+Shift+M").
  const parts = label.split(/(\b[A-Z][a-zA-Z+]+[A-Z]\b)/)
  return (
    <div className="flex items-start gap-3 rounded-xl bg-zinc-800 px-4 py-3">
      <span className="mt-0.5 text-indigo-400">⌨</span>
      <p className="text-sm text-zinc-300">
        {parts.map((part, i) =>
          /^[A-Z]/.test(part) && part.includes('+') ? (
            <kbd
              key={i}
              className="rounded bg-zinc-700 px-1.5 py-0.5 font-mono text-xs text-zinc-100"
            >
              {part}
            </kbd>
          ) : (
            part
          )
        )}
      </p>
    </div>
  )
}

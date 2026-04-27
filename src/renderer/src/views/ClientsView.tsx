import { useState, useEffect } from 'react'
import type { Client, CreateClientInput, UpdateClientInput } from '../../../shared/types'
import { formatRateInput, parseRateInput } from '../../../shared/rate'
import { useClientsStore } from '../store/clientsStore'
import { useT } from '../contexts/I18nContext'
import type { TranslationKey } from '../../../shared/locales/de'
import * as Icons from '../components/Icons'

const COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#f97316', // orange
  '#14b8a6', // teal
  '#84cc16' // lime
]

const COLOR_NAMES_KEYS: Record<string, TranslationKey> = {
  '#6366f1': 'clients.color.indigo',
  '#8b5cf6': 'clients.color.violet',
  '#ec4899': 'clients.color.pink',
  '#f59e0b': 'clients.color.amber',
  '#10b981': 'clients.color.emerald',
  '#3b82f6': 'clients.color.blue',
  '#ef4444': 'clients.color.red',
  '#f97316': 'clients.color.orange',
  '#14b8a6': 'clients.color.teal',
  '#84cc16': 'clients.color.lime',
}

export default function ClientsView() {
  const t = useT()
  const [clients, setClients] = useState<Client[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [archivedExpanded, setArchivedExpanded] = useState(false)
  const bumpClientsVersion = useClientsStore((s) => s.bumpVersion)

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    setIsLoading(true)
    const res = await window.api.clients.getAll()
    if (res.ok) setClients(res.data)
    setIsLoading(false)
  }

  function openNew() {
    setEditingClient(null)
    setShowForm(true)
  }

  function openEdit(client: Client) {
    setEditingClient(client)
    setShowForm(true)
  }

  async function handleDelete(client: Client) {
    if (!confirm(t('clients.confirm.delete', { name: client.name })))
      return
    await window.api.clients.delete(client.id)
    await loadClients()
    bumpClientsVersion()
  }

  async function handleToggleActive(client: Client) {
    await window.api.clients.update({ ...client, active: client.active ? 0 : 1 })
    await loadClients()
    bumpClientsVersion()
  }

  async function handleSave(data: { name: string; color: string; rate_cent: number }) {
    if (editingClient) {
      const input: UpdateClientInput = { ...editingClient, ...data }
      await window.api.clients.update(input)
    } else {
      const input: CreateClientInput = data
      await window.api.clients.create(input)
    }
    await loadClients()
    bumpClientsVersion()
    setShowForm(false)
    setEditingClient(null)
  }

  const activeClients = clients.filter((c) => c.active)
  const inactiveClients = clients.filter((c) => !c.active)

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{t('clients.title')}</h1>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-1.5 transition-colors"
        >
          <Icons.Plus />
          {t('clients.addNew')}
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500 text-sm">{t('clients.loading')}</p>
      ) : (
        <>
          {clients.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <p className="text-4xl mb-3">👤</p>
              <p className="font-medium">{t('clients.empty.title')}</p>
              <p className="text-sm mt-1">{t('clients.empty.hint')}</p>
            </div>
          )}

          {activeClients.length > 0 && (
            <ClientList
              clients={activeClients}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
            />
          )}

          {inactiveClients.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setArchivedExpanded((v) => !v)}
                aria-expanded={archivedExpanded}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300
                  text-xs font-medium uppercase tracking-wide mb-2 transition-colors"
              >
                <svg
                  aria-hidden="true"
                  className={`w-3 h-3 transition-transform duration-200 ${archivedExpanded ? 'rotate-90' : ''}`}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 2l4 4-4 4" />
                </svg>
                {t('clients.archivedSection', { count: inactiveClients.length })}
              </button>
              {archivedExpanded && (
                <ClientList
                  clients={inactiveClients}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onToggleActive={handleToggleActive}
                  dimmed
                />
              )}
            </div>
          )}
        </>
      )}

      {showForm && (
        <ClientFormModal
          client={editingClient}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false)
            setEditingClient(null)
          }}
        />
      )}
    </div>
  )
}

function ClientList({
  clients,
  onEdit,
  onDelete,
  onToggleActive,
  dimmed = false
}: {
  clients: Client[]
  onEdit: (c: Client) => void
  onDelete: (c: Client) => void
  onToggleActive: (c: Client) => void
  dimmed?: boolean
}) {
  return (
    <ul className="flex flex-col gap-2">
      {clients.map((c) => (
        <ClientItem key={c.id} client={c} onEdit={onEdit} onDelete={onDelete} onToggleActive={onToggleActive} dimmed={dimmed} />
      ))}
    </ul>
  )
}

function ClientItem({
  client: c, onEdit, onDelete, onToggleActive, dimmed = false
}: {
  client: Client
  onEdit: (c: Client) => void
  onDelete: (c: Client) => void
  onToggleActive: (c: Client) => void
  dimmed?: boolean
}) {
  const t = useT()
  return (
    <li
      key={c.id}
      className="flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-xl transition-colors"
      style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
    >
      <span
        className={`w-4 h-4 rounded-full shrink-0 ${dimmed ? 'opacity-40' : ''}`}
        style={{ backgroundColor: c.color }}
      />
      <span className={`flex-1 font-medium ${dimmed ? 'opacity-50' : ''}`} style={{ color: 'var(--text)' }}>
        {c.name}
      </span>
      <button
        onClick={() => onToggleActive(c)}
        title={c.active ? t('clients.action.archive') : t('clients.action.reactivate')}
        className="rounded p-1 transition-colors hover:bg-white/10"
        style={{ color: 'var(--text3)' }}
      >
        {c.active ? <Icons.Archive /> : <Icons.Unarchive />}
      </button>
      <button
        onClick={() => onEdit(c)}
        className="rounded p-1 transition-colors hover:bg-white/10"
        style={{ color: 'var(--text3)' }}
      >
        <Icons.Edit />
      </button>
      <button
        onClick={() => onDelete(c)}
        className="rounded p-1 transition-colors hover:bg-white/10"
        style={{ color: 'var(--danger)' }}
      >
        <Icons.Trash />
      </button>
    </li>
  )
}

function ClientFormModal({
  client,
  onSave,
  onClose
}: {
  client: Client | null
  onSave: (data: { name: string; color: string; rate_cent: number }) => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  const [name, setName] = useState(client?.name ?? '')
  const [color, setColor] = useState(client?.color ?? COLORS[0])
  const [rateInput, setRateInput] = useState(() => formatRateInput(client?.rate_cent ?? 0))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [rateError, setRateError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('clients.form.nameRequired'))
      return
    }
    const parsed = parseRateInput(rateInput)
    if (parsed === 'invalid') {
      setRateError(t('clients.form.rateInvalid'))
      return
    }
    if (parsed === 'negative') {
      setRateError(t('clients.form.rateNegative'))
      return
    }
    setIsSaving(true)
    await onSave({ name: trimmed, color, rate_cent: parsed })
    setIsSaving(false)
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 backdrop-blur-sm py-8 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border backdrop-blur-xl my-auto"
        style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
      >
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--text)' }}>
          {client ? t('clients.form.editTitle') : t('clients.form.createTitle')}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text2)' }}>
              {t('clients.form.nameLabel')}
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder={t('clients.form.namePlaceholder')}
              className="rounded-lg px-3 py-2.5 border backdrop-blur-xl focus:outline-none
                focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
            />
            {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
          </div>

          {/* Color */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text2)' }}>
              {t('clients.form.colorLabel')}
            </label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={t(COLOR_NAMES_KEYS[c] ?? 'clients.color.indigo')}
                  aria-label={t('clients.form.colorAria', { color: t(COLOR_NAMES_KEYS[c] ?? 'clients.color.indigo') })}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    color === c
                      ? 'scale-125 ring-2 ring-white ring-offset-2'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Hourly rate (optional, used by v1.3 PDF export) */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="client-rate"
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: 'var(--text2)' }}
            >
              {t('clients.form.rateLabel')}
            </label>
            <div className="relative">
              <input
                id="client-rate"
                type="text"
                inputMode="decimal"
                value={rateInput}
                onChange={(e) => {
                  setRateInput(e.target.value)
                  setRateError('')
                }}
                placeholder={t('clients.form.ratePlaceholder')}
                className="rounded-lg pl-3 pr-10 py-2.5 w-full border backdrop-blur-xl focus:outline-none
                  focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm" style={{ color: 'var(--text3)' }}>
                €
              </span>
            </div>
            {rateError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{rateError}</p>}
            {!rateError && (
              <p className="text-xs" style={{ color: 'var(--text3)' }}>{t('clients.form.rateHint')}</p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 font-medium py-2.5 rounded-lg transition-colors hover:opacity-90"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--card-border)', color: 'var(--text2)' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50
                text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

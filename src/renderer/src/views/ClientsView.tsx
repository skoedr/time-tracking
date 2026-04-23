import { useState, useEffect } from 'react'
import type { Client, CreateClientInput, UpdateClientInput } from '../../../shared/types'

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
  '#84cc16', // lime
]

const COLOR_NAMES: Record<string, string> = {
  '#6366f1': 'Indigo',
  '#8b5cf6': 'Violett',
  '#ec4899': 'Pink',
  '#f59e0b': 'Amber',
  '#10b981': 'Smaragd',
  '#3b82f6': 'Blau',
  '#ef4444': 'Rot',
  '#f97316': 'Orange',
  '#14b8a6': 'Teal',
  '#84cc16': 'Lime',
}

export default function ClientsView() {
  const [clients, setClients] = useState<Client[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)

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
    if (!confirm(`Kunde "${client.name}" wirklich löschen?\nAlle Zeiteinträge werden mitgelöscht.`))
      return
    await window.api.clients.delete(client.id)
    await loadClients()
  }

  async function handleToggleActive(client: Client) {
    await window.api.clients.update({ ...client, active: client.active ? 0 : 1 })
    await loadClients()
  }

  async function handleSave(data: { name: string; color: string }) {
    if (editingClient) {
      const input: UpdateClientInput = { ...editingClient, ...data }
      await window.api.clients.update(input)
    } else {
      const input: CreateClientInput = data
      await window.api.clients.create(input)
    }
    await loadClients()
    setShowForm(false)
    setEditingClient(null)
  }

  const activeClients = clients.filter((c) => c.active)
  const inactiveClients = clients.filter((c) => !c.active)

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Kunden</h1>
        <button
          onClick={openNew}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium
            px-4 py-2 rounded-lg transition-colors"
        >
          + Neuer Kunde
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-500 text-sm">Lädt...</p>
      ) : (
        <>
          {clients.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              <p className="text-4xl mb-3">👤</p>
              <p className="font-medium">Noch keine Kunden</p>
              <p className="text-sm mt-1">Lege deinen ersten Kunden an.</p>
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
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-2">
                Archiviert
              </p>
              <ClientList
                clients={inactiveClients}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggleActive={handleToggleActive}
                dimmed
              />
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
        <li
          key={c.id}
          className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3"
        >
          <span
            className={`w-4 h-4 rounded-full shrink-0 ${dimmed ? 'opacity-40' : ''}`}
            style={{ backgroundColor: c.color }}
          />
          <span className={`flex-1 text-slate-100 font-medium ${dimmed ? 'opacity-50' : ''}`}>{c.name}</span>
          <button
            onClick={() => onToggleActive(c)}
            title={c.active ? 'Archivieren' : 'Reaktivieren'}
            className="text-slate-500 hover:text-slate-300 text-sm transition-colors px-1"
          >
            {c.active ? '📦' : '♻️'}
          </button>
          <button
            onClick={() => onEdit(c)}
            className="text-slate-500 hover:text-slate-300 text-sm transition-colors px-1"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(c)}
            className="text-slate-500 hover:text-red-400 text-sm transition-colors px-1"
          >
            🗑️
          </button>
        </li>
      ))}
    </ul>
  )
}

function ClientFormModal({
  client,
  onSave,
  onClose
}: {
  client: Client | null
  onSave: (data: { name: string; color: string }) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(client?.name ?? '')
  const [color, setColor] = useState(client?.color ?? COLORS[0])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Name ist erforderlich.')
      return
    }
    setIsSaving(true)
    await onSave({ name: trimmed, color })
    setIsSaving(false)
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-5">
          {client ? 'Kunde bearbeiten' : 'Neuer Kunde'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">
              Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="z.B. Mustermann GmbH"
              className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5
                text-slate-100 placeholder:text-slate-600 focus:outline-none
                focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>

          {/* Color */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">
              Farbe
            </label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={COLOR_NAMES[c] ?? c}
                  aria-label={`Farbe ${COLOR_NAMES[c] ?? c}`}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-800' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200
                font-medium py-2.5 rounded-lg transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50
                text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              {isSaving ? '...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

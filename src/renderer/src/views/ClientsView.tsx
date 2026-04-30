import { useState, useEffect, useCallback } from 'react'
import type {
  Client,
  CreateClientInput,
  UpdateClientInput,
  Project,
  ProjectWithCount,
  CreateProjectInput,
  UpdateProjectInput
} from '../../../shared/types'
import { formatRateInput, parseRateInput } from '../../../shared/rate'
import { useClientsStore } from '../store/clientsStore'
import { useProjectsStore } from '../store/projectsStore'
import { useT, useLocale } from '../contexts/I18nContext'
import type { TranslationKey } from '../../../shared/locales/de'
import * as Icons from '../components/Icons'
import { Dialog } from '../components/Dialog'
import { ConfirmDialog } from '../components/ConfirmDialog'

/** Lightens a hex color by the given amount (0-100) to create a visually
 * related but distinct project color from the client color. */
function shiftColor(hex: string, lightnessShift = 18): string {
  if (!hex || !hex.startsWith('#') || hex.length !== 7) return hex
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      default: h = ((r - g) / d + 4) / 6
    }
  }
  const newL = Math.min(0.85, Math.max(0, l + lightnessShift / 100))
  function hue2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1; if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let nr, ng, nb
  if (s === 0) { nr = ng = nb = newL } else {
    const q = newL < 0.5 ? newL * (1 + s) : newL + s - newL * s
    const p = 2 * newL - q
    nr = hue2rgb(p, q, h + 1 / 3); ng = hue2rgb(p, q, h); nb = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`
}

/** Returns a human-readable relative date string (e.g. "vor 3 Tagen") using Intl.RelativeTimeFormat. */
function formatRelativeDate(isoDate: string, locale: string): string {
  const diff = new Date(isoDate).getTime() - Date.now()
  const diffDays = Math.round(diff / (1000 * 60 * 60 * 24))
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(diffDays) < 1) return rtf.format(0, 'day')
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, 'day')
  if (Math.abs(diffDays) < 365) return rtf.format(Math.round(diffDays / 30), 'month')
  return rtf.format(Math.round(diffDays / 365), 'year')
}

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
  const bumpProjectsVersion = useProjectsStore((s) => s.bumpVersion)

  // Project sub-list state
  const [expandedClientIds, setExpandedClientIds] = useState<Set<number>>(new Set())
  const [projectsByClient, setProjectsByClient] = useState<Record<number, ProjectWithCount[]>>({})
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [projectFormClientId, setProjectFormClientId] = useState<number | null>(null)

  // Pending-delete state (drives ConfirmDialog instead of native confirm())
  const [pendingDeleteClient, setPendingDeleteClient] = useState<Client | null>(null)
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectWithCount | null>(null)

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    setIsLoading(true)
    const res = await window.api.clients.getAll()
    if (res.ok) setClients(res.data)
    setIsLoading(false)
  }

  const loadProjectsForClient = useCallback(async (clientId: number) => {
    const res = await window.api.projects.getAll({ clientId })
    if (res.ok) {
      setProjectsByClient((prev) => ({ ...prev, [clientId]: res.data as ProjectWithCount[] }))
    }
  }, [])

  async function toggleClientExpanded(clientId: number) {
    setExpandedClientIds((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) {
        next.delete(clientId)
      } else {
        next.add(clientId)
        loadProjectsForClient(clientId)
      }
      return next
    })
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
    setPendingDeleteClient(client)
  }

  async function doDeleteClient() {
    if (!pendingDeleteClient) return
    await window.api.clients.delete(pendingDeleteClient.id)
    setPendingDeleteClient(null)
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

  function openNewProject(clientId: number) {
    setEditingProject(null)
    setProjectFormClientId(clientId)
    setShowProjectForm(true)
  }

  function openEditProject(project: Project) {
    setEditingProject(project)
    setProjectFormClientId(project.client_id)
    setShowProjectForm(true)
  }

  async function handleProjectSave(data: {
    name: string
    color: string
    rate_cent: number | null
  }) {
    if (!projectFormClientId && projectFormClientId !== 0) return
    if (editingProject) {
      const input: UpdateProjectInput = {
        ...editingProject,
        ...data,
        client_id: projectFormClientId
      }
      await window.api.projects.update(input)
    } else {
      const input: CreateProjectInput = { client_id: projectFormClientId, ...data }
      await window.api.projects.create(input)
    }
    await loadProjectsForClient(projectFormClientId)
    bumpProjectsVersion()
    setShowProjectForm(false)
    setEditingProject(null)
    setProjectFormClientId(null)
  }

  async function handleProjectArchive(project: Project) {
    await window.api.projects.archive(project.id)
    if (project.client_id !== null) await loadProjectsForClient(project.client_id)
    bumpProjectsVersion()
  }

  async function handleProjectDelete(project: ProjectWithCount) {
    setPendingDeleteProject(project)
  }

  async function doDeleteProject() {
    if (!pendingDeleteProject) return
    const res = await window.api.projects.delete(pendingDeleteProject.id)
    const clientId = pendingDeleteProject.client_id
    setPendingDeleteProject(null)
    if (!res.ok) return
    if (clientId !== null) await loadProjectsForClient(clientId)
    bumpProjectsVersion()
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
              expandedClientIds={expandedClientIds}
              projectsByClient={projectsByClient}
              onEdit={openEdit}
              onDelete={handleDelete}
              onToggleActive={handleToggleActive}
              onToggleExpand={toggleClientExpanded}
              onNewProject={openNewProject}
              onEditProject={openEditProject}
              onArchiveProject={handleProjectArchive}
              onDeleteProject={handleProjectDelete}
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
                  expandedClientIds={expandedClientIds}
                  projectsByClient={projectsByClient}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onToggleActive={handleToggleActive}
                  onToggleExpand={toggleClientExpanded}
                  onNewProject={openNewProject}
                  onEditProject={openEditProject}
                  onArchiveProject={handleProjectArchive}
                  onDeleteProject={handleProjectDelete}
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

      {showProjectForm && (
        <ProjectFormModal
          project={editingProject}
          clientColor={clients.find((c) => c.id === projectFormClientId)?.color ?? ''}
          onSave={handleProjectSave}
          onClose={() => {
            setShowProjectForm(false)
            setEditingProject(null)
            setProjectFormClientId(null)
          }}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteClient !== null}
        variant="danger"
        title={t('clients.confirm.deleteTitle')}
        message={pendingDeleteClient ? t('clients.confirm.delete', { name: pendingDeleteClient.name }) : ''}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void doDeleteClient()}
        onCancel={() => setPendingDeleteClient(null)}
      />

      <ConfirmDialog
        open={pendingDeleteProject !== null}
        variant="danger"
        title={t('projects.confirm.deleteTitle')}
        message={
          pendingDeleteProject
            ? (pendingDeleteProject.entry_count ?? 0) > 0
              ? t('projects.confirm.deleteWithEntries', {
                  name: pendingDeleteProject.name,
                  count: String(pendingDeleteProject.entry_count)
                })
              : t('projects.confirm.delete', { name: pendingDeleteProject.name })
            : ''
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void doDeleteProject()}
        onCancel={() => setPendingDeleteProject(null)}
      />
    </div>
  )
}

function ClientList({
  clients,
  expandedClientIds,
  projectsByClient,
  onEdit,
  onDelete,
  onToggleActive,
  onToggleExpand,
  onNewProject,
  onEditProject,
  onArchiveProject,
  onDeleteProject,
  dimmed = false
}: {
  clients: Client[]
  expandedClientIds: Set<number>
  projectsByClient: Record<number, ProjectWithCount[]>
  onEdit: (c: Client) => void
  onDelete: (c: Client) => void
  onToggleActive: (c: Client) => void
  onToggleExpand: (clientId: number) => void
  onNewProject: (clientId: number) => void
  onEditProject: (p: Project) => void
  onArchiveProject: (p: Project) => void
  onDeleteProject: (p: ProjectWithCount) => void
  dimmed?: boolean
}) {
  return (
    <ul className="flex flex-col gap-2">
      {clients.map((c) => (
        <ClientItem
          key={c.id}
          client={c}
          expanded={expandedClientIds.has(c.id)}
          projects={projectsByClient[c.id]}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
          onToggleExpand={onToggleExpand}
          onNewProject={onNewProject}
          onEditProject={onEditProject}
          onArchiveProject={onArchiveProject}
          onDeleteProject={onDeleteProject}
          dimmed={dimmed}
        />
      ))}
    </ul>
  )
}

function ClientItem({
  client: c,
  expanded,
  projects,
  onEdit,
  onDelete,
  onToggleActive,
  onToggleExpand,
  onNewProject,
  onEditProject,
  onArchiveProject,
  onDeleteProject,
  dimmed = false
}: {
  client: Client
  expanded: boolean
  projects: ProjectWithCount[] | undefined
  onEdit: (c: Client) => void
  onDelete: (c: Client) => void
  onToggleActive: (c: Client) => void
  onToggleExpand: (clientId: number) => void
  onNewProject: (clientId: number) => void
  onEditProject: (p: Project) => void
  onArchiveProject: (p: Project) => void
  onDeleteProject: (p: ProjectWithCount) => void
  dimmed?: boolean
}) {
  const t = useT()
  const activeProjects = projects?.filter((p) => p.active) ?? []
  const archivedProjects = projects?.filter((p) => !p.active) ?? []
  const allProjects = projects ?? []

  return (
    <li
      className="rounded-xl border backdrop-blur-xl transition-colors overflow-hidden"
      style={{ background: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
    >
      {/* Client row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Chevron toggle */}
        <button
          onClick={() => onToggleExpand(c.id)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Projekte verbergen' : 'Projekte anzeigen'}
          className="rounded p-0.5 transition-colors hover:bg-white/10 shrink-0"
          style={{ color: 'var(--text3)' }}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 2l4 4-4 4" />
          </svg>
        </button>

        <span
          className={`w-4 h-4 rounded-full shrink-0 ${dimmed ? 'opacity-40' : ''}`}
          style={{ backgroundColor: c.color }}
        />
        <span className={`flex-1 font-medium ${dimmed ? 'opacity-50' : ''}`} style={{ color: 'var(--text)' }}>
          {c.name}
        </span>
        {/* project count badge */}
        {allProjects.length > 0 && !expanded && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{ background: 'var(--input-bg)', color: 'var(--text3)' }}
          >
            {allProjects.length}
          </span>
        )}
        <button
          onClick={() => onToggleActive(c)}
          title={c.active ? t('clients.action.archive') : t('clients.action.reactivate')}
          className="rounded p-1 transition-colors hover:bg-white/10"
          style={{ color: 'var(--text3)' }}
        >
          {c.active ? <Icons.Archive /> : <Icons.Unarchive />}
        </button>
        {c.active && (
          <button
            onClick={() => onNewProject(c.id)}
            title={t('projects.addNew')}
            className="rounded p-1 transition-colors hover:bg-white/10"
            style={{ color: 'var(--text3)' }}
          >
            <Icons.Plus />
          </button>
        )}
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
      </div>

      {/* Project sub-list (collapsible) */}
      {expanded && (
        <div
          className="border-t px-4 pb-3 pt-2"
          style={{ borderColor: 'var(--card-border)' }}
        >
          {/* Active projects */}
          {activeProjects.length === 0 && archivedProjects.length === 0 && (
            <p className="text-xs py-1" style={{ color: 'var(--text3)' }}>
              {t('projects.empty')}
            </p>
          )}
          {activeProjects.length > 0 && (
            <ul className="flex flex-col gap-1.5 mb-2">
              {activeProjects.map((p) => (
                <ProjectItem
                  key={p.id}
                  project={p}
                  clientColor={c.color}
                  onEdit={onEditProject}
                  onArchive={onArchiveProject}
                  onDelete={onDeleteProject}
                />
              ))}
            </ul>
          )}
          {/* Archived projects */}
          {archivedProjects.length > 0 && (
            <ArchivedProjectsSection
              projects={archivedProjects}
              clientColor={c.color}
              onEdit={onEditProject}
              onArchive={onArchiveProject}
              onDelete={onDeleteProject}
            />
          )}
          {/* Add project button */}
          {c.active && (
            <button
              onClick={() => onNewProject(c.id)}
              className="flex items-center gap-1.5 text-xs mt-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/10"
              style={{ color: 'var(--text2)' }}
            >
              <Icons.Plus />
              {t('projects.addNew')}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function ProjectItem({
  project: p,
  clientColor,
  onEdit,
  onArchive,
  onDelete
}: {
  project: ProjectWithCount
  clientColor: string
  onEdit: (p: Project) => void
  onArchive: (p: Project) => void
  onDelete: (p: ProjectWithCount) => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const dotColor = p.color || (clientColor ? shiftColor(clientColor) : '')
  const rateLabel =
    p.rate_cent !== null
      ? formatRateInput(p.rate_cent) + ' €/h'
      : t('projects.inheritedRate')

  const statsLabel = (() => {
    const count = p.entry_count ?? 0
    if (count === 0) return null
    const countStr = t(count === 1 ? 'projects.stats.entry' : 'projects.stats.entries', { count })
    if (!p.last_used_at) return countStr
    const rel = formatRelativeDate(p.last_used_at, locale)
    return `${countStr} · ${rel}`
  })()

  return (
    <li className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 group"
      style={{ background: 'var(--input-bg)' }}
    >
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium" style={{ color: 'var(--text)' }}>{p.name}</span>
        {statsLabel && (
          <span className="block text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{statsLabel}</span>
        )}
      </span>
      <span className="text-xs" style={{ color: 'var(--text3)' }}>
        {rateLabel}
      </span>
      <button
        onClick={() => onArchive(p)}
        title={p.active ? t('projects.action.archive') : t('projects.action.reactivate')}
        className="rounded p-0.5 transition-colors hover:bg-white/10 opacity-0 group-hover:opacity-100"
        style={{ color: 'var(--text3)' }}
      >
        {p.active ? <Icons.Archive /> : <Icons.Unarchive />}
      </button>
      <button
        onClick={() => onEdit(p)}
        className="rounded p-0.5 transition-colors hover:bg-white/10 opacity-0 group-hover:opacity-100"
        style={{ color: 'var(--text3)' }}
      >
        <Icons.Edit />
      </button>
      <button
        onClick={() => onDelete(p)}
        className="rounded p-0.5 transition-colors hover:bg-white/10 opacity-0 group-hover:opacity-100"
        style={{ color: 'var(--danger)' }}
      >
        <Icons.Trash />
      </button>
    </li>
  )
}

function ArchivedProjectsSection({
  projects,
  clientColor,
  onEdit,
  onArchive,
  onDelete
}: {
  projects: ProjectWithCount[]
  clientColor: string
  onEdit: (p: Project) => void
  onArchive: (p: Project) => void
  onDelete: (p: ProjectWithCount) => void
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs mb-1 transition-colors hover:opacity-80"
        style={{ color: 'var(--text3)' }}
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 2l4 4-4 4" />
        </svg>
        {t('projects.archivedSection', { count: String(projects.length) })}
      </button>
      {expanded && (
        <ul className="flex flex-col gap-1.5 opacity-60">
          {projects.map((p) => (
            <ProjectItem
              key={p.id}
              project={p}
              clientColor={clientColor}
              onEdit={onEdit}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </div>
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
    <Dialog
      open
      onClose={onClose}
      title={client ? t('clients.form.editTitle') : t('clients.form.createTitle')}
      widthClass="w-[400px]"
    >
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
    </Dialog>
  )
}

function ProjectFormModal({
  project,
  clientColor,
  onSave,
  onClose
}: {
  project: Project | null
  clientColor: string
  onSave: (data: { name: string; color: string; rate_cent: number | null }) => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  // For new projects: auto-derive a shifted variant of the client color.
  // For existing projects: use their stored color ('' = inherit).
  const [name, setName] = useState(project?.name ?? '')
  const [color, setColor] = useState(() =>
    project ? project.color : (clientColor ? shiftColor(clientColor) : '')
  )
  const [rateInput, setRateInput] = useState(() =>
    project?.rate_cent !== null && project?.rate_cent !== undefined
      ? formatRateInput(project.rate_cent)
      : ''
  )
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [rateError, setRateError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('projects.form.nameRequired'))
      return
    }
    let rate_cent: number | null = null
    if (rateInput.trim() !== '') {
      const parsed = parseRateInput(rateInput)
      if (parsed === 'invalid') {
        setRateError(t('projects.form.rateInvalid'))
        return
      }
      if (parsed === 'negative') {
        setRateError(t('projects.form.rateNegative'))
        return
      }
      rate_cent = parsed === 0 ? null : parsed
    }
    setIsSaving(true)
    await onSave({ name: trimmed, color, rate_cent })
    setIsSaving(false)
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={project ? t('projects.form.editTitle') : t('projects.form.createTitle')}
      widthClass="w-[400px]"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text2)' }}>
            {t('projects.form.nameLabel')}
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
            placeholder={t('projects.form.namePlaceholder')}
            className="rounded-lg px-3 py-2.5 border backdrop-blur-xl focus:outline-none
              focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            style={{ background: 'var(--input-bg)', borderColor: 'var(--card-border)', color: 'var(--text)' }}
          />
          {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
        </div>

        {/* Color */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text2)' }}>
            {t('projects.form.colorLabel')}
          </label>
          <div className="flex gap-2 flex-wrap items-center">
            {/* Inherit option */}
            <button
              type="button"
              title={t('projects.form.colorInherit')}
              aria-label={t('projects.form.colorInherit')}
              onClick={() => setColor('')}
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-transform ${
                color === ''
                  ? 'scale-125 ring-2 ring-white ring-offset-2 border-slate-400'
                  : 'hover:scale-110 border-slate-600'
              }`}
              style={{ background: 'var(--input-bg)' }}
            >
              <span className="text-xs" style={{ color: 'var(--text3)' }}>–</span>
            </button>
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
          {color === '' && (
            <p className="text-xs" style={{ color: 'var(--text3)' }}>
              {t('projects.form.colorInherit')}
            </p>
          )}
        </div>

        {/* Hourly rate override (optional) */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="project-rate"
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: 'var(--text2)' }}
          >
            {t('projects.form.rateLabel')}
          </label>
          <div className="relative">
            <input
              id="project-rate"
              type="text"
              inputMode="decimal"
              value={rateInput}
              onChange={(e) => {
                setRateInput(e.target.value)
                setRateError('')
              }}
              placeholder={t('projects.form.ratePlaceholder')}
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
            <p className="text-xs" style={{ color: 'var(--text3)' }}>{t('projects.form.rateHint')}</p>
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
    </Dialog>
  )
}

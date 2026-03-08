'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('ProjectsPanel')

interface Project {
  id: number
  name: string
  slug: string
  description?: string
  ticket_prefix: string
  ticket_counter: number
  status: 'active' | 'archived'
  created_at: number
  updated_at: number
}

interface Task {
  id: number
  title: string
  status: 'inbox' | 'assigned' | 'in_progress' | 'review' | 'quality_review' | 'done'
  priority: 'low' | 'medium' | 'high' | 'critical' | 'urgent'
  assigned_to?: string
  due_date?: number
  ticket_ref?: string
  created_at: number
  updated_at: number
}

interface ProjectWithTasks extends Project {
  tasks: Task[]
}

const STATUS_ORDER = ['inbox', 'assigned', 'in_progress', 'review', 'quality_review', 'done'] as const
const STATUS_LABELS: Record<string, string> = {
  inbox: 'Inbox',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  review: 'Review',
  quality_review: 'QA',
  done: 'Done',
}
const STATUS_COLORS: Record<string, string> = {
  inbox: 'bg-muted text-muted-foreground',
  assigned: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  in_progress: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  review: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  quality_review: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  done: 'bg-green-500/15 text-green-600 dark:text-green-400',
}
const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-blue-500',
  high: 'text-amber-500',
  critical: 'text-red-500',
  urgent: 'text-red-600',
}
const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-muted-foreground/40',
  medium: 'bg-blue-500',
  high: 'bg-amber-500',
  critical: 'bg-red-500',
  urgent: 'bg-red-600',
}

function taskProgress(tasks: Task[]): number {
  if (!tasks.length) return 0
  const done = tasks.filter(t => t.status === 'done').length
  return Math.round((done / tasks.length) * 100)
}

function tasksByStatus(tasks: Task[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] || 0) + 1
  }
  return counts
}

function relativeTime(ts: number): string {
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ────────────────────────────────────────────────
// Create project modal
// ────────────────────────────────────────────────
function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prefix, setPrefix] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Auto-suggest prefix from name
  useEffect(() => {
    if (!prefix && name) {
      setPrefix(name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))
    }
  }, [name, prefix])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Project name is required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), ticket_prefix: prefix }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create project'); return }
      onCreated(data.project)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">New Project</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Project Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setPrefix('') }}
              placeholder="e.g. Mission Control"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What is this project about?"
              rows={2}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Ticket Prefix</label>
            <input
              type="text"
              value={prefix}
              onChange={e => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
              placeholder="e.g. MC"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">Used for ticket refs like MC-001</p>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────
// Project detail view
// ────────────────────────────────────────────────
function ProjectDetail({ project, onBack, onArchive }: {
  project: Project
  onBack: () => void
  onArchive: (id: number) => void
}) {
  const [detail, setDetail] = useState<ProjectWithTasks | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeStatus, setActiveStatus] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/tasks`)
      if (!res.ok) return
      const data = await res.json()
      setDetail({ ...data.project, tasks: data.tasks })
    } catch (e) {
      log.error({ err: e }, 'Failed to load project detail')
    } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => { load() }, [load])

  const progress = detail ? taskProgress(detail.tasks) : 0
  const counts = detail ? tasksByStatus(detail.tasks) : {}
  const visibleTasks = detail
    ? (activeStatus ? detail.tasks.filter(t => t.status === activeStatus) : detail.tasks)
    : []

  async function handleArchive() {
    if (!confirm(`Archive "${project.name}"? It will be hidden from the projects list.`)) return
    await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
    onArchive(project.id)
    onBack()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M10 3L5 8l5 5" />
          </svg>
          Projects
        </button>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-semibold text-foreground">{project.name}</span>
        <span className="ml-1 px-2 py-0.5 text-xs font-mono bg-muted rounded text-muted-foreground">{project.ticket_prefix}</span>
        <div className="flex-1" />
        {project.status === 'active' && (
          <button
            onClick={handleArchive}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded hover:bg-destructive/10"
          >
            Archive
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Loading…
          </div>
        </div>
      ) : !detail ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Failed to load project</div>
      ) : (
        <div className="flex-1 overflow-auto">
          {/* Project meta + progress */}
          <div className="px-6 pt-5 pb-4 space-y-4">
            {detail.description && (
              <p className="text-sm text-muted-foreground">{detail.description}</p>
            )}

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{detail.tasks.length} task{detail.tasks.length !== 1 ? 's' : ''}</span>
                <span>{progress}% complete</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Status filter chips */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveStatus(null)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeStatus === null
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({detail.tasks.length})
              </button>
              {STATUS_ORDER.filter(s => counts[s] > 0).map(s => (
                <button
                  key={s}
                  onClick={() => setActiveStatus(activeStatus === s ? null : s)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeStatus === s
                      ? 'bg-primary text-primary-foreground'
                      : `${STATUS_COLORS[s]} hover:opacity-80`
                  }`}
                >
                  {STATUS_LABELS[s]} ({counts[s]})
                </button>
              ))}
            </div>
          </div>

          {/* Task list */}
          <div className="px-6 pb-6 space-y-2">
            {visibleTasks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                {detail.tasks.length === 0
                  ? 'No tasks yet — create one from the Task Board'
                  : 'No tasks match this filter'}
              </div>
            ) : (
              visibleTasks.map(task => (
                <div key={task.id} className="flex items-start gap-3 px-4 py-3 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[task.priority] || 'bg-muted'}`} title={task.priority} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{task.title}</span>
                      {task.ticket_ref && (
                        <span className="text-xs font-mono text-muted-foreground shrink-0">{task.ticket_ref}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[task.status]}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                      {task.assigned_to && (
                        <span className="text-xs text-muted-foreground">@{task.assigned_to}</span>
                      )}
                      {task.due_date && (
                        <span className={`text-xs ${task.due_date * 1000 < Date.now() && task.status !== 'done' ? 'text-red-500' : 'text-muted-foreground'}`}>
                          Due {new Date(task.due_date * 1000).toLocaleDateString()}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">{relativeTime(task.updated_at)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────
// Main panel
// ────────────────────────────────────────────────
export function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState<Project | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = `/api/projects${showArchived ? '?includeArchived=1' : ''}`
      const res = await fetch(url)
      if (!res.ok) return
      const data = await res.json()
      setProjects(data.projects || [])
    } catch (e) {
      log.error({ err: e }, 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => { load() }, [load])

  function handleCreated(project: Project) {
    setProjects(prev => [project, ...prev])
    setShowCreate(false)
    setSelected(project)
  }

  function handleArchived(id: number) {
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  // Detail view
  if (selected) {
    return (
      <div className="h-full">
        <ProjectDetail
          project={selected}
          onBack={() => setSelected(null)}
          onArchive={handleArchived}
        />
      </div>
    )
  }

  const active = projects.filter(p => p.status === 'active')
  const archived = projects.filter(p => p.status === 'archived')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Organise tasks and track progress across longer-term initiatives
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowArchived(v => !v) }}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              showArchived
                ? 'border-primary/50 text-primary bg-primary/10'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
          >
            {showArchived ? 'Hide Archived' : 'Show Archived'}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
              <path d="M8 2v12M2 8h12" />
            </svg>
            New Project
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <ProjectsIcon className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No projects yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first project to organise tasks into long-term initiatives.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Create Project
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active projects */}
          {active.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Active — {active.length}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {active.map(p => (
                  <ProjectCard key={p.id} project={p} onClick={() => setSelected(p)} />
                ))}
              </div>
            </div>
          )}

          {/* Archived */}
          {showArchived && archived.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Archived — {archived.length}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                {archived.map(p => (
                  <ProjectCard key={p.id} project={p} onClick={() => setSelected(p)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────
// Project card (list view)
// ────────────────────────────────────────────────
function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-xl border border-border bg-card hover:bg-secondary/50 hover:border-primary/30 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-snug">
          {project.name}
        </span>
        <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono bg-muted text-muted-foreground rounded">
          {project.ticket_prefix}
        </span>
      </div>
      {project.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{project.description}</p>
      )}
      <div className="flex items-center justify-between text-xs text-muted-foreground mt-auto">
        <span>{project.ticket_counter} ticket{project.ticket_counter !== 1 ? 's' : ''}</span>
        <span>Updated {relativeTime(project.updated_at)}</span>
      </div>
      {/* Mini progress indicator */}
      <div className="h-1 bg-muted rounded-full mt-3 overflow-hidden">
        <div className="h-full bg-primary/50 rounded-full w-0 group-hover:w-full transition-all duration-700" />
      </div>
    </button>
  )
}

function ProjectsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="14" height="11" rx="1.5" />
      <path d="M1 6h14" />
      <path d="M5 1v2M11 1v2" />
      <path d="M4 9h4M4 11.5h6" />
    </svg>
  )
}

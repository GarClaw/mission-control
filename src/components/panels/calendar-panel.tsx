'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useMissionControl, CronJob } from '@/store'
import { getCronOccurrences, buildDayKey } from '@/lib/cron-occurrences'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('CalendarPanel')

// ─── Helpers ─────────────────────────────────────────────────────────────────

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function getMonthGrid(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const gridStart = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}
function getWeekDays(anchor: Date): Date[] {
  const sun = addDays(startOfDay(anchor), -anchor.getDay())
  return Array.from({ length: 7 }, (_, i) => addDays(sun, i))
}
function fmtTime(ms: number) {
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function fmtDateLong(d: Date) {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
function fmtMonthYear(d: Date) {
  return d.toLocaleDateString([], { month: 'long', year: 'numeric' })
}
function fmtWeekRange(days: Date[]) {
  const s = days[0].toLocaleDateString([], { month: 'short', day: 'numeric' })
  const e = days[6].toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
  return `${s} – ${e}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'agenda'

interface CalendarEvent {
  id: string
  title: string
  time?: number       // epoch ms; undefined = all-day / due-date task
  dayKey: string
  kind: 'cron' | 'task'
  status?: string
  priority?: string
  schedule?: string
  enabled?: boolean
  lastStatus?: string
}

const PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-slate-400',
  medium: 'bg-blue-500',
  high: 'bg-amber-500',
  critical: 'bg-red-500',
  urgent: 'bg-red-600',
}
const STATUS_COLOR: Record<string, string> = {
  inbox: 'bg-muted-foreground/40',
  assigned: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  review: 'bg-purple-500',
  quality_review: 'bg-indigo-500',
  done: 'bg-green-500',
}

// ─── Event pill ──────────────────────────────────────────────────────────────

function EventPill({ ev, compact = false }: { ev: CalendarEvent; compact?: boolean }) {
  const isCron = ev.kind === 'cron'
  const dot = isCron
    ? (ev.enabled ? 'bg-primary' : 'bg-muted-foreground/40')
    : (PRIORITY_COLOR[ev.priority ?? ''] ?? 'bg-muted-foreground/40')

  if (compact) {
    return (
      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] leading-tight truncate ${
        isCron
          ? 'bg-primary/10 text-primary'
          : 'bg-secondary text-foreground'
      } ${!ev.enabled && isCron ? 'opacity-40' : ''}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
        <span className="truncate">{ev.time ? fmtTime(ev.time) + ' ' : ''}{ev.title}</span>
      </div>
    )
  }

  return (
    <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border ${
      isCron
        ? 'bg-primary/8 border-primary/20'
        : 'bg-card border-border'
    } ${!ev.enabled && isCron ? 'opacity-50' : ''}`}>
      <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">{ev.title}</span>
          {ev.time && <span className="text-xs text-muted-foreground shrink-0">{fmtTime(ev.time)}</span>}
        </div>
        {isCron && ev.schedule && (
          <span className="text-xs text-muted-foreground font-mono">{ev.schedule}</span>
        )}
        {!isCron && ev.status && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[ev.status] ?? 'bg-muted'}`} />
            <span className="text-xs text-muted-foreground capitalize">{ev.status.replace('_', ' ')}</span>
            {ev.priority && <span className="text-xs text-muted-foreground">· {ev.priority}</span>}
          </div>
        )}
        {isCron && ev.lastStatus && (
          <span className={`text-[10px] ${ev.lastStatus === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
            Last: {ev.lastStatus}
          </span>
        )}
      </div>
      <span className={`shrink-0 px-1.5 py-0.5 text-[10px] rounded font-medium ${
        isCron ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
      }`}>
        {isCron ? 'cron' : 'task'}
      </span>
    </div>
  )
}

// ─── Day column detail ────────────────────────────────────────────────────────

function DayDetail({ date, events, onClose }: { date: Date; events: CalendarEvent[]; onClose: () => void }) {
  const sorted = [...events].sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
  const crons = sorted.filter(e => e.kind === 'cron')
  const tasks = sorted.filter(e => e.kind === 'task')
  const isToday = isSameDay(date, new Date())

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">{fmtDateLong(date)}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {events.length} event{events.length !== 1 ? 's' : ''}
              {isToday && <span className="ml-2 px-1.5 py-0.5 bg-primary/15 text-primary rounded text-[10px] font-medium">Today</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nothing scheduled</p>
          )}
          {crons.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Cron Jobs ({crons.length})
              </h3>
              <div className="space-y-2">{crons.map(ev => <EventPill key={ev.id} ev={ev} />)}</div>
            </div>
          )}
          {tasks.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Tasks Due ({tasks.length})
              </h3>
              <div className="space-y-2">{tasks.map(ev => <EventPill key={ev.id} ev={ev} />)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({
  anchor, eventsByDay, onDayClick, selectedDay,
}: {
  anchor: Date
  eventsByDay: Map<string, CalendarEvent[]>
  onDayClick: (d: Date) => void
  selectedDay: Date | null
}) {
  const grid = useMemo(() => getMonthGrid(anchor), [anchor])
  const today = startOfDay(new Date())
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border shrink-0">
        {DAY_NAMES.map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 min-h-0">
        {grid.map((day, i) => {
          const key = buildDayKey(day)
          const evs = eventsByDay.get(key) || []
          const isCurrentMonth = day.getMonth() === anchor.getMonth()
          const isToday = isSameDay(day, today)
          const isSelected = selectedDay && isSameDay(day, selectedDay)
          const cronCount = evs.filter(e => e.kind === 'cron').length
          const taskCount = evs.filter(e => e.kind === 'task').length

          return (
            <button
              key={i}
              onClick={() => onDayClick(day)}
              className={`flex flex-col p-1.5 border-b border-r border-border text-left transition-colors min-h-0 overflow-hidden ${
                isCurrentMonth ? 'bg-background hover:bg-secondary/50' : 'bg-muted/20 hover:bg-muted/40'
              } ${isSelected ? 'ring-2 ring-inset ring-primary' : ''}`}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-1 shrink-0">
                <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full leading-none ${
                  isToday
                    ? 'bg-primary text-primary-foreground'
                    : isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/50'
                }`}>
                  {day.getDate()}
                </span>
                {evs.length > 0 && (
                  <span className="text-[9px] text-muted-foreground">{evs.length}</span>
                )}
              </div>

              {/* Event pills — first 3 */}
              <div className="flex flex-col gap-0.5 min-h-0 overflow-hidden">
                {evs.slice(0, 3).map(ev => (
                  <EventPill key={ev.id} ev={ev} compact />
                ))}
                {evs.length > 3 && (
                  <span className="text-[9px] text-muted-foreground px-1">+{evs.length - 3} more</span>
                )}
              </div>

              {/* Dot indicators if no room for pills */}
              {evs.length > 0 && (
                <div className="flex gap-0.5 mt-auto pt-0.5 shrink-0">
                  {cronCount > 0 && <span className="w-1 h-1 rounded-full bg-primary" />}
                  {taskCount > 0 && <span className="w-1 h-1 rounded-full bg-amber-500" />}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({
  anchor, eventsByDay, onDayClick,
}: {
  anchor: Date
  eventsByDay: Map<string, CalendarEvent[]>
  onDayClick: (d: Date) => void
}) {
  const days = useMemo(() => getWeekDays(anchor), [anchor])
  const today = startOfDay(new Date())
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border shrink-0">
        {days.map((d, i) => {
          const isToday = isSameDay(d, today)
          return (
            <button
              key={i}
              onClick={() => onDayClick(d)}
              className={`py-3 flex flex-col items-center gap-0.5 transition-colors hover:bg-secondary/50 ${isToday ? 'bg-primary/5' : ''}`}
            >
              <span className="text-[10px] text-muted-foreground">{DAY_SHORT[i]}</span>
              <span className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
                isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
              }`}>
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {/* Event rows */}
      <div className="grid grid-cols-7 flex-1 min-h-0 overflow-auto">
        {days.map((d, i) => {
          const key = buildDayKey(d)
          const evs = (eventsByDay.get(key) || []).sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
          const isToday = isSameDay(d, today)

          return (
            <div
              key={i}
              className={`border-r border-border p-1.5 space-y-1 min-h-[120px] cursor-pointer hover:bg-secondary/30 transition-colors ${isToday ? 'bg-primary/5' : ''}`}
              onClick={() => onDayClick(d)}
            >
              {evs.map(ev => <EventPill key={ev.id} ev={ev} compact />)}
              {evs.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground/30">—</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Agenda view ──────────────────────────────────────────────────────────────

function AgendaView({
  eventsByDay, anchor,
}: {
  eventsByDay: Map<string, CalendarEvent[]>
  anchor: Date
}) {
  // Show next 30 days from anchor
  const days = useMemo(() => Array.from({ length: 30 }, (_, i) => addDays(startOfDay(anchor), i)), [anchor])
  const today = startOfDay(new Date())

  const daysWithEvents = days.filter(d => {
    const key = buildDayKey(d)
    return (eventsByDay.get(key) || []).length > 0
  })

  if (daysWithEvents.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No events in the next 30 days
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto px-6 py-4 space-y-6">
      {daysWithEvents.map(d => {
        const key = buildDayKey(d)
        const evs = (eventsByDay.get(key) || []).sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
        const isToday = isSameDay(d, today)
        const isPast = d < today

        return (
          <div key={key}>
            <div className={`flex items-center gap-2 mb-2 ${isPast ? 'opacity-60' : ''}`}>
              <span className={`text-sm font-semibold ${isToday ? 'text-primary' : 'text-foreground'}`}>
                {d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
              {isToday && (
                <span className="px-1.5 py-0.5 bg-primary/15 text-primary text-[10px] font-medium rounded">Today</span>
              )}
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">{evs.length} event{evs.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-2">
              {evs.map(ev => <EventPill key={ev.id} ev={ev} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Today strip ─────────────────────────────────────────────────────────────

function TodayStrip({ events }: { events: CalendarEvent[] }) {
  const now = Date.now()
  const upcoming = events
    .filter(e => e.time && e.time > now)
    .sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
    .slice(0, 5)

  const past = events
    .filter(e => e.time && e.time <= now)
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
    .slice(0, 3)

  if (events.length === 0) return null

  return (
    <div className="border-b border-border px-6 py-3 bg-muted/20 shrink-0">
      <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
        <span className="text-xs font-semibold text-muted-foreground shrink-0">TODAY</span>
        {past.map(ev => (
          <div key={ev.id} className="flex items-center gap-1.5 shrink-0 opacity-50">
            <span className={`w-1.5 h-1.5 rounded-full ${ev.kind === 'cron' ? 'bg-primary' : (PRIORITY_COLOR[ev.priority ?? ''] ?? 'bg-muted-foreground')}`} />
            <span className="text-xs text-muted-foreground">{fmtTime(ev.time!)} {ev.title}</span>
          </div>
        ))}
        {past.length > 0 && upcoming.length > 0 && (
          <div className="w-px h-4 bg-border shrink-0" />
        )}
        {upcoming.length > 0 ? (
          upcoming.map((ev, i) => (
            <div key={ev.id} className={`flex items-center gap-1.5 shrink-0 ${i === 0 ? 'font-medium' : 'opacity-70'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ev.kind === 'cron' ? 'bg-primary' : (PRIORITY_COLOR[ev.priority ?? ''] ?? 'bg-muted-foreground')}`} />
              <span className="text-xs text-foreground">{fmtTime(ev.time!)} {ev.title}</span>
              {i === 0 && (
                <span className="px-1.5 py-0.5 bg-primary/15 text-primary text-[10px] rounded">next up</span>
              )}
            </div>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">No more events today</span>
        )}
      </div>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function CalendarPanel() {
  const { cronJobs, setCronJobs } = useMissionControl()
  const [tasks, setTasks] = useState<any[]>([])
  const [view, setView] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()))
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterKind, setFilterKind] = useState<'all' | 'cron' | 'task'>('all')

  // Load cron jobs + tasks
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cronRes, taskRes] = await Promise.all([
        fetch('/api/cron?action=list'),
        fetch('/api/tasks?limit=200'),
      ])
      if (cronRes.ok) {
        const data = await cronRes.json()
        if (Array.isArray(data.jobs)) setCronJobs(data.jobs)
      }
      if (taskRes.ok) {
        const data = await taskRes.json()
        setTasks(Array.isArray(data.tasks) ? data.tasks : [])
      }
    } catch (e) {
      log.error({ err: e }, 'Failed to load calendar data')
    } finally {
      setLoading(false)
    }
  }, [setCronJobs])

  useEffect(() => { load() }, [load])

  // Compute event window based on view
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (view === 'week') {
      const days = getWeekDays(anchor)
      return { rangeStart: days[0].getTime(), rangeEnd: addDays(days[6], 1).getTime() }
    }
    if (view === 'agenda') {
      return { rangeStart: anchor.getTime(), rangeEnd: addDays(anchor, 30).getTime() }
    }
    // month — include grid padding
    const grid = getMonthGrid(anchor)
    return { rangeStart: grid[0].getTime(), rangeEnd: addDays(grid[41], 1).getTime() }
  }, [view, anchor])

  // Build events map
  const { eventsByDay, todayEvents } = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()

    const add = (key: string, ev: CalendarEvent) => {
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(ev)
    }

    // Cron occurrences
    if (filterKind !== 'task') {
      for (const job of cronJobs) {
        if (!job.schedule) continue
        const occs = getCronOccurrences(job.schedule, rangeStart, rangeEnd, 500)
        for (const occ of occs) {
          add(occ.dayKey, {
            id: `cron-${job.name}-${occ.atMs}`,
            title: job.name,
            time: occ.atMs,
            dayKey: occ.dayKey,
            kind: 'cron',
            schedule: job.schedule,
            enabled: job.enabled,
            lastStatus: job.lastStatus,
          })
        }
      }
    }

    // Tasks with due dates
    if (filterKind !== 'cron') {
      for (const task of tasks) {
        if (!task.due_date) continue
        const dueMs = task.due_date * 1000
        if (dueMs < rangeStart || dueMs >= rangeEnd) continue
        const key = buildDayKey(new Date(dueMs))
        add(key, {
          id: `task-${task.id}`,
          title: task.title,
          dayKey: key,
          kind: 'task',
          status: task.status,
          priority: task.priority,
        })
      }
    }

    // Today events (for strip)
    const todayKey = buildDayKey(new Date())
    const todayEvs = map.get(todayKey) || []

    return { eventsByDay: map, todayEvents: todayEvs }
  }, [cronJobs, tasks, rangeStart, rangeEnd, filterKind])

  // Navigation
  function navPrev() {
    if (view === 'month') setAnchor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    else if (view === 'week') setAnchor(d => addDays(d, -7))
    else setAnchor(d => addDays(d, -30))
  }
  function navNext() {
    if (view === 'month') setAnchor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    else if (view === 'week') setAnchor(d => addDays(d, 7))
    else setAnchor(d => addDays(d, 30))
  }
  function navToday() {
    setAnchor(startOfDay(new Date()))
  }

  const weekDays = getWeekDays(anchor)
  const headerLabel = view === 'month'
    ? fmtMonthYear(anchor)
    : view === 'week'
    ? fmtWeekRange(weekDays)
    : `Next 30 days from ${anchor.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`

  // Stats
  const totalCronEvents = useMemo(() => {
    let n = 0
    for (const evs of eventsByDay.values()) n += evs.filter(e => e.kind === 'cron').length
    return n
  }, [eventsByDay])
  const totalTasksDue = useMemo(() => {
    let n = 0
    for (const evs of eventsByDay.values()) n += evs.filter(e => e.kind === 'task').length
    return n
  }, [eventsByDay])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0 flex-wrap gap-y-2">
        {/* Nav */}
        <button
          onClick={navToday}
          className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-secondary transition-colors"
        >
          Today
        </button>
        <div className="flex items-center">
          <button onClick={navPrev} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <button onClick={navNext} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
        </div>
        <span className="text-sm font-semibold text-foreground">{headerLabel}</span>

        <div className="flex-1" />

        {/* Stats */}
        {!loading && (
          <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              {totalCronEvents} cron runs
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {totalTasksDue} tasks due
            </span>
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden text-xs">
          {(['all', 'cron', 'task'] as const).map(k => (
            <button
              key={k}
              onClick={() => setFilterKind(k)}
              className={`px-2.5 py-1.5 transition-colors capitalize ${
                filterKind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {k === 'all' ? 'All' : k === 'cron' ? 'Cron' : 'Tasks'}
            </button>
          ))}
        </div>

        {/* View switcher */}
        <div className="flex items-center border border-border rounded-lg overflow-hidden text-xs">
          {(['month', 'week', 'agenda'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1.5 transition-colors capitalize ${
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <button onClick={load} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary" title="Refresh">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M13.5 8A5.5 5.5 0 112.5 5.5" />
            <path d="M2.5 2v3.5H6" />
          </svg>
        </button>
      </div>

      {/* Today strip */}
      <TodayStrip events={todayEvents} />

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Loading calendar…
          </div>
        </div>
      )}

      {/* Calendar body */}
      {!loading && view === 'month' && (
        <MonthView
          anchor={anchor}
          eventsByDay={eventsByDay}
          onDayClick={setSelectedDay}
          selectedDay={selectedDay}
        />
      )}
      {!loading && view === 'week' && (
        <WeekView
          anchor={anchor}
          eventsByDay={eventsByDay}
          onDayClick={setSelectedDay}
        />
      )}
      {!loading && view === 'agenda' && (
        <AgendaView
          anchor={anchor}
          eventsByDay={eventsByDay}
        />
      )}

      {/* Day detail modal */}
      {selectedDay && (
        <DayDetail
          date={selectedDay}
          events={eventsByDay.get(buildDayKey(selectedDay)) || []}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  )
}

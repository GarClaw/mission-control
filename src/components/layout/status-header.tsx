'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('StatusHeader')

interface NextJob {
  name: string
  nextRunAt: number
  schedule: string
}

interface StatusData {
  nextJob: NextJob | null
  pendingTasks: number
}

function timeUntil(ms: number): string {
  const now = Date.now()
  if (ms <= now) return 'now'

  const diff = Math.floor((ms - now) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function StatusHeader() {
  const [status, setStatus] = useState<StatusData>({ nextJob: null, pendingTasks: 0 })
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState<string>('')

  const loadStatus = useCallback(async () => {
    try {
      const [cronRes, tasksRes] = await Promise.all([
        fetch('/api/scheduler'),
        fetch('/api/tasks?status=inbox&status=assigned&limit=1'),
      ])

      let nextJob: NextJob | null = null
      let pendingTasks = 0

      if (cronRes.ok) {
        const cronData = await cronRes.json()
        nextJob = cronData.nextJob || null
      }

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json()
        pendingTasks = tasksData.count || 0
      }

      setStatus({ nextJob, pendingTasks })
    } catch (e) {
      log.error({ err: e }, 'Failed to load status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // Update countdown every second
  useEffect(() => {
    if (!status.nextJob) {
      setCountdown('')
      return
    }

    const interval = setInterval(() => {
      setCountdown(timeUntil(status.nextJob!.nextRunAt))
    }, 1000)

    // Set initial value
    setCountdown(timeUntil(status.nextJob.nextRunAt))

    return () => clearInterval(interval)
  }, [status.nextJob])

  if (loading || !status.nextJob) {
    return null
  }

  return (
    <div className="bg-primary/5 border-b border-primary/20 px-6 py-2.5 flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-6 flex-1 min-w-0">
        {/* Next job */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
          <span className="text-muted-foreground">Next:</span>
          <span className="font-medium text-foreground truncate">{status.nextJob.name}</span>
          <span className="text-muted-foreground">@</span>
          <span className="font-mono text-xs text-muted-foreground">{formatTime(status.nextJob.nextRunAt)}</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/20 text-primary whitespace-nowrap">
            in {countdown}
          </span>
        </div>

        {/* Pending tasks */}
        {status.pendingTasks > 0 && (
          <>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Pending:</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                {status.pendingTasks} task{status.pendingTasks !== 1 ? 's' : ''}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Refresh */}
      <button
        onClick={loadStatus}
        className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-secondary"
        title="Refresh"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-4 h-4">
          <path d="M13.5 8A5.5 5.5 0 112.5 5.5" />
          <path d="M2.5 2v3.5H6" />
        </svg>
      </button>
    </div>
  )
}

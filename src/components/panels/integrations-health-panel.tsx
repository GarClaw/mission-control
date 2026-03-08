'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClientLogger } from '@/lib/client-logger'

const log = createClientLogger('IntegrationsHealth')

type HealthStatus = 'healthy' | 'warning' | 'error' | 'unknown'

interface Integration {
  id: string
  name: string
  icon: string
  status: HealthStatus
  message?: string
  lastCheck?: number
  responseTime?: number
}

const INTEGRATIONS = [
  { id: 'tradier', name: 'Tradier API', icon: '📈' },
  { id: 'rallies', name: 'Rallies.ai', icon: '💼' },
  { id: 'home-assistant', name: 'Home Assistant', icon: '🏠' },
  { id: 'gmail', name: 'Gmail', icon: '📧' },
  { id: 'discord-tg', name: 'Discord → Telegram', icon: '💬' },
  { id: 'discord-bot', name: 'Discord Bot', icon: '🤖' },
]

function StatusBadge({ status }: { status: HealthStatus }) {
  const colors = {
    healthy: 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20',
    warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20',
    error: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20',
    unknown: 'bg-muted text-muted-foreground border-border',
  }
  const labels = {
    healthy: '✓ Healthy',
    warning: '⚠ Warning',
    error: '✕ Error',
    unknown: '? Unknown',
  }
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${colors[status]}`}>
      {labels[status]}
    </span>
  )
}

function IntegrationCard({ integration, loading }: { integration: Integration; loading: boolean }) {
  return (
    <div className="flex items-start justify-between p-4 rounded-lg border border-border bg-card hover:bg-secondary/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{integration.icon}</span>
          <h3 className="font-semibold text-foreground">{integration.name}</h3>
        </div>
        {integration.message && (
          <p className="text-xs text-muted-foreground line-clamp-2">{integration.message}</p>
        )}
        {integration.lastCheck && (
          <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
            <span>Last checked {relativeTime(integration.lastCheck)}</span>
            {integration.responseTime && (
              <span>· {integration.responseTime}ms</span>
            )}
          </div>
        )}
      </div>
      <div className="ml-3 shrink-0">
        {loading ? (
          <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" />
        ) : (
          <StatusBadge status={integration.status} />
        )}
      </div>
    </div>
  )
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function IntegrationsHealthPanel() {
  const [integrations, setIntegrations] = useState<Map<string, Integration>>(new Map())
  const [loading, setLoading] = useState(true)

  const checkHealth = useCallback(async () => {
    setLoading(true)
    const updated = new Map<string, Integration>()

    // Initialize all with unknown status
    for (const int of INTEGRATIONS) {
      updated.set(int.id, {
        ...int,
        status: 'unknown',
        lastCheck: Date.now(),
      })
    }
    setIntegrations(updated)

    // Check each integration
    const checks = INTEGRATIONS.map(async (int) => {
      try {
        const startTime = Date.now()
        const res = await fetch(`/api/health/integrations?check=${int.id}`, {
          signal: AbortSignal.timeout(10000),
        })
        const responseTime = Date.now() - startTime
        const data = await res.json()

        updated.set(int.id, {
          ...int,
          status: data.status || 'unknown',
          message: data.message,
          lastCheck: Date.now(),
          responseTime,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Check failed'
        updated.set(int.id, {
          ...int,
          status: 'error',
          message: msg,
          lastCheck: Date.now(),
        })
      }

      setIntegrations(new Map(updated))
    })

    await Promise.all(checks)
    setLoading(false)
  }, [])

  useEffect(() => {
    checkHealth()
    // Recheck every 5 minutes
    const interval = setInterval(checkHealth, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [checkHealth])

  const healthyCount = Array.from(integrations.values()).filter(
    (i) => i.status === 'healthy'
  ).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Integrations Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {healthyCount} of {integrations.size} operational
          </p>
        </div>
        <button
          onClick={checkHealth}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}>
            <path d="M13.5 8A5.5 5.5 0 112.5 5.5" />
            <path d="M2.5 2v3.5H6" />
          </svg>
          {loading ? 'Checking…' : 'Check Now'}
        </button>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="text-sm font-medium text-green-600 dark:text-green-400">
            Healthy: {Array.from(integrations.values()).filter((i) => i.status === 'healthy').length}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="text-sm font-medium text-amber-600 dark:text-amber-400">
            Warnings: {Array.from(integrations.values()).filter((i) => i.status === 'warning').length}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="text-sm font-medium text-red-600 dark:text-red-400">
            Errors: {Array.from(integrations.values()).filter((i) => i.status === 'error').length}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {INTEGRATIONS.map((int) => {
          const integration = integrations.get(int.id) || { ...int, status: 'unknown' as HealthStatus }
          return (
            <IntegrationCard
              key={int.id}
              integration={integration}
              loading={loading}
            />
          )
        })}
      </div>

      {/* Info */}
      <div className="mt-8 p-4 rounded-lg bg-muted/20 border border-border text-xs text-muted-foreground space-y-2">
        <p>
          <strong>Healthy:</strong> Integration is responding and configured correctly.
        </p>
        <p>
          <strong>Warning:</strong> Integration is responding but may have issues (rate limits, cache stale, etc).
        </p>
        <p>
          <strong>Error:</strong> Integration is unreachable or misconfigured. Check credentials in `pass` or service status.
        </p>
        <p className="pt-2 border-t border-border">
          Checks run automatically every 5 minutes. Click "Check Now" to run immediately.
        </p>
      </div>
    </div>
  )
}

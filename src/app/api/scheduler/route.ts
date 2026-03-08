import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getSchedulerStatus, triggerTask } from '@/lib/scheduler'
import { readFileSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { logger } from '@/lib/logger'

interface OpenClawCronJob {
  id: string
  name: string
  enabled: boolean
  schedule: {
    kind: string
    expr: string
    tz?: string
  }
  state?: {
    nextRunAtMs?: number
  }
}

/**
 * GET /api/scheduler - Get scheduler status + next OpenClaw cron job
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let nextJob = null

  try {
    const cronPath = join(homedir(), '.openclaw', 'cron', 'jobs.json')
    if (existsSync(cronPath)) {
      const content = readFileSync(cronPath, 'utf-8')
      const data = JSON.parse(content)
      
      // Find next enabled job
      let soonest: OpenClawCronJob | null = null
      let soonestTime = Infinity

      for (const job of data.jobs || []) {
        if (!job.enabled) continue
        const nextRunAt = job.state?.nextRunAtMs
        if (nextRunAt && nextRunAt < soonestTime) {
          soonest = job
          soonestTime = nextRunAt
        }
      }

      if (soonest && soonestTime < Infinity) {
        nextJob = {
          name: soonest.name,
          nextRunAt: soonestTime,
          schedule: soonest.schedule.expr,
        }
      }
    }
  } catch (e) {
    logger.warn({ err: e }, 'Failed to read cron jobs')
  }

  return NextResponse.json({ 
    tasks: getSchedulerStatus(),
    nextJob,
  })
}

/**
 * POST /api/scheduler - Manually trigger a scheduled task
 * Body: { task_id: 'auto_backup' | 'auto_cleanup' | 'agent_heartbeat' }
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'admin')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const taskId = typeof body?.task_id === 'string' ? body.task_id : ''
  const allowedTaskIds = new Set(getSchedulerStatus().map((task) => task.id))

  if (!taskId || !allowedTaskIds.has(taskId)) {
    return NextResponse.json({
      error: `task_id required: ${Array.from(allowedTaskIds).join(', ')}`,
    }, { status: 400 })
  }

  const result = await triggerTask(taskId)
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}

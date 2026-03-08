import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

type HealthStatus = 'healthy' | 'warning' | 'error' | 'unknown'

interface HealthCheckResult {
  status: HealthStatus
  message?: string
}

// Get credentials from pass (via env vars set by orchestration)
function getSecret(path: string): string | null {
  try {
    // Try reading from environment first (set by shell wrapper)
    const envKey = path.replace(/\//g, '_').toUpperCase()
    const val = process.env[envKey]
    if (val) return val

    // Otherwise, would need to shell out to `pass` which isn't available in Node
    return null
  } catch {
    return null
  }
}

async function checkTradier(): Promise<HealthCheckResult> {
  try {
    const token = process.env.TRADIER_API_TOKEN || getSecret('broker/tradier')
    if (!token) {
      return { status: 'error', message: 'No Tradier API token configured (set TRADIER_API_TOKEN in .env)' }
    }

    const res = await fetch('https://api.tradier.com/v1/accounts/6YA26900/balances', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })

    if (res.ok) {
      return { status: 'healthy', message: 'API responding' }
    }
    if (res.status === 401) {
      return { status: 'error', message: 'Authentication failed' }
    }
    return { status: 'warning', message: `HTTP ${res.status}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return { status: 'error', message: msg }
  }
}

async function checkRallies(): Promise<HealthCheckResult> {
  try {
    const res = await fetch('https://rallies.ai/home/portfolio', {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      return { status: 'healthy', message: 'Website accessible' }
    }
    return { status: 'warning', message: `HTTP ${res.status}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return { status: 'error', message: msg }
  }
}

async function checkHomeAssistant(): Promise<HealthCheckResult> {
  try {
    // Try Nabu Casa endpoint (used for external URL)
    const nabuUrl = process.env.HA_NABU_URL || 'https://dtxvovshca7bluhqiik2jjsfgz0yt2mj.ui.nabu.casa'
    const res = await fetch(`${nabuUrl}/api/`, {
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok || res.status === 401) {
      // 401 means HA is up but needs auth — still healthy
      return { status: 'healthy', message: 'Home Assistant reachable' }
    }
    return { status: 'warning', message: `HTTP ${res.status}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return { status: 'error', message: `Unreachable: ${msg}` }
  }
}

async function checkGmail(): Promise<HealthCheckResult> {
  try {
    const { stdout, stderr } = await execAsync(
      '/opt/homebrew/bin/gog gmail list --max-results=1 2>&1',
      { timeout: 8000 }
    )
    const output = stdout + stderr
    if (output.includes('error') || output.includes('Error') || output.includes('unauthorized')) {
      return { status: 'error', message: 'Auth failed — re-run gog auth' }
    }
    return { status: 'healthy', message: 'Gmail API authenticated' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return { status: 'warning', message: `Could not verify: ${msg.slice(0, 80)}` }
  }
}

async function checkDiscordTelegram(): Promise<HealthCheckResult> {
  try {
    // Check if discord monitor is running
    const processRunning = await checkProcessRunning('discord-monitor')
    if (processRunning) {
      return { status: 'healthy', message: 'Monitor process running' }
    }
    return { status: 'error', message: 'Monitor process not found' }
  } catch (e) {
    return { status: 'unknown', message: 'Cannot check process' }
  }
}

async function checkDiscordBot(): Promise<HealthCheckResult> {
  try {
    const token = process.env.DISCORD_BOT_TOKEN || getSecret('discord/bot-token')
    if (!token) {
      return { status: 'error', message: 'No bot token configured' }
    }
    // Verify with Discord API
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json() as { username?: string }
      return { status: 'healthy', message: `Bot online (${data.username ?? 'unknown'})` }
    }
    return { status: 'error', message: `Discord API returned ${res.status}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return { status: 'error', message: msg }
  }
}

async function checkProcessRunning(name: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`pgrep -f "${name}" 2>/dev/null || true`)
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const check = searchParams.get('check')

  let result: HealthCheckResult = { status: 'unknown' }

  try {
    switch (check) {
      case 'tradier':
        result = await checkTradier()
        break
      case 'rallies':
        result = await checkRallies()
        break
      case 'home-assistant':
        result = await checkHomeAssistant()
        break
      case 'gmail':
        result = await checkGmail()
        break
      case 'discord-tg':
        result = await checkDiscordTelegram()
        break
      case 'discord-bot':
        result = await checkDiscordBot()
        break
      default:
        return NextResponse.json({ error: 'Invalid check' }, { status: 400 })
    }
  } catch (e) {
    logger.error({ err: e }, `Health check failed: ${check}`)
    result = { status: 'error', message: 'Check failed' }
  }

  return NextResponse.json(result)
}

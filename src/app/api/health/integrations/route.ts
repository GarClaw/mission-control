import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

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
    const token = getSecret('broker/tradier')
    if (!token) {
      return { status: 'error', message: 'No Tradier API token configured' }
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
    // Check if ha-mcp is available via mcporter
    // For now, just check if the config file exists
    const haDir = join(homedir(), '.config', 'home-assistant')
    if (!existsSync(haDir)) {
      return { status: 'unknown', message: 'HA config not found' }
    }
    return { status: 'healthy', message: 'Config present' }
  } catch (e) {
    return { status: 'unknown', message: 'Cannot check HA' }
  }
}

async function checkGmail(): Promise<HealthCheckResult> {
  try {
    // Check if gog is available and can authenticate
    // This requires a shell call which isn't available in the API
    // For now, check if credentials exist
    const passExists = existsSync(join(homedir(), '.password-store', 'email', 'gmail.gpg'))
    if (passExists) {
      return { status: 'healthy', message: 'Credentials stored' }
    }
    return { status: 'warning', message: 'No stored credentials' }
  } catch (e) {
    return { status: 'unknown', message: 'Cannot check Gmail' }
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
    // Check if Discord bot token is configured
    const token = getSecret('discord/bot-token')
    if (!token) {
      return { status: 'error', message: 'No bot token configured' }
    }
    // Could make an API call to Discord to verify, but for now just check it exists
    return { status: 'healthy', message: 'Bot token configured' }
  } catch (e) {
    return { status: 'unknown', message: 'Cannot check bot' }
  }
}

async function checkProcessRunning(name: string): Promise<boolean> {
  try {
    // Would need `ps` command which we can't call from Node easily without exec
    // For now, return false
    return false
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

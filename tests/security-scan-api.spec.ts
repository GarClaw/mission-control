import { test, expect } from '@playwright/test'
import { API_KEY_HEADER } from './helpers'

test.describe('Security Scan API', () => {
  // ── Auth ─────────────────────────────────────

  test('GET /api/security-scan returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/security-scan')
    expect(res.status()).toBe(401)
  })

  // ── Response shape ───────────────────────────

  test('GET returns scan result with expected top-level fields', async ({ request }) => {
    const res = await request.get('/api/security-scan', { headers: API_KEY_HEADER })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('overall')
    expect(body).toHaveProperty('score')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('categories')
  })

  test('score is a number between 0 and 100', async ({ request }) => {
    const res = await request.get('/api/security-scan', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(typeof body.score).toBe('number')
    expect(body.score).toBeGreaterThanOrEqual(0)
    expect(body.score).toBeLessThanOrEqual(100)
  })

  test('overall is a valid severity level', async ({ request }) => {
    const res = await request.get('/api/security-scan', { headers: API_KEY_HEADER })
    const body = await res.json()
    expect(['hardened', 'secure', 'needs-attention', 'at-risk']).toContain(body.overall)
  })

  test('categories has all 5 required sections', async ({ request }) => {
    const res = await request.get('/api/security-scan', { headers: API_KEY_HEADER })
    const body = await res.json()
    const cats = body.categories
    expect(cats).toHaveProperty('credentials')
    expect(cats).toHaveProperty('network')
    expect(cats).toHaveProperty('openclaw')
    expect(cats).toHaveProperty('runtime')
    expect(cats).toHaveProperty('os')
  })

  test('each category has score and checks array', async ({ request }) => {
    const res = await request.get('/api/security-scan', { headers: API_KEY_HEADER })
    const body = await res.json()

    for (const [name, cat] of Object.entries(body.categories) as [string, any][]) {
      expect(typeof cat.score).toBe('number')
      expect(Array.isArray(cat.checks)).toBe(true)

      // Validate check shape
      for (const check of cat.checks) {
        expect(check).toHaveProperty('id')
        expect(check).toHaveProperty('name')
        expect(check).toHaveProperty('status')
        expect(check).toHaveProperty('detail')
        expect(check).toHaveProperty('fix')
        expect(['pass', 'fail', 'warn']).toContain(check.status)
      }
    }
  })
})

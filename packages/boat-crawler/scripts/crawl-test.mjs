#!/usr/bin/env node
/**
 * Test Cloudflare Browser Rendering /crawl endpoint.
 *
 * Token resolution (narduk / Doppler):
 * - Prefer CLOUDFLARE_CRAWL_TOKEN (must have "Browser Rendering - Edit" permission).
 * - Fallback: CLOUDFLARE_API_TOKEN_WORKERS (only works if that token has Browser Rendering - Edit).
 * - Token location: narduk-nuxt-template / prd (found via narduk-cli doppler search).
 * - Run with Doppler: npm run crawl:test:doppler
 * - Or set env: CLOUDFLARE_CRAWL_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 */

const CRAWL_BASE = (accountId) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/crawl`

function getEnv(name) {
  const v = process.env[name]
  if (v) return v.trim()
  return undefined
}

function getToken() {
  return getEnv('CLOUDFLARE_CRAWL_TOKEN') || getEnv('CLOUDFLARE_API_TOKEN_WORKERS')
}

function getAccountId() {
  return getEnv('CLOUDFLARE_ACCOUNT_ID')
}

async function startCrawl(url, token, accountId, limit = 2) {
  const res = await fetch(CRAWL_BASE(accountId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      limit,
      render: true,
      formats: ['markdown'],
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Crawl start failed: ${res.status} ${JSON.stringify(data)}`)
  }
  if (!data.success || !data.result) {
    throw new Error(`Crawl start unexpected response: ${JSON.stringify(data)}`)
  }
  return data.result
}

async function getCrawlStatus(jobId, token, accountId, limit = 1) {
  const url = `${CRAWL_BASE(accountId)}/${jobId}?limit=${limit}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Crawl status failed: ${res.status} ${JSON.stringify(data)}`)
  if (!data.success) throw new Error(`Crawl status: ${JSON.stringify(data)}`)
  return data.result
}

async function main() {
  const token = getToken()
  const accountId = getAccountId()
  if (!token || !accountId) {
    console.error('Missing credentials.')
    console.error(
      'Set CLOUDFLARE_CRAWL_TOKEN (or CLOUDFLARE_API_TOKEN_WORKERS) and CLOUDFLARE_ACCOUNT_ID',
    )
    console.error('Or run: npm run crawl:test:doppler')
    process.exit(1)
  }

  const testUrl =
    process.argv[2] || 'https://www.boats.com/boats-for-sale/?length=40-60&type=fishing'
  console.log('Starting crawl:', testUrl, '(limit=2)')

  let jobId
  try {
    jobId = await startCrawl(testUrl, token, accountId, 2)
    console.log('Job ID:', jobId)
  } catch (e) {
    if (
      e.message.includes('Browser Rendering') ||
      e.message.includes('10000') ||
      e.message.includes('permission')
    ) {
      console.error(
        'Token may not have "Browser Rendering - Edit". Create a custom API token at https://dash.cloudflare.com/profile/api-tokens with that permission and set CLOUDFLARE_CRAWL_TOKEN.',
      )
    }
    throw e
  }

  const delayMs = 5000
  const maxAttempts = 24
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs))
    const result = await getCrawlStatus(jobId, token, accountId, 1)
    const status = result.status
    console.log(
      `Poll ${i + 1}: status=${status} total=${result.total ?? '?'} finished=${result.finished ?? '?'} browserSecondsUsed=${result.browserSecondsUsed ?? '?'}`,
    )
    if (status !== 'running') {
      if (status === 'completed') {
        const full = await getCrawlStatus(jobId, token, accountId, 20)
        console.log('\nSample records:', full.records?.length ?? 0)
        ;(full.records || []).slice(0, 3).forEach((r, idx) => {
          console.log(`\n--- Record ${idx + 1}: ${r.url} (${r.status}) ---`)
          console.log((r.markdown || r.html || '').slice(0, 400) + '...')
        })
      } else {
        console.log('Terminal status:', status, result.error || '')
      }
      return
    }
  }
  console.error('Crawl did not complete within timeout')
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

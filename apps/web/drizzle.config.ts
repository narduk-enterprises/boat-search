import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

const configDir = dirname(fileURLToPath(import.meta.url))

function wranglerD1DatabaseId(): string {
  try {
    const raw = readFileSync(join(configDir, 'wrangler.json'), 'utf8')
    const parsed = JSON.parse(raw) as { d1_databases?: { database_id?: string }[] }
    return parsed.d1_databases?.[0]?.database_id?.trim() ?? ''
  } catch {
    return ''
  }
}

/** Remote D1 via HTTP API (Drizzle Studio, migrate, etc.). Override via Doppler or env. */
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? ''
const databaseId = process.env.CLOUDFLARE_DATABASE_ID?.trim() || wranglerD1DatabaseId()
const token =
  process.env.CLOUDFLARE_D1_TOKEN?.trim() || process.env.CLOUDFLARE_API_TOKEN?.trim() || ''

export default defineConfig({
  schema: './server/database/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId,
    databaseId,
    token,
  },
})

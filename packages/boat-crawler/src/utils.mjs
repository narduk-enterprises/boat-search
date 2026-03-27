import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

export function hashText(value) {
  return createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex')
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function jitter(baseMs, jitterMs) {
  if (jitterMs <= 0) {
    return baseMs
  }

  const delta = Math.floor(Math.random() * (jitterMs + 1))
  return baseMs + delta
}

export function normalizeWhitespace(value) {
  return value
    ? value
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : ''
}

export function excerpt(value, length = 280) {
  const normalized = normalizeWhitespace(value)
  if (!normalized) {
    return ''
  }

  return normalized.length > length ? `${normalized.slice(0, length - 1)}…` : normalized
}

export function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function readJsonFile(path, fallback = null) {
  if (!existsSync(path)) {
    return fallback
  }

  return safeJsonParse(readFileSync(path, 'utf8'), fallback)
}

export function writeJsonFile(path, value) {
  ensureDir(path.split('/').slice(0, -1).join('/'))
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function createTimestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}

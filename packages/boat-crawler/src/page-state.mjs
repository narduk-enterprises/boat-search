import { excerpt, normalizeWhitespace } from './utils.mjs'

export const PAGE_STATES = {
  OK: 'ok',
  NO_RESULTS: 'no_results',
  CONSENT_REQUIRED: 'consent_required',
  RATE_LIMITED: 'rate_limited',
  CHALLENGE_OR_BLOCK: 'challenge_or_block',
  AUTH_REQUIRED: 'auth_required',
  PARSER_CHANGED: 'parser_changed',
}

export const TERMINAL_SOURCE_STATES = new Set([
  PAGE_STATES.CONSENT_REQUIRED,
  PAGE_STATES.RATE_LIMITED,
  PAGE_STATES.CHALLENGE_OR_BLOCK,
  PAGE_STATES.AUTH_REQUIRED,
  PAGE_STATES.PARSER_CHANGED,
])

export function makePageState(state, extras = {}) {
  return {
    state,
    reason: extras.reason || null,
    summary: extras.summary || null,
    signal: extras.signal || null,
  }
}

export function isTerminalPageState(state) {
  return TERMINAL_SOURCE_STATES.has(state)
}

export function classifyGenericSignal(signal) {
  const title = (signal?.title || '').toLowerCase()
  const body = (signal?.bodyText || '').toLowerCase()
  const html = (signal?.html || '').toLowerCase()

  if (
    /access denied|attention required|just a moment|checking your browser|verify you are human|cf-chl|captcha|blocked/i.test(
      `${title}\n${body}\n${html}`,
    )
  ) {
    return makePageState(PAGE_STATES.CHALLENGE_OR_BLOCK, {
      summary: excerpt(signal?.bodyText || signal?.title),
      signal,
    })
  }

  if (
    /too many requests|rate limit|rate-limited|retry later|temporarily unavailable/i.test(
      `${title}\n${body}`,
    )
  ) {
    return makePageState(PAGE_STATES.RATE_LIMITED, {
      summary: excerpt(signal?.bodyText || signal?.title),
      signal,
    })
  }

  if (
    /sign in|log in|login required|member access|subscriber only|please sign in/i.test(
      `${title}\n${body}`,
    )
  ) {
    return makePageState(PAGE_STATES.AUTH_REQUIRED, {
      summary: excerpt(signal?.bodyText || signal?.title),
      signal,
    })
  }

  if (
    /accept all cookies|consent preferences|privacy choices/i.test(
      `${title}\n${body}`,
    )
  ) {
    return makePageState(PAGE_STATES.CONSENT_REQUIRED, {
      summary: excerpt(signal?.bodyText || signal?.title),
      signal,
    })
  }

  if (/no results|no listings|no boats match|0 results|nothing found/i.test(body)) {
    return makePageState(PAGE_STATES.NO_RESULTS, {
      summary: excerpt(signal?.bodyText || signal?.title),
      signal,
    })
  }

  return makePageState(PAGE_STATES.OK, { signal })
}

export async function readPageSignal(page) {
  const [title, html, bodyText] = await Promise.all([
    page.title().catch(() => ''),
    page.content().catch(() => ''),
    page
      .locator('body')
      .innerText()
      .catch(() => ''),
  ])

  return {
    title: normalizeWhitespace(title),
    html: html.slice(0, 20_000),
    bodyText: normalizeWhitespace(bodyText).slice(0, 8_000),
  }
}

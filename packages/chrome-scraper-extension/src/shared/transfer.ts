import type { ScraperPipelineDraft } from './types'

function toBase64Url(value: string) {
  return btoa(unescape(encodeURIComponent(value)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll(/=+$/g, '')
}

export function encodeDraftForTransfer(draft: ScraperPipelineDraft) {
  return toBase64Url(JSON.stringify(draft))
}

export function buildImportUrl(
  appBaseUrl: string,
  draft: ScraperPipelineDraft,
  options?: { autoRun?: boolean },
) {
  const base = appBaseUrl.replace(/\/+$/g, '')
  const url = new URL(`${base}/admin/scraper-pipeline`)
  url.searchParams.set('draft', encodeDraftForTransfer(draft))
  if (options?.autoRun) {
    url.searchParams.set('autorun', '1')
  }
  return url.toString()
}

export function hostToSourceName(hostname: string) {
  return hostname.replace(/^www\./, '')
}

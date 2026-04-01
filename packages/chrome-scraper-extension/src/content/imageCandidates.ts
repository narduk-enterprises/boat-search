/**
 * Pick the highest-resolution candidate from a responsive `srcset` / `data-srcset` string.
 * Entries with `NNNw` / `Nx` descriptors win by numeric size; if none have descriptors,
 * the last URL wins (many marketplaces list small → large).
 */
export function readLargestSrcsetUrl(value: string | null): string {
  if (!value?.trim()) return ''

  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  let bestUrl = ''
  /** -1 = unset; 0 = no descriptor (tie-break by index); else min pixel width / scaled density */
  let bestMetric = -1
  let bestIndex = -1

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const tokens = entry.split(/\s+/).filter(Boolean)
    const url = tokens[0] || ''
    if (!url) continue

    let metric = 0
    for (let t = 1; t < tokens.length; t++) {
      const token = tokens[t]!
      const widthMatch = /^(\d+)w$/i.exec(token)
      if (widthMatch) {
        metric = Math.max(metric, Number(widthMatch[1]))
        continue
      }
      const densityMatch = /^([\d.]+)x$/i.exec(token)
      if (densityMatch) {
        metric = Math.max(metric, Number(densityMatch[1]) * 10_000)
      }
    }

    const hasDescriptor = metric > 0
    const better =
      !bestUrl ||
      (hasDescriptor && (bestMetric <= 0 || metric > bestMetric)) ||
      (!hasDescriptor && bestMetric <= 0 && i > bestIndex)

    if (better) {
      bestUrl = url
      bestMetric = hasDescriptor ? metric : 0
      bestIndex = i
    }
  }

  return bestUrl
}

function isLikelyDirectImageUrl(value: string | null): value is string {
  if (!value?.trim()) return false

  try {
    const url = new URL(value, 'https://boat-search.local')
    if (!/^https?:$/i.test(url.protocol)) {
      return false
    }

    if (
      /\.(?:avif|bmp|gif|heic|heif|jpeg|jpg|png|tiff|webp)(?:$|[?#])/i.test(url.pathname) ||
      /(images?\.|cdn\.|img\.|media\.)/i.test(url.hostname)
    ) {
      return true
    }
  } catch {
    return false
  }

  return false
}

/** Prefer lazy-loaded / full URLs over the browser-selected `currentSrc` (often a thumbnail). */
export function readImageSource(target: HTMLImageElement): string {
  const linkedImageHref = (() => {
    const anchor = target.closest('a[href]')
    const href = anchor?.getAttribute('href') || ''
    return isLikelyDirectImageUrl(href) ? href : ''
  })()

  return (
    target.getAttribute('data-full') ||
    target.getAttribute('data-full-image') ||
    target.getAttribute('data-fullsrc') ||
    target.getAttribute('data-image-full') ||
    target.getAttribute('data-large') ||
    target.getAttribute('data-large-image') ||
    target.getAttribute('data-large-src') ||
    target.getAttribute('data-zoom-src') ||
    target.getAttribute('data-original-src') ||
    target.getAttribute('data-src') ||
    target.getAttribute('data-lazy-src') ||
    target.getAttribute('data-original') ||
    target.getAttribute('data-zoom-image') ||
    linkedImageHref ||
    readLargestSrcsetUrl(target.getAttribute('data-srcset')) ||
    readLargestSrcsetUrl(target.getAttribute('srcset')) ||
    target.currentSrc ||
    target.src ||
    ''
  )
}

import {
  analyzeDocument,
  extractDetailPageDocument,
  extractSearchPageDocument,
} from './analyzer'
import type {
  BackgroundMessage,
  ContentMessage,
  DetailPageExtractRequest,
  DetailPageExtractResponse,
  FieldPreviewRequest,
  FieldPreviewResult,
  PickerProgress,
  PickerRequest,
  PickerResult,
  ScraperFieldRule,
  SearchPageExtractRequest,
  SearchPageExtractResponse,
} from '../shared/types'

const DETAIL_LINK_PATTERN = /\/yacht\//i

type PickerState = {
  request: PickerRequest
  overlay: HTMLDivElement
  helper: HTMLDivElement
  selectedTargets: HTMLElement[]
  selectedOverlays: HTMLDivElement[]
  onMouseMove: (event: MouseEvent) => void
  onClick: (event: MouseEvent) => void
  onKeyDown: (event: KeyboardEvent) => void
  currentTarget: HTMLElement | null
}

type PreviewOverlay = {
  target: Element
  box: HTMLDivElement
  label: HTMLDivElement
}

type PreviewState = {
  container: HTMLDivElement
  legend: HTMLDivElement
  overlays: PreviewOverlay[]
  onScroll: () => void
  onResize: () => void
}

let pickerState: PickerState | null = null
let previewState: PreviewState | null = null

function normalizeText(value: string | null | undefined) {
  return (value || '').replaceAll(/\s+/g, ' ').trim()
}

function isExtensionContextInvalidated(error: unknown) {
  return error instanceof Error && /extension context invalidated/i.test(error.message)
}

function cleanupInvalidatedContext() {
  stopPicker()
  stopPreview()
}

function safelyRunWithLiveContext(run: () => void) {
  try {
    run()
  } catch (error: unknown) {
    if (isExtensionContextInvalidated(error)) {
      cleanupInvalidatedContext()
      return
    }

    throw error
  }
}

function isTransientClassName(className: string) {
  return /(?:^|[-_])(active|current|selected|visible|hidden|loading|loaded|enter|leave|appear|animat(?:e|ion)|fade|inview|lazy|focus|hover)(?:$|[-_])/i.test(
    className,
  )
}

function isGeneratedClassName(className: string) {
  return /(?:^style-module_|^css-|__[_a-zA-Z0-9-]{3,}|^kameleoon-)/i.test(className)
}

function getStableClasses(element: Element) {
  return [...element.classList].filter(
    (className) =>
      /^[a-zA-Z][\w-]{1,}$/i.test(className) &&
      !isTransientClassName(className) &&
      !isVariantClassName(className) &&
      !isGeneratedClassName(className),
  )
}

function stripTransientClassesFromSelector(selector: string) {
  return selector.replace(/\.(-?[_a-zA-Z]+[_a-zA-Z0-9-]*)/g, (fullMatch, className: string) => {
    return isTransientClassName(className) ? '' : fullMatch
  })
}

function isVariantClassName(className: string) {
  return /(?:^|[-_])(featured|sponsored|stock|arrival|drop|premium|highlight|hero|primary|secondary|promo)(?:$|[-_])/i.test(
    className,
  )
}

function getDocumentSelectorCount(selector: string) {
  return queryAll(document, selector).length
}

function rankReusableClasses(element: Element) {
  return getStableClasses(element)
    .filter((className) => !isVariantClassName(className))
    .map((className) => ({
      className,
      count: getDocumentSelectorCount(`${element.tagName.toLowerCase()}.${CSS.escape(className)}`),
    }))
    .filter(({ count }) => count >= 2 && count <= 160)
    .sort((left, right) => {
      const leftDistance = Math.abs(left.count - getUniqueDetailHrefCount(document))
      const rightDistance = Math.abs(right.count - getUniqueDetailHrefCount(document))
      return leftDistance - rightDistance
    })
}

function buildReusableSelector(element: Element) {
  const dataTestId = element.getAttribute('data-testid')
  if (dataTestId) {
    return `${element.tagName.toLowerCase()}[data-testid="${CSS.escape(dataTestId)}"]`
  }

  const rankedClasses = rankReusableClasses(element)
  if (rankedClasses.length) {
    return `${element.tagName.toLowerCase()}.${CSS.escape(rankedClasses[0]!.className)}`
  }

  const role = element.getAttribute('role')
  if (role) {
    return `${element.tagName.toLowerCase()}[role="${CSS.escape(role)}"]`
  }

  return element.tagName.toLowerCase()
}

function buildReusableSelectorCandidates(element: Element) {
  const tag = element.tagName.toLowerCase()
  const candidates = new Set<string>()

  const dataTestId = element.getAttribute('data-testid')
  if (dataTestId) {
    candidates.add(`${tag}[data-testid="${CSS.escape(dataTestId)}"]`)
  }

  for (const { className } of rankReusableClasses(element).slice(0, 3)) {
    candidates.add(`${tag}.${CSS.escape(className)}`)
  }

  const classes = rankReusableClasses(element)
    .slice(0, 2)
    .map(({ className }) => className)

  if (classes.length > 1) {
    candidates.add(`${tag}.${classes.map((name) => CSS.escape(name)).join('.')}`)
  }

  const role = element.getAttribute('role')
  if (role) {
    candidates.add(`${tag}[role="${CSS.escape(role)}"]`)
  }

  candidates.add(tag)
  return [...candidates]
}

function buildSelectorPart(element: Element) {
  const tag = element.tagName.toLowerCase()

  if (element.id && !/\d{3,}/.test(element.id)) {
    return `${tag}#${CSS.escape(element.id)}`
  }

  if (element instanceof HTMLMetaElement && element.name) {
    return `${tag}[name="${CSS.escape(element.name)}"]`
  }

  const dataTestId = element.getAttribute('data-testid')
  if (dataTestId) {
    return `${tag}[data-testid="${CSS.escape(dataTestId)}"]`
  }

  const classes = getStableClasses(element).slice(0, 2)
  if (classes.length) {
    return `${tag}.${classes.map((name) => CSS.escape(name)).join('.')}`
  }

  const siblings = element.parentElement
    ? [...element.parentElement.children].filter((child) => child.tagName === element.tagName)
    : []
  if (siblings.length <= 1) return tag

  const index = siblings.indexOf(element) + 1
  return `${tag}:nth-of-type(${index})`
}

function buildAbsoluteSelector(element: Element) {
  const parts: string[] = []
  let current: Element | null = element

  while (current && current !== document.body && current !== document.documentElement) {
    const part = buildSelectorPart(current)
    parts.unshift(part)
    const selector = parts.join(' > ')

    try {
      if (document.querySelectorAll(selector).length === 1) {
        return selector
      }
    } catch {
      // Keep walking up to a safer selector.
    }

    current = current.parentElement
  }

  return parts.join(' > ')
}

function buildRelativeSelector(element: Element, root: Element) {
  if (element === root) return ':root'

  const parts: string[] = []
  let current: Element | null = element

  while (current && current !== root) {
    parts.unshift(buildSelectorPart(current))
    current = current.parentElement
  }

  return parts.join(' > ')
}

function queryAll<T extends Element = Element>(root: ParentNode, selector: string) {
  try {
    return [...root.querySelectorAll<T>(selector)]
  } catch {
    return []
  }
}

function queryRelativeMatches(root: Element, selector: string) {
  if (!selector.trim()) return []
  if (selector === ':root') return [root]

  const directMatches = queryAll(root, selector)
  const sanitizedSelector = stripTransientClassesFromSelector(selector)
  if (sanitizedSelector === selector) {
    return directMatches
  }

  const sanitizedMatches = queryAll(root, sanitizedSelector)
  return sanitizedMatches.length > directMatches.length ? sanitizedMatches : directMatches
}

function isVisible(element: Element) {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function readFirstSrcsetUrl(value: string | null) {
  return (
    value
      ?.split(',')
      .map((entry) => entry.trim().split(/\s+/)[0] || '')
      .find(Boolean) || ''
  )
}

function readImageSource(target: HTMLImageElement) {
  return (
    target.currentSrc ||
    target.src ||
    target.getAttribute('data-src') ||
    target.getAttribute('data-lazy-src') ||
    target.getAttribute('data-original') ||
    target.getAttribute('data-zoom-image') ||
    readFirstSrcsetUrl(target.getAttribute('data-srcset')) ||
    readFirstSrcsetUrl(target.getAttribute('srcset')) ||
    ''
  )
}

function formatFieldKey(key: ScraperFieldRule['key']) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase())
}

function readAttributeValue(target: Element, attribute: string) {
  if (!attribute) return ''
  if (attribute === 'href' && target instanceof HTMLAnchorElement) return target.href
  if (attribute === 'src' && target instanceof HTMLImageElement) return readImageSource(target)
  return target.getAttribute(attribute) || ''
}

function applyRegex(value: string, pattern: string) {
  if (!pattern.trim()) {
    return value
  }

  try {
    const match = value.match(new RegExp(pattern, 'i'))
    if (!match) {
      return null
    }

    return normalizeText(match[1] || match[0] || '')
  } catch {
    return value
  }
}

function toAbsoluteUrl(value: string, baseUrl: string) {
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return null
  }
}

function applyFieldTransform(value: string, field: ScraperFieldRule, baseUrl: string) {
  const withRegex = applyRegex(value, field.regex)
  if (!withRegex) {
    return null
  }

  switch (field.transform) {
    case 'price': {
      const priceToken =
        withRegex.match(/(?:US|C|CA)?\$\s*[\d,.]+|€\s*[\d,.]+|£\s*[\d,.]+/i)?.[0] ||
        withRegex.match(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/)?.[0] ||
        ''
      const digits = priceToken.replaceAll(/\D/g, '')
      return digits || null
    }
    case 'year': {
      const match = withRegex.match(/\b(19|20)\d{2}\b/)
      return match?.[0] || null
    }
    case 'integer': {
      const match = withRegex.match(/\d+/)
      return match?.[0] || null
    }
    case 'url':
      return toAbsoluteUrl(withRegex, baseUrl)
    case 'text':
    default:
      return normalizeText(withRegex)
  }
}

function extractFieldValue(target: Element, field: ScraperFieldRule, baseUrl = window.location.href) {
  const rawValue =
    field.extract === 'attr'
      ? readAttributeValue(target, field.attribute)
      : field.extract === 'html'
        ? target.innerHTML
        : target.textContent || ''

  const normalizedValue = normalizeText(
    field.extract === 'html' ? rawValue.replace(/<[^>]+>/g, ' ') : rawValue,
  )
  return applyFieldTransform(normalizedValue, field, baseUrl)
}

function resolveFieldMatches({ field, itemSelector }: FieldPreviewRequest) {
  const selector = field.selector.trim()
  if (!selector) return []

  if (field.scope === 'item' && itemSelector.trim()) {
    const itemRoots = queryAll<HTMLElement>(document, itemSelector)
    if (itemRoots.length) {
      return itemRoots.flatMap((root) => queryRelativeMatches(root, selector))
    }
  }

  return queryRelativeMatches(document.documentElement, selector)
}

function extractSearchPage(request: SearchPageExtractRequest): SearchPageExtractResponse {
  return extractSearchPageDocument(document, window.location.href, request)
}

function extractDetailPage(request: DetailPageExtractRequest): DetailPageExtractResponse {
  return extractDetailPageDocument(document, window.location.href, request)
}

function refreshPreviewLayout() {
  if (!previewState) return

  const visibleOverlays = previewState.overlays.filter(({ target, box, label }, index) => {
    const rect = target.getBoundingClientRect()
    const shouldShow = rect.width > 0 && rect.height > 0
    box.style.display = shouldShow ? 'block' : 'none'
    label.style.display = shouldShow ? 'flex' : 'none'

    if (!shouldShow) {
      return false
    }

    box.style.top = `${rect.top}px`
    box.style.left = `${rect.left}px`
    box.style.width = `${rect.width}px`
    box.style.height = `${rect.height}px`

    label.style.top = `${Math.max(rect.top - 16, 8)}px`
    label.style.left = `${Math.max(rect.left + Math.min(index * 12, 40), 8)}px`
    return true
  })

  previewState.legend.style.display = visibleOverlays.length ? 'flex' : 'none'
}

function stopPreview() {
  if (!previewState) return

  window.removeEventListener('scroll', previewState.onScroll, true)
  window.removeEventListener('resize', previewState.onResize, true)
  previewState.container.remove()
  previewState = null
}

function previewField(request: FieldPreviewRequest): FieldPreviewResult {
  stopPreview()

  const uniqueMatches = [...new Set(resolveFieldMatches(request))]
  const sampleValues = uniqueMatches
    .map((target) => extractFieldValue(target, request.field))
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)

  const highlightLimit = request.mode === 'itemSelector' ? 24 : 6
  const highlightedMatches = uniqueMatches.filter(isVisible).slice(0, highlightLimit)
  if (!highlightedMatches.length) {
    return {
      selector: request.field.selector,
      matchCount: uniqueMatches.length,
      highlightedCount: 0,
      sampleValues,
    }
  }

  const previewColor =
    request.mode === 'itemSelector'
      ? { border: '#7c3aed', fill: 'rgba(124, 58, 237, 0.12)', badge: '#4c1d95' }
      : request.field.scope === 'detail'
      ? { border: '#059669', fill: 'rgba(5, 150, 105, 0.16)', badge: '#064e3b' }
      : { border: '#0284c7', fill: 'rgba(2, 132, 199, 0.15)', badge: '#0f172a' }

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.inset = '0'
  container.style.zIndex = '2147483646'
  container.style.pointerEvents = 'none'

  const overlays = highlightedMatches.map((target, index) => {
    const box = document.createElement('div')
    box.style.position = 'fixed'
    box.style.border = `2px solid ${previewColor.border}`
    box.style.background = previewColor.fill
    box.style.borderRadius = '14px'
    box.style.boxShadow = '0 18px 36px rgba(15, 23, 42, 0.18)'
    box.style.display = 'none'

    const label = document.createElement('div')
    label.textContent =
      request.mode === 'itemSelector'
        ? `Card ${index + 1}`
        : `${formatFieldKey(request.field.key)} ${index + 1}`
    label.style.position = 'fixed'
    label.style.display = 'none'
    label.style.alignItems = 'center'
    label.style.height = '28px'
    label.style.padding = '0 10px'
    label.style.borderRadius = '999px'
    label.style.background = previewColor.badge
    label.style.color = '#f8fafc'
    label.style.fontSize = '12px'
    label.style.fontWeight = '700'
    label.style.letterSpacing = '0.02em'
    label.style.boxShadow = '0 10px 20px rgba(15, 23, 42, 0.16)'

    container.append(box, label)
    return { target, box, label }
  })

  const legend = document.createElement('div')
  const legendPrefix =
    request.mode === 'itemSelector'
      ? 'Listing cards'
      : `${request.field.scope === 'detail' ? 'Detail' : 'Search'} field · ${formatFieldKey(request.field.key)}`
  const visibleSuffix =
    highlightedMatches.length < uniqueMatches.length
      ? ` · showing ${highlightedMatches.length} visible now`
      : ''
  legend.textContent = `${legendPrefix} · ${uniqueMatches.length} match${uniqueMatches.length === 1 ? '' : 'es'}${visibleSuffix}`
  legend.style.position = 'fixed'
  legend.style.left = '16px'
  legend.style.bottom = '16px'
  legend.style.display = 'none'
  legend.style.alignItems = 'center'
  legend.style.minHeight = '40px'
  legend.style.padding = '0 14px'
  legend.style.borderRadius = '999px'
  legend.style.background = 'rgba(15, 23, 42, 0.9)'
  legend.style.color = '#f8fafc'
  legend.style.fontSize = '13px'
  legend.style.fontWeight = '700'
  legend.style.boxShadow = '0 16px 32px rgba(15, 23, 42, 0.2)'
  container.append(legend)

  const onScroll = () => {
    refreshPreviewLayout()
  }

  const onResize = () => {
    refreshPreviewLayout()
  }

  previewState = {
    container,
    legend,
    overlays,
    onScroll,
    onResize,
  }

  document.body.append(container)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', onResize, true)
  refreshPreviewLayout()

  return {
    selector: request.field.selector,
    matchCount: uniqueMatches.length,
    highlightedCount: highlightedMatches.length,
    sampleValues,
  }
}

function getDetailAnchors(root: ParentNode = document) {
  return queryAll<HTMLAnchorElement>(root, 'a[href]').filter(
    (anchor) => Boolean(anchor.href) && DETAIL_LINK_PATTERN.test(anchor.href),
  )
}

function getUniqueDetailHrefCount(root: ParentNode = document) {
  return new Set(getDetailAnchors(root).map((anchor) => anchor.href)).size
}

function analyzeCurrentPage() {
  return analyzeDocument(document, window.location.href)
}

function inferPickerSelection(target: HTMLElement, request: PickerRequest): PickerResult {
  if (request.kind === 'nextPageSelector') {
    return {
      kind: request.kind,
      selector: buildAbsoluteSelector(target),
      extract: 'attr',
      attribute: 'href',
      sampleValue: target.getAttribute('href') || normalizeText(target.textContent),
    }
  }

  const itemRoot =
    request.scope === 'item' && request.itemSelector ? target.closest(request.itemSelector) : null
  const selector = itemRoot ? buildRelativeSelector(target, itemRoot) : buildAbsoluteSelector(target)
  const tagName = target.tagName.toLowerCase()
  const isAttributePick =
    request.fieldKey === 'url' ||
    request.fieldKey === 'images' ||
    tagName === 'a' ||
    tagName === 'img' ||
    tagName === 'meta'
  const attribute =
    request.fieldKey === 'images' || tagName === 'img'
      ? 'src'
      : request.fieldKey === 'url' || tagName === 'a'
        ? 'href'
        : tagName === 'meta'
          ? 'content'
          : ''

  return {
    kind: request.kind,
    fieldKey: request.fieldKey,
    scope: request.scope,
    selector,
    extract: isAttributePick ? 'attr' : 'text',
    attribute,
    sampleValue: normalizeText(
      isAttributePick ? target.getAttribute(attribute) || '' : target.textContent || '',
    ).slice(0, 160),
  }
}

function findClosestRepeatableAncestor(target: HTMLElement) {
  let current: HTMLElement | null = target

  for (let depth = 0; current && current !== document.body && depth < 6; depth += 1) {
    for (const selector of buildReusableSelectorCandidates(current)) {
      const matches = queryAll(document, selector)
      if (matches.length >= 3 && matches.length <= 80) {
        return current
      }
    }
    current = current.parentElement
  }

  return null
}

function findBestItemCardCandidate(target: HTMLElement) {
  let current: HTMLElement | null = target
  let bestCandidate: { element: HTMLElement; score: number } | null = null

  for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
    const uniqueDetailHrefCount = getUniqueDetailHrefCount(current)
    const imageCount = queryAll(current, 'img[src]').length
    const textLength = normalizeText(current.textContent).length

    for (const selector of buildReusableSelectorCandidates(current)) {
      const matches = queryAll<HTMLElement>(document, selector)
      const plausibleMatchCount = matches.length >= 3 && matches.length <= 120

      if (plausibleMatchCount && uniqueDetailHrefCount > 0 && uniqueDetailHrefCount <= 2) {
        const totalUniqueListings = Math.max(getUniqueDetailHrefCount(document), matches.length)
        const countDistance = Math.abs(matches.length - totalUniqueListings)
        const countScore = Math.max(0, 120 - countDistance * 5)
        const score =
          countScore +
          (uniqueDetailHrefCount === 1 ? 90 : 20) +
          imageCount * 8 +
          Math.min(textLength, 400) / 10 -
          depth * 8 -
          selector.length / 10

        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = { element: current, score }
        }
      }
    }

    current = current.parentElement
  }

  return bestCandidate?.element || findClosestRepeatableAncestor(target) || target
}

function scoreItemSelector(selector: string, examples: HTMLElement[]) {
  const matches = queryAll<HTMLElement>(document, selector)
  if (matches.length < 3 || matches.length > 120) {
    return null
  }

  const uniqueHrefCounts = matches.map((match) => getUniqueDetailHrefCount(match))
  const averageUniqueHrefs =
    uniqueHrefCounts.reduce((total, count) => total + count, 0) / uniqueHrefCounts.length
  if (!averageUniqueHrefs || averageUniqueHrefs > 2.2) {
    return null
  }

  const coverageCount = examples.filter((example) =>
    matches.some((match) => match === example || match.contains(example)),
  ).length

  if (!coverageCount) {
    return null
  }

  const totalUniqueListings = Math.max(getUniqueDetailHrefCount(document), matches.length)
  const countDistance = Math.abs(matches.length - totalUniqueListings)
  const countScore = Math.max(0, 120 - countDistance * 5)
  const mediaRichMatches = matches.filter((element) => queryAll(element, 'img[src]').length > 0).length
  const score =
    coverageCount * 100 +
    countScore +
    mediaRichMatches * 4 -
    averageUniqueHrefs * 24 -
    selector.length / 10

  return {
    selector,
    matches,
    matchCount: matches.length,
    coverageCount,
    score,
  }
}

function inferItemSelectorFromExamples(examples: HTMLElement[]) {
  const candidates = new Map<
    string,
    NonNullable<ReturnType<typeof scoreItemSelector>>
  >()

  for (const example of examples) {
    let current: HTMLElement | null = example
    for (let depth = 0; current && current !== document.body && depth < 7; depth += 1) {
      for (const selector of buildReusableSelectorCandidates(current)) {
        const scoredCandidate = scoreItemSelector(selector, examples)
        if (scoredCandidate) {
          const existingCandidate = candidates.get(selector)
          if (!existingCandidate || scoredCandidate.score > existingCandidate.score) {
            candidates.set(selector, scoredCandidate)
          }
        }
      }
      current = current.parentElement
    }
  }

  return [...candidates.values()].sort((left, right) => right.score - left.score)[0] || null
}

function positionOverlay(overlay: HTMLDivElement, target: HTMLElement, label: string, color: string) {
  const rect = target.getBoundingClientRect()
  overlay.style.position = 'absolute'
  overlay.style.zIndex = '2147483646'
  overlay.style.pointerEvents = 'none'
  overlay.style.border = `2px solid ${color}`
  overlay.style.background = color === '#0ea5e9' ? 'rgba(14, 165, 233, 0.15)' : 'rgba(15, 23, 42, 0.12)'
  overlay.style.borderRadius = '14px'
  overlay.style.display = 'block'
  overlay.style.top = `${rect.top + window.scrollY}px`
  overlay.style.left = `${rect.left + window.scrollX}px`
  overlay.style.width = `${rect.width}px`
  overlay.style.height = `${rect.height}px`
  overlay.dataset.label = label

  let badge = overlay.querySelector<HTMLDivElement>('[data-picker-badge]')
  if (!badge) {
    badge = document.createElement('div')
    badge.dataset.pickerBadge = 'true'
    badge.style.position = 'absolute'
    badge.style.top = '-14px'
    badge.style.left = '10px'
    badge.style.height = '28px'
    badge.style.padding = '0 10px'
    badge.style.borderRadius = '999px'
    badge.style.display = 'inline-flex'
    badge.style.alignItems = 'center'
    badge.style.background = '#0f172a'
    badge.style.color = '#f8fafc'
    badge.style.fontSize = '12px'
    badge.style.fontWeight = '700'
    badge.style.letterSpacing = '0.02em'
    overlay.append(badge)
  }

  badge.textContent = label
}

function updateOverlay(target: HTMLElement | null) {
  if (!pickerState) return

  const rect = target?.getBoundingClientRect()
  pickerState.overlay.style.display = rect ? 'block' : 'none'
  if (!rect) return

  pickerState.overlay.style.top = `${rect.top + window.scrollY}px`
  pickerState.overlay.style.left = `${rect.left + window.scrollX}px`
  pickerState.overlay.style.width = `${rect.width}px`
  pickerState.overlay.style.height = `${rect.height}px`
}

function updatePickerHelper(message: string) {
  if (!pickerState) return
  pickerState.helper.textContent = message
}

function sendPickerProgress(progress: PickerProgress) {
  safelyRunWithLiveContext(() => {
    chrome.runtime.sendMessage({
      type: 'EXTENSION_PICKER_PROGRESS',
      progress,
    } satisfies BackgroundMessage)
  })
}

function addSelectedTarget(target: HTMLElement) {
  if (!pickerState) return false

  if (pickerState.selectedTargets.includes(target)) {
    updatePickerHelper('That example is already selected. Click a different listing card.')
    return false
  }

  pickerState.selectedTargets.push(target)
  const selectionOverlay = document.createElement('div')
  positionOverlay(
    selectionOverlay,
    target,
    `Example ${pickerState.selectedTargets.length}`,
    '#0f172a',
  )
  document.body.append(selectionOverlay)
  pickerState.selectedOverlays.push(selectionOverlay)
  return true
}

function stopPicker() {
  if (!pickerState) return

  document.removeEventListener('mousemove', pickerState.onMouseMove, true)
  document.removeEventListener('click', pickerState.onClick, true)
  document.removeEventListener('keydown', pickerState.onKeyDown, true)
  pickerState.overlay.remove()
  pickerState.helper.remove()
  for (const overlay of pickerState.selectedOverlays) {
    overlay.remove()
  }
  document.documentElement.style.cursor = ''
  pickerState = null
}

function startPicker(request: PickerRequest) {
  stopPicker()
  stopPreview()

  const overlay = document.createElement('div')
  overlay.style.position = 'absolute'
  overlay.style.zIndex = '2147483647'
  overlay.style.border = '2px solid #0ea5e9'
  overlay.style.background = 'rgba(14, 165, 233, 0.15)'
  overlay.style.pointerEvents = 'none'
  overlay.style.display = 'none'
  document.body.append(overlay)
  document.documentElement.style.cursor = 'crosshair'

  const helper = document.createElement('div')
  helper.style.position = 'fixed'
  helper.style.left = '16px'
  helper.style.bottom = '16px'
  helper.style.zIndex = '2147483647'
  helper.style.maxWidth = 'min(32rem, calc(100vw - 32px))'
  helper.style.padding = '0.85rem 1rem'
  helper.style.borderRadius = '1rem'
  helper.style.background = 'rgba(15, 23, 42, 0.94)'
  helper.style.color = '#f8fafc'
  helper.style.fontSize = '13px'
  helper.style.fontWeight = '600'
  helper.style.lineHeight = '1.45'
  helper.style.boxShadow = '0 18px 36px rgba(15, 23, 42, 0.22)'
  helper.style.pointerEvents = 'none'
  document.body.append(helper)

  if (request.kind === 'itemSelector') {
    helper.textContent = 'Click listing cards to add examples. Use cards from different rows. Press Enter to save once the detected-card count looks right, Backspace to undo the last one, or Escape to cancel.'
  } else {
    helper.textContent = 'Click the exact element you want to map.'
  }

  const onMouseMove = (event: MouseEvent) => {
    safelyRunWithLiveContext(() => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (!pickerState) return
      pickerState.currentTarget = target
      updateOverlay(target)
    })
  }

  const onClick = (event: MouseEvent) => {
    safelyRunWithLiveContext(() => {
      event.preventDefault()
      event.stopPropagation()

      const target = event.target instanceof HTMLElement ? event.target : null
      if (!target) {
        stopPicker()
        return
      }

      if (request.kind === 'itemSelector') {
        const selectedElement = findBestItemCardCandidate(target)
        if (!addSelectedTarget(selectedElement)) {
          return
        }

        const selectedExamples = pickerState?.selectedTargets || []
        const inferredSelector = inferItemSelectorFromExamples(selectedExamples)
        const resolvedSelector = inferredSelector?.selector || buildReusableSelector(selectedElement)
        const matchCount = inferredSelector?.matchCount || queryAll(document, resolvedSelector).length
        const ready = selectedExamples.length >= 2

        sendPickerProgress({
          kind: request.kind,
          selectionCount: selectedExamples.length,
          selector: resolvedSelector,
          matchCount,
          ready,
        })

        updatePickerHelper(
          ready
            ? `${selectedExamples.length} examples selected. Current selector matches ${matchCount} cards. Press Enter to save, click more cards to refine, Backspace to undo, or Escape to cancel.`
            : `${selectedExamples.length} example selected. Click at least one more listing card so the helper can compare them.`,
        )
        return
      }

      const result = inferPickerSelection(target, request)
      chrome.runtime.sendMessage({
        type: 'EXTENSION_PICKER_RESULT',
        result,
      } satisfies BackgroundMessage)
      stopPicker()
    })
  }

  const onKeyDown = (event: KeyboardEvent) => {
    safelyRunWithLiveContext(() => {
      if (!pickerState) return

      if (event.key === 'Escape') {
        event.preventDefault()
        chrome.runtime.sendMessage({
          type: 'EXTENSION_PICKER_CANCELLED',
          kind: request.kind,
        } satisfies BackgroundMessage)
        stopPicker()
        return
      }

      if (request.kind !== 'itemSelector') {
        return
      }

      if (event.key === 'Backspace') {
        if (!pickerState.selectedTargets.length) {
          return
        }

        event.preventDefault()
        pickerState.selectedTargets.pop()
        pickerState.selectedOverlays.pop()?.remove()

        if (!pickerState.selectedTargets.length) {
          updatePickerHelper(
            'Selection cleared. Click listing cards to add examples. Press Escape to cancel.',
          )
          sendPickerProgress({
            kind: request.kind,
            selectionCount: 0,
            selector: '',
            matchCount: 0,
            ready: false,
          })
          return
        }

        const inferredSelector = inferItemSelectorFromExamples(pickerState.selectedTargets)
        const selector =
          inferredSelector?.selector ||
          buildReusableSelector(pickerState.selectedTargets[pickerState.selectedTargets.length - 1]!)
        const matchCount = inferredSelector?.matchCount || queryAll(document, selector).length
        const ready = pickerState.selectedTargets.length >= 2

        sendPickerProgress({
          kind: request.kind,
          selectionCount: pickerState.selectedTargets.length,
          selector,
          matchCount,
          ready,
        })
        updatePickerHelper(
          ready
            ? `${pickerState.selectedTargets.length} examples selected. Current selector matches ${matchCount} cards. Press Enter to save or click more cards to refine.`
            : `${pickerState.selectedTargets.length} example selected. Click one more listing card so the helper can compare them.`,
        )
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()

        if (pickerState.selectedTargets.length < 2) {
          updatePickerHelper(
            'Choose at least two listing cards before saving this selector.',
          )
          return
        }

        const inferredSelector = inferItemSelectorFromExamples(pickerState.selectedTargets)
        const selector =
          inferredSelector?.selector ||
          buildReusableSelector(pickerState.selectedTargets[pickerState.selectedTargets.length - 1]!)
        const matchCount = inferredSelector?.matchCount || queryAll(document, selector).length

        chrome.runtime.sendMessage({
          type: 'EXTENSION_PICKER_RESULT',
          result: {
            kind: request.kind,
            selector,
            extract: 'text',
            attribute: '',
            sampleValue: normalizeText(pickerState.selectedTargets[0]?.textContent).slice(0, 120),
            selectionCount: pickerState.selectedTargets.length,
            matchCount,
          },
        } satisfies BackgroundMessage)
        stopPicker()
      }
    })
  }

  pickerState = {
    request,
    overlay,
    helper,
    selectedTargets: [],
    selectedOverlays: [],
    onMouseMove,
    onClick,
    onKeyDown,
    currentTarget: null,
  }

  document.addEventListener('mousemove', onMouseMove, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKeyDown, true)
}

chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
  if (message.type === 'EXTENSION_STOP_PICKER') {
    stopPicker()
    sendResponse({ ok: true })
    return false
  }

  if (message.type === 'EXTENSION_CLEAR_PREVIEW') {
    stopPreview()
    sendResponse({ ok: true })
    return false
  }

  if (message.type === 'EXTENSION_PREVIEW_FIELD') {
    sendResponse(previewField(message.preview))
    return false
  }

  if (message.type === 'EXTENSION_EXTRACT_SEARCH_PAGE') {
    sendResponse(extractSearchPage(message.request))
    return false
  }

  if (message.type === 'EXTENSION_EXTRACT_DETAIL_PAGE') {
    sendResponse(extractDetailPage(message.request))
    return false
  }

  if (message.type === 'EXTENSION_START_PICKER') {
    startPicker(message.picker)
    sendResponse({ ok: true })
    return false
  }

  if (message.type === 'EXTENSION_ANALYZE_PAGE') {
    sendResponse(analyzeCurrentPage())
    return false
  }

  return false
})

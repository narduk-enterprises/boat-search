import { createFieldRule } from '../shared/defaults'
import { hostToSourceName } from '../shared/transfer'
import type {
  AutoDetectedAnalysis,
  BackgroundMessage,
  BrowserScrapeRecord,
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

const PRICE_PATTERN = /\$\s?[\d,.]+/
const DETAIL_LINK_PATTERN = /\/yacht\//i
const SELECTABLE_TEXT_SELECTOR = 'a, h1, h2, h3, p, span, div, li, strong'

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

function formatFieldKey(key: ScraperFieldRule['key']) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase())
}

function readAttributeValue(target: Element, attribute: string) {
  if (!attribute) return ''
  if (attribute === 'href' && target instanceof HTMLAnchorElement) return target.href
  if (attribute === 'src' && target instanceof HTMLImageElement) return target.currentSrc || target.src
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
      const digits = withRegex.replaceAll(/\D/g, '')
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

function createEmptyBrowserRecord(source: string): BrowserScrapeRecord {
  return {
    source,
    url: null,
    listingId: null,
    title: null,
    make: null,
    model: null,
    year: null,
    length: null,
    price: null,
    currency: null,
    location: null,
    city: null,
    state: null,
    country: null,
    description: null,
    sellerType: null,
    listingType: null,
    images: [],
    fullText: null,
    rawFields: {},
    warnings: [],
  }
}

function resolveFieldTargets(root: Element | Document, selector: string) {
  if (!selector.trim()) {
    return []
  }

  if (root instanceof Document) {
    return queryRelativeMatches(document.documentElement, selector)
  }

  return queryRelativeMatches(root, selector)
}

function readSelectionValues(root: Element | Document, field: ScraperFieldRule, baseUrl: string) {
  const targets = field.selector === ':root' && root instanceof Element
    ? [root]
    : resolveFieldTargets(root, field.selector)

  if (!targets.length) {
    return null
  }

  const resolvedValues = targets
    .map((target) => extractFieldValue(target, field, baseUrl))
    .filter((value): value is string => Boolean(value))

  if (!resolvedValues.length) {
    return null
  }

  if (field.multiple || field.key === 'images') {
    return [...new Set(resolvedValues)]
  }

  return resolvedValues[0] || null
}

function assignFieldValue(
  record: BrowserScrapeRecord,
  field: ScraperFieldRule,
  value: string | string[] | null,
) {
  if (value == null || (Array.isArray(value) && value.length === 0)) {
    if (field.required) {
      record.warnings.push(`Missing required field: ${field.key}`)
    }
    return
  }

  record.rawFields[field.key] = value

  if (field.key === 'images') {
    record.images = Array.isArray(value) ? [...new Set(value)] : [value]
    return
  }

  if (field.key === 'year') {
    record.year = typeof value === 'string' ? Number.parseInt(value, 10) || null : null
    return
  }

  const nextValue = Array.isArray(value) ? value.join(field.joinWith) : value

  switch (field.key) {
    case 'url':
      record.url = nextValue
      break
    case 'listingId':
      record.listingId = nextValue
      break
    case 'title':
      record.title = nextValue
      break
    case 'make':
      record.make = nextValue
      break
    case 'model':
      record.model = nextValue
      break
    case 'length':
      record.length = nextValue
      break
    case 'price':
      record.price = nextValue
      break
    case 'currency':
      record.currency = nextValue
      break
    case 'location':
      record.location = nextValue
      break
    case 'city':
      record.city = nextValue
      break
    case 'state':
      record.state = nextValue
      break
    case 'country':
      record.country = nextValue
      break
    case 'description':
      record.description = nextValue
      break
    case 'sellerType':
      record.sellerType = nextValue
      break
    case 'listingType':
      record.listingType = nextValue
      break
    case 'fullText':
      record.fullText = nextValue
      break
  }
}

function extractSearchPage(request: SearchPageExtractRequest): SearchPageExtractResponse {
  const itemSelector = request.draft.config.itemSelector.trim()
  const itemFields = request.draft.config.fields.filter((field) => field.scope === 'item')
  const warnings: string[] = []

  if (!itemSelector) {
    return {
      pageUrl: window.location.href,
      itemCount: 0,
      nextPageUrl: null,
      records: [],
      warnings: ['Item selector is required before scraping search pages.'],
    }
  }

  const itemRoots = queryAll<HTMLElement>(document, itemSelector)
  const records: BrowserScrapeRecord[] = []

  for (const root of itemRoots) {
    if (records.length >= request.draft.config.maxItemsPerRun) {
      break
    }

    const record = createEmptyBrowserRecord(request.draft.boatSource)

    for (const field of itemFields) {
      assignFieldValue(record, field, readSelectionValues(root, field, window.location.href))
    }

    if (!record.url) {
      warnings.push('Skipped a search result because no URL could be extracted.')
      continue
    }

    records.push(record)
  }

  const nextHref = request.draft.config.nextPageSelector.trim()
    ? queryAll<HTMLAnchorElement>(document, request.draft.config.nextPageSelector)
        .find((element) => Boolean(element.getAttribute('href')))
        ?.getAttribute('href') || null
    : null

  return {
    pageUrl: window.location.href,
    itemCount: itemRoots.length,
    nextPageUrl: nextHref ? toAbsoluteUrl(nextHref, window.location.href) : null,
    records,
    warnings,
  }
}

function extractDetailPage(request: DetailPageExtractRequest): DetailPageExtractResponse {
  const detailFields = request.draft.config.fields.filter((field) => field.scope === 'detail')
  const record = createEmptyBrowserRecord(request.draft.boatSource)

  for (const field of detailFields) {
    assignFieldValue(record, field, readSelectionValues(document, field, window.location.href))
  }

  return {
    pageUrl: window.location.href,
    record,
    warnings: [...record.warnings],
  }
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

function scoreContainerSelector(selector: string) {
  const matches = queryAll(document, selector)
  if (matches.length < 3 || matches.length > 80) return -1

  const uniqueHrefCounts = matches.map((element) => getUniqueDetailHrefCount(element))
  const averageUniqueHrefs =
    uniqueHrefCounts.reduce((total, count) => total + count, 0) / uniqueHrefCounts.length
  if (!averageUniqueHrefs || averageUniqueHrefs > 2.2) return -1

  const totalUniqueListings = Math.max(getUniqueDetailHrefCount(document), matches.length)
  const countDistance = Math.abs(matches.length - totalUniqueListings)
  const countScore = Math.max(0, 100 - countDistance * 5)
  const mediaRichMatches = matches.filter((element) => queryAll(element, 'img[src]').length > 0).length

  return countScore + mediaRichMatches * 3 - averageUniqueHrefs * 20 - selector.length / 10
}

function detectRepeatedItemSelector(anchors: HTMLAnchorElement[]) {
  const candidates = new Map<string, number>()

  for (const anchor of anchors.slice(0, 24)) {
    let current: Element | null = anchor
    for (let depth = 0; current && current !== document.body && depth < 5; depth += 1) {
      for (const selector of buildReusableSelectorCandidates(current)) {
        const score = scoreContainerSelector(selector)
        if (score >= 0) {
          candidates.set(selector, Math.max(candidates.get(selector) || -1, score))
        }
      }
      current = current.parentElement
    }
  }

  return [...candidates.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || ''
}

function findBestTitleAnchor(root: ParentNode) {
  const anchors = getDetailAnchors(root)
  return anchors.sort(
    (left, right) => normalizeText(right.textContent).length - normalizeText(left.textContent).length,
  )[0]
}

function findFirstTextMatch(root: ParentNode, matcher: (text: string) => boolean) {
  return queryAll<HTMLElement>(root, SELECTABLE_TEXT_SELECTOR).find((element) => {
    if (!isVisible(element)) return false
    const text = normalizeText(element.textContent)
    return text.length > 1 && text.length < 220 && matcher(text)
  })
}

function findLikelyPriceElement(root: ParentNode) {
  return (
    queryAll<HTMLElement>(root, '[class*="price" i], [data-testid*="price" i], [data-test*="price" i]')
      .find((element) => isVisible(element) && PRICE_PATTERN.test(normalizeText(element.textContent))) ||
    findFirstTextMatch(root, (text) => PRICE_PATTERN.test(text) && text.length < 40)
  )
}

function findLikelyLocationElement(root: ParentNode) {
  return (
    queryAll<HTMLElement>(root, '[class*="location" i], [data-testid*="location" i]')
      .find((element) => isVisible(element) && /,/.test(normalizeText(element.textContent))) ||
    findFirstTextMatch(
      root,
      (text) =>
        /,/.test(text) &&
        text.length < 90 &&
        !PRICE_PATTERN.test(text) &&
        !/contact|broker|united states/i.test(text),
    )
  )
}

function findLikelyDescriptionElement(root: ParentNode) {
  return (
    queryAll<HTMLElement>(root, 'meta[name="description"], [class*="description" i] p, #description p')
      .find((element) => normalizeText(element.textContent || element.getAttribute('content')).length > 40) ||
    queryAll<HTMLElement>(root, 'p').find((element) => normalizeText(element.textContent).length > 100)
  )
}

function findLikelyImageElement(root: ParentNode) {
  return queryAll<HTMLImageElement>(root, 'img[src]').find(
    (image) => {
      const rect = image.getBoundingClientRect()
      const alt = normalizeText(image.alt)
      const closestLink = image.closest('a[href]')
      const closestLinkHref = closestLink instanceof HTMLAnchorElement ? closestLink.href : ''
      const closestId = image.closest('[id]')?.id || ''
      return (
        isVisible(image) &&
        rect.width >= 160 &&
        rect.height >= 100 &&
        !/sprite|icon|logo|adbutler|servedby/i.test(image.src) &&
        !/servedbyadbutler/i.test(closestLinkHref) &&
        !/^ad[-_]|^ad$/i.test(closestId) &&
        alt.length > 6 &&
        alt.toLowerCase() !== 'img'
      )
    },
  )
}

function findVisibleTitleElement() {
  return (
    queryAll<HTMLElement>(document, 'h1')
      .find((element) => isVisible(element) && normalizeText(element.textContent).length > 4) ??
    queryAll<HTMLElement>(document, 'h1').find((element) => normalizeText(element.textContent).length > 4) ??
    null
  )
}

function findDetailSummaryRoot(titleElement: HTMLElement | null) {
  let current: HTMLElement | null = titleElement

  for (let depth = 0; current && current !== document.body && depth < 6; depth += 1) {
    const text = normalizeText(current.textContent)
    if (PRICE_PATTERN.test(text) && /,/.test(text) && text.length < 600) {
      return current
    }
    current = current.parentElement
  }

  return titleElement?.parentElement ?? document.body
}

function ruleFromElement(
  key: ScraperFieldRule['key'],
  scope: ScraperFieldRule['scope'],
  element: Element | null,
  root: Element | Document = document,
  overrides: Partial<ScraperFieldRule> = {},
) {
  if (!element) return null

  const selector =
    root instanceof Document ? buildAbsoluteSelector(element) : buildRelativeSelector(element, root)
  return createFieldRule(key, scope, selector, overrides)
}

function detectNextPageSelector() {
  const nextCandidate =
    queryAll<HTMLAnchorElement>(document, 'a[rel="next"]').find((element) => isVisible(element)) ||
    queryAll<HTMLAnchorElement>(document, 'a[aria-label*="next" i], a[title*="next" i]').find((element) =>
      isVisible(element),
    ) ||
    queryAll<HTMLAnchorElement>(document, 'a[href]').find((element) =>
      /\bnext\b/i.test(normalizeText(element.textContent || element.getAttribute('aria-label'))),
    )

  return nextCandidate ? buildAbsoluteSelector(nextCandidate) : ''
}

function getSiteName() {
  return hostToSourceName(window.location.hostname)
}

function buildSearchAnalysis(): AutoDetectedAnalysis {
  const detailAnchors = getDetailAnchors()
  const itemSelector = detectRepeatedItemSelector(detailAnchors)
  const firstItem = itemSelector ? queryAll<HTMLElement>(document, itemSelector)[0] : null
  const titleAnchor = firstItem ? findBestTitleAnchor(firstItem) : findBestTitleAnchor(document)
  const sampleDetailUrl = titleAnchor?.href || detailAnchors[0]?.href || null
  const warnings: string[] = []
  const priceElement = firstItem ? (findLikelyPriceElement(firstItem) ?? null) : null
  const locationElement = firstItem ? (findLikelyLocationElement(firstItem) ?? null) : null
  const imageElement = firstItem ? (findLikelyImageElement(firstItem) ?? null) : null

  if (!itemSelector) {
    warnings.push('Could not confidently detect a repeating listing card. Pick the card manually.')
  }

  const fields = [
    ruleFromElement('url', 'item', titleAnchor || null, firstItem || document, {
      extract: 'attr',
      attribute: 'href',
      transform: 'url',
    }),
    ruleFromElement('title', 'item', titleAnchor || null, firstItem || document),
    ruleFromElement('price', 'item', priceElement, firstItem || document, {
      transform: 'price',
      required: false,
    }),
    ruleFromElement('location', 'item', locationElement, firstItem || document, { required: false }),
    ruleFromElement(
      'images',
      'item',
      imageElement,
      firstItem || document,
      {
        extract: 'attr',
        attribute: 'src',
        multiple: true,
        transform: 'url',
        required: false,
      },
    ),
  ].filter((field): field is ScraperFieldRule => Boolean(field))

  return {
    pageType: 'search',
    siteName: getSiteName(),
    pageUrl: window.location.href,
    itemSelector,
    nextPageSelector: detectNextPageSelector(),
    sampleDetailUrl,
    fields,
    warnings,
  }
}

function buildDetailAnalysis(): AutoDetectedAnalysis {
  const warnings: string[] = []
  const titleElement = findVisibleTitleElement()
  const summaryRoot = findDetailSummaryRoot(titleElement)
  const priceElement = findLikelyPriceElement(summaryRoot) ?? findLikelyPriceElement(document) ?? null
  const locationElement =
    findLikelyLocationElement(summaryRoot) ?? findLikelyLocationElement(document) ?? null
  const descriptionElement = findLikelyDescriptionElement(document) ?? null
  const imageElement = findLikelyImageElement(document) ?? null
  const descriptionIsMeta = descriptionElement?.tagName.toLowerCase() === 'meta'
  const detailFields = [
    ruleFromElement('title', 'detail', titleElement || null, document),
    ruleFromElement('price', 'detail', priceElement, document, {
      transform: 'price',
      required: false,
    }),
    ruleFromElement('location', 'detail', locationElement, document, {
      required: false,
    }),
    ruleFromElement('description', 'detail', descriptionElement, document, {
      extract: descriptionIsMeta ? 'attr' : 'text',
      attribute: descriptionIsMeta ? 'content' : '',
      required: false,
    }),
    ruleFromElement('images', 'detail', imageElement, document, {
      extract: 'attr',
      attribute: 'src',
      transform: 'url',
      multiple: true,
      required: false,
    }),
  ].filter((field): field is ScraperFieldRule => Boolean(field))

  if (!titleElement) {
    warnings.push('Could not detect the main title automatically. Pick it manually.')
  }

  return {
    pageType: 'detail',
    siteName: getSiteName(),
    pageUrl: window.location.href,
    itemSelector: '',
    nextPageSelector: '',
    sampleDetailUrl: null,
    fields: detailFields,
    warnings,
  }
}

function detectPageType() {
  if (DETAIL_LINK_PATTERN.test(window.location.pathname)) return 'detail'
  if (getDetailAnchors().length >= 4) return 'search'
  return 'unknown'
}

function analyzeCurrentPage() {
  const pageType = detectPageType()
  if (pageType === 'detail') return buildDetailAnalysis()
  if (pageType === 'search') return buildSearchAnalysis()

  return {
    pageType: 'unknown',
    siteName: getSiteName(),
    pageUrl: window.location.href,
    itemSelector: '',
    nextPageSelector: '',
    sampleDetailUrl: null,
    fields: [],
    warnings: ['This page does not look like a listing index or a detail page yet.'],
  } satisfies AutoDetectedAnalysis
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

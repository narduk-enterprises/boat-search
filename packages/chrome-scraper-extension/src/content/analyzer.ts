import { createFieldRule } from '../shared/defaults'
import { normalizePresetRecord } from '../shared/sitePresets'
import { hostToSourceName } from '../shared/transfer'
import type {
  AutoDetectedAnalysis,
  BrowserScrapeRecord,
  DetailPageExtractRequest,
  DetailPageExtractResponse,
  FixtureCaptureResponse,
  ScraperFieldRule,
  SearchPageExtractRequest,
  SearchPageExtractResponse,
} from '../shared/types'

const BLOCK_TITLE_SUBSTRINGS = [
  'just a moment',
  'moment please',
  'verify',
  'verification',
  'challenge',
  'checking your browser',
  'access denied',
  '403',
  'forbidden',
  'attention required',
  'cloudflare',
  'please wait',
  'enable javascript',
]
const NO_RESULTS_PATTERN = /no boats match|no results|0 results|no listings found/i
const PRICE_PATTERN = /\$\s?[\d,.]+/
const DETAIL_LINK_PATTERN = /\/(?:yacht|power-boats)\//i
const SELECTABLE_TEXT_SELECTOR = 'a, h1, h2, h3, p, span, div, li, strong'

function normalizeText(value: string | null | undefined) {
  return (value || '').replaceAll(/\s+/g, ' ').trim()
}

function queryAll<T extends Element = Element>(root: ParentNode, selector: string) {
  try {
    return [...root.querySelectorAll<T>(selector)]
  } catch {
    return []
  }
}

function getEscape(document: Document) {
  const escape = document.defaultView?.CSS?.escape
  if (escape) {
    return escape
  }

  return (value: string) => value.replaceAll(/[^a-zA-Z0-9_-]/g, '\\$&')
}

function getPathname(pageUrl: string) {
  try {
    return new URL(pageUrl).pathname
  } catch {
    return ''
  }
}

function getSiteName(pageUrl: string) {
  try {
    return hostToSourceName(new URL(pageUrl).hostname)
  } catch {
    return hostToSourceName('unknown')
  }
}

function isYachtWorldPage(pageUrl: string) {
  try {
    return new URL(pageUrl).hostname === 'www.yachtworld.com'
  } catch {
    return false
  }
}

function isBoatsComPage(pageUrl: string) {
  try {
    const hostname = new URL(pageUrl).hostname.toLowerCase()
    return hostname === 'www.boats.com' || hostname === 'boats.com'
  } catch {
    return false
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

function isVariantClassName(className: string) {
  return /(?:^|[-_])(featured|sponsored|stock|arrival|drop|premium|highlight|hero|primary|secondary|promo)(?:$|[-_])/i.test(
    className,
  )
}

function getStableClasses(document: Document, element: Element) {
  return [...element.classList].filter(
    (className) =>
      /^[a-zA-Z][\w-]{1,}$/i.test(className) &&
      !isTransientClassName(className) &&
      !isVariantClassName(className) &&
      !isGeneratedClassName(className) &&
      queryAll(document, `${element.tagName.toLowerCase()}.${getEscape(document)(className)}`).length > 1,
  )
}

function buildSelectorPart(document: Document, element: Element) {
  const escape = getEscape(document)
  const tag = element.tagName.toLowerCase()

  if (element.id && !/\d{3,}/.test(element.id)) {
    return `${tag}#${escape(element.id)}`
  }

  if (element instanceof HTMLMetaElement && element.name) {
    return `${tag}[name="${escape(element.name)}"]`
  }

  const dataTestId = element.getAttribute('data-testid')
  if (dataTestId) {
    return `${tag}[data-testid="${escape(dataTestId)}"]`
  }

  const classes = getStableClasses(document, element).slice(0, 2)
  if (classes.length) {
    return `${tag}.${classes.map((name) => escape(name)).join('.')}`
  }

  const siblings = element.parentElement
    ? [...element.parentElement.children].filter((child) => child.tagName === element.tagName)
    : []
  if (siblings.length <= 1) {
    return tag
  }

  return `${tag}:nth-of-type(${siblings.indexOf(element) + 1})`
}

function buildAbsoluteSelector(document: Document, element: Element) {
  const parts: string[] = []
  let current: Element | null = element

  while (current && current !== document.body && current !== document.documentElement) {
    parts.unshift(buildSelectorPart(document, current))
    const selector = parts.join(' > ')

    try {
      if (document.querySelectorAll(selector).length === 1) {
        return selector
      }
    } catch {
      // Ignore invalid transient selectors and keep walking upward.
    }

    current = current.parentElement
  }

  return parts.join(' > ')
}

function buildRelativeSelector(document: Document, element: Element, root: Element) {
  if (element === root) {
    return ':root'
  }

  const parts: string[] = []
  let current: Element | null = element

  while (current && current !== root) {
    parts.unshift(buildSelectorPart(document, current))
    current = current.parentElement
  }

  return parts.join(' > ')
}

function queryRelativeMatches(root: Element, selector: string) {
  if (!selector.trim()) {
    return []
  }

  if (selector === ':root') {
    return [root]
  }

  return queryAll(root, selector)
}

function isVisible(element: Element) {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
    return false
  }

  const view = element.ownerDocument.defaultView
  const style = view?.getComputedStyle?.(element)
  if (style && (style.display === 'none' || style.visibility === 'hidden')) {
    return false
  }

  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    return true
  }

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

function isDecorativeImageSource(url: string) {
  return /sprite|icon|logo|avatar|placeholder|blank|tracking|pixel|spinner|adbutler|servedby/i.test(
    url,
  )
}

function hasGallerySignal(element: Element) {
  const signalText = [
    element.id,
    element.getAttribute('class'),
    element.getAttribute('data-testid'),
    element.getAttribute('data-test'),
    element.getAttribute('aria-label'),
  ]
    .filter(Boolean)
    .join(' ')

  return /(gallery|carousel|slider|photo|media|thumb|image|swiper|flickity|rail)/i.test(
    signalText,
  )
}

function getImageDimension(image: HTMLImageElement, dimension: 'width' | 'height') {
  const natural = dimension === 'width' ? image.naturalWidth : image.naturalHeight
  if (natural) {
    return natural
  }

  const rect = image.getBoundingClientRect()
  const rectSize = dimension === 'width' ? rect.width : rect.height
  if (rectSize) {
    return rectSize
  }

  const explicitAttr = image.getAttribute(dimension)
  const explicitSize = explicitAttr ? Number(explicitAttr) : 0
  return Number.isFinite(explicitSize) ? explicitSize : 0
}

function isMeaningfulGalleryImage(image: HTMLImageElement, requireVisible = true) {
  const source = readImageSource(image)
  if (!source || !/^https?:\/\//i.test(source) || isDecorativeImageSource(source)) {
    return false
  }

  if (requireVisible && !isVisible(image)) {
    return false
  }

  return getImageDimension(image, 'width') >= 96 && getImageDimension(image, 'height') >= 72
}

function getDistinctImageSourceCount(images: HTMLImageElement[]) {
  return new Set(images.map((image) => readImageSource(image)).filter(Boolean)).size
}

function readAttributeValue(target: Element, attribute: string) {
  if (!attribute) {
    return ''
  }

  if (attribute === 'href' && target instanceof HTMLAnchorElement) {
    return target.href
  }

  if (attribute === 'src' && target instanceof HTMLImageElement) {
    return readImageSource(target)
  }

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

function extractFieldValue(target: Element, field: ScraperFieldRule, baseUrl: string) {
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
    contactInfo: null,
    contactName: null,
    contactPhone: null,
    otherDetails: null,
    disclaimer: null,
    features: null,
    electricalEquipment: null,
    electronics: null,
    insideEquipment: null,
    outsideEquipment: null,
    additionalEquipment: null,
    propulsion: null,
    engineMake: null,
    engineModel: null,
    engineYearDetail: null,
    totalPower: null,
    engineHours: null,
    engineTypeDetail: null,
    driveType: null,
    fuelTypeDetail: null,
    propellerType: null,
    propellerMaterial: null,
    specifications: null,
    cruisingSpeed: null,
    maxSpeed: null,
    range: null,
    lengthOverall: null,
    maxBridgeClearance: null,
    maxDraft: null,
    minDraftDetail: null,
    beamDetail: null,
    dryWeight: null,
    windlass: null,
    electricalCircuit: null,
    deadriseAtTransom: null,
    hullMaterial: null,
    hullShape: null,
    keelType: null,
    freshWaterTank: null,
    fuelTank: null,
    holdingTank: null,
    guestHeads: null,
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
    return queryRelativeMatches(root.documentElement, selector)
  }

  return queryRelativeMatches(root, selector)
}

function readSelectionValues(root: Element | Document, field: ScraperFieldRule, baseUrl: string) {
  const targets =
    field.selector === ':root' && root instanceof Element ? [root] : resolveFieldTargets(root, field.selector)

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

function getDetailAnchors(root: ParentNode = document) {
  return queryAll<HTMLAnchorElement>(root, 'a[href]').filter(
    (anchor) => Boolean(anchor.href) && DETAIL_LINK_PATTERN.test(anchor.href),
  )
}

function getUniqueDetailHrefCount(root: ParentNode) {
  return new Set(getDetailAnchors(root).map((anchor) => anchor.href)).size
}

function scoreContainerSelector(document: Document, selector: string) {
  const matches = queryAll(document, selector)
  if (matches.length < 3 || matches.length > 80) {
    return -1
  }

  const uniqueHrefCounts = matches.map((element) => getUniqueDetailHrefCount(element))
  const averageUniqueHrefs =
    uniqueHrefCounts.reduce((total, count) => total + count, 0) / uniqueHrefCounts.length
  if (!averageUniqueHrefs || averageUniqueHrefs > 2.2) {
    return -1
  }

  const totalUniqueListings = Math.max(getUniqueDetailHrefCount(document), matches.length)
  const countDistance = Math.abs(matches.length - totalUniqueListings)
  const countScore = Math.max(0, 100 - countDistance * 5)
  const mediaRichMatches = matches.filter((element) => queryAll(element, 'img[src]').length > 0).length

  return countScore + mediaRichMatches * 3 - averageUniqueHrefs * 20 - selector.length / 10
}

function buildReusableSelectorCandidates(document: Document, element: Element) {
  const escape = getEscape(document)
  const tag = element.tagName.toLowerCase()
  const candidates = new Set<string>()

  const dataTestId = element.getAttribute('data-testid')
  if (dataTestId) {
    candidates.add(`${tag}[data-testid="${escape(dataTestId)}"]`)
  }

  for (const className of getStableClasses(document, element).slice(0, 3)) {
    candidates.add(`${tag}.${escape(className)}`)
  }

  const classes = getStableClasses(document, element).slice(0, 2)
  if (classes.length > 1) {
    candidates.add(`${tag}.${classes.map((name) => escape(name)).join('.')}`)
  }

  const role = element.getAttribute('role')
  if (role) {
    candidates.add(`${tag}[role="${escape(role)}"]`)
  }

  candidates.add(tag)
  return [...candidates]
}

function detectRepeatedItemSelector(document: Document, anchors: HTMLAnchorElement[]) {
  const candidates = new Map<string, number>()

  for (const anchor of anchors.slice(0, 24)) {
    let current: Element | null = anchor
    for (let depth = 0; current && current !== document.body && depth < 5; depth += 1) {
      for (const selector of buildReusableSelectorCandidates(document, current)) {
        const score = scoreContainerSelector(document, selector)
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
    if (!isVisible(element)) {
      return false
    }

    const text = normalizeText(element.textContent)
    return text.length > 1 && text.length < 220 && matcher(text)
  })
}

function findLikelyPriceElement(root: ParentNode) {
  return (
    queryAll<HTMLElement>(
      root,
      '[class*="price" i], [data-testid*="price" i], [data-test*="price" i]',
    ).find((element) => isVisible(element) && PRICE_PATTERN.test(normalizeText(element.textContent))) ||
    findFirstTextMatch(root, (text) => PRICE_PATTERN.test(text) && text.length < 40)
  )
}

function findLikelyLocationElement(root: ParentNode) {
  return (
    queryAll<HTMLElement>(root, '[class*="location" i], [data-testid*="location" i]').find(
      (element) => isVisible(element) && /,/.test(normalizeText(element.textContent)),
    ) ||
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
    queryAll<HTMLElement>(
      root,
      'meta[name="description"], [class*="description" i] p, #description p',
    ).find(
      (element) => normalizeText(element.textContent || element.getAttribute('content')).length > 40,
    ) || queryAll<HTMLElement>(root, 'p').find((element) => normalizeText(element.textContent).length > 100)
  )
}

function findLikelyImageElement(root: ParentNode) {
  return queryAll<HTMLImageElement>(root, 'img').find((image) => {
    const rect = image.getBoundingClientRect()
    const closestLink = image.closest('a[href]')
    const closestLinkHref = closestLink instanceof HTMLAnchorElement ? closestLink.href : ''
    const closestId = image.closest('[id]')?.id || ''
    return (
      isMeaningfulGalleryImage(image) &&
      (rect.width >= 160 || getImageDimension(image, 'width') >= 160) &&
      (rect.height >= 100 || getImageDimension(image, 'height') >= 100) &&
      !/servedbyadbutler/i.test(closestLinkHref) &&
      !/^ad[-_]|^ad$/i.test(closestId)
    )
  })
}

function findLikelyImageGalleryRoot(document: Document, image: HTMLImageElement | null) {
  if (!image) {
    return null
  }

  let bestMatch: { element: Element; score: number } | null = null
  let current: Element | null = image.parentElement

  for (let depth = 0; current && current !== document.body && depth < 7; depth += 1) {
    const images = queryAll<HTMLImageElement>(current, 'img').filter((candidate) =>
      isMeaningfulGalleryImage(candidate, false),
    )
    const distinctSources = getDistinctImageSourceCount(images)

    if (distinctSources >= 2) {
      const visibleImages = images.filter((candidate) => isMeaningfulGalleryImage(candidate))
      let score = distinctSources * 12 + visibleImages.length * 6 - depth * 5

      if (hasGallerySignal(current)) {
        score += 30
      }

      if (distinctSources > 40) {
        score -= (distinctSources - 40) * 3
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { element: current, score }
      }
    }

    current = current.parentElement
  }

  return bestMatch?.element || null
}

function buildDetailImageSelector(document: Document, image: HTMLImageElement | null) {
  if (!image) {
    return { selector: '', distinctImageCount: 0 }
  }

  const galleryRoot = findLikelyImageGalleryRoot(document, image)
  if (!galleryRoot) {
    return { selector: buildAbsoluteSelector(document, image), distinctImageCount: 1 }
  }

  const rootSelector = buildAbsoluteSelector(document, galleryRoot)
  const descendantSelectors = ['picture img', 'img']
  const bestCandidate =
    descendantSelectors
      .map((selector) => ({
        selector,
        distinctSources: getDistinctImageSourceCount(
          queryAll<HTMLImageElement>(galleryRoot, selector).filter((candidate) =>
            isMeaningfulGalleryImage(candidate, false),
          ),
        ),
      }))
      .sort((left, right) => right.distinctSources - left.distinctSources)[0] || null

  return {
    selector: `${rootSelector} ${bestCandidate?.selector || 'img'}`,
    distinctImageCount: bestCandidate?.distinctSources || 0,
  }
}

function findVisibleTitleElement(document: Document) {
  return (
    queryAll<HTMLElement>(document, 'h1').find(
      (element) => isVisible(element) && normalizeText(element.textContent).length > 4,
    ) ??
    queryAll<HTMLElement>(document, 'h1').find(
      (element) => normalizeText(element.textContent).length > 4,
    ) ??
    null
  )
}

function findDetailSummaryRoot(document: Document, titleElement: HTMLElement | null) {
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
  document: Document,
  key: ScraperFieldRule['key'],
  scope: ScraperFieldRule['scope'],
  element: Element | null,
  root: Element | Document,
  overrides: Partial<ScraperFieldRule> = {},
) {
  if (!element) {
    return null
  }

  const selector =
    root instanceof Document
      ? buildAbsoluteSelector(document, element)
      : buildRelativeSelector(document, element, root)
  return createFieldRule(key, scope, selector, overrides)
}

function detectNextPageSelector(document: Document) {
  const nextCandidate =
    queryAll<HTMLAnchorElement>(document, 'a[rel="next"]').find((element) => isVisible(element)) ||
    queryAll<HTMLAnchorElement>(document, 'a[aria-label*="next" i], a[title*="next" i]').find(
      (element) => isVisible(element),
    ) ||
    queryAll<HTMLAnchorElement>(document, 'a[href]').find((element) =>
      /\bnext\b/i.test(normalizeText(element.textContent || element.getAttribute('aria-label'))),
    )

  return nextCandidate ? buildAbsoluteSelector(document, nextCandidate) : ''
}

function classifyDocumentState(document: Document, pageUrl: string) {
  const title = normalizeText(document.title).toLowerCase()
  const body = normalizeText(document.body?.innerText || document.body?.textContent).toLowerCase()
  const html = document.documentElement.outerHTML.toLowerCase()
  const detailAnchorCount = getDetailAnchors(document).length

  if (BLOCK_TITLE_SUBSTRINGS.some((needle) => title.includes(needle))) {
    return {
      pageState: 'challenge' as const,
      stateMessage: 'The page is showing a Cloudflare or verification interstitial instead of listings.',
    }
  }

  if (
    html.includes('__cf_chl') ||
    html.includes('challenges.cloudflare.com/turnstile') ||
    /checking your browser|just a moment/i.test(`${title}\n${body}`)
  ) {
    return {
      pageState: 'challenge' as const,
      stateMessage: 'The page is showing Cloudflare challenge markers instead of the expected site content.',
    }
  }

  if (NO_RESULTS_PATTERN.test(body) && detailAnchorCount === 0) {
    return {
      pageState: 'no_results' as const,
      stateMessage: 'The page loaded successfully but the source reported no matching listings.',
    }
  }

  const pathname = getPathname(pageUrl)
  if (/\/boats-for-sale\//i.test(pathname) && getDetailAnchors(document).length === 0) {
    return {
      pageState: 'parser_changed' as const,
      stateMessage:
        'The page loaded, but the helper could not find any detail links. The source DOM may have changed.',
    }
  }

  return {
    pageState: 'ok' as const,
    stateMessage: null,
  }
}

function detectPageType(document: Document, pageUrl: string) {
  const pathname = getPathname(pageUrl)
  if (DETAIL_LINK_PATTERN.test(pathname)) {
    return 'detail'
  }

  if (/\/boats-for-sale\//i.test(pathname)) {
    return 'search'
  }

  if (getDetailAnchors(document).length >= 4) {
    return 'search'
  }

  return 'unknown'
}

function createBaseAnalysis(document: Document, pageUrl: string): AutoDetectedAnalysis {
  return {
    pageType: detectPageType(document, pageUrl),
    pageState: 'ok',
    stateMessage: null,
    siteName: getSiteName(pageUrl),
    pageUrl,
    itemSelector: '',
    nextPageSelector: '',
    sampleDetailUrl: null,
    fields: [],
    warnings: [],
    stats: {
      detailLinkCount: getUniqueDetailHrefCount(document),
      listingCardCount: 0,
      distinctImageCount: 0,
    },
  }
}

function buildSearchAnalysis(document: Document, pageUrl: string): AutoDetectedAnalysis {
  const analysis = createBaseAnalysis(document, pageUrl)
  const state = classifyDocumentState(document, pageUrl)
  const yachtWorldPage = isYachtWorldPage(pageUrl)
  const boatsComPage = isBoatsComPage(pageUrl)
  const detailAnchors = getDetailAnchors(document)

  analysis.pageType = 'search'
  analysis.pageState = state.pageState
  analysis.stateMessage = state.stateMessage
  analysis.stats.detailLinkCount = getUniqueDetailHrefCount(document)

  if (state.pageState === 'challenge' || state.pageState === 'no_results') {
    if (state.stateMessage) {
      analysis.warnings.push(state.stateMessage)
    }
    return analysis
  }

  const itemSelector =
    yachtWorldPage && queryAll(document, 'div.grid-item').length >= 3
      ? 'div.grid-item'
      : boatsComPage && queryAll(document, 'li[data-listing-id]').length >= 3
        ? 'li[data-listing-id]'
      : detectRepeatedItemSelector(document, detailAnchors)
  const itemRoots = itemSelector ? queryAll<HTMLElement>(document, itemSelector) : []
  const firstItem = itemRoots[0] || null
  const titleAnchor =
    (yachtWorldPage && firstItem
      ? queryAll<HTMLAnchorElement>(firstItem, 'a.grid-listing-link[href*="/yacht/"]').find(
          (anchor) => Boolean(anchor.href),
        ) || null
      : null) ||
    (boatsComPage && firstItem
      ? queryAll<HTMLAnchorElement>(firstItem, 'a[href*="/power-boats/"]').find((anchor) =>
          Boolean(anchor.href),
        ) || null
      : null) ||
    (firstItem ? findBestTitleAnchor(firstItem) : findBestTitleAnchor(document))
  const sampleDetailUrl = titleAnchor?.href || detailAnchors[0]?.href || null
  const priceElement = firstItem
    ? (yachtWorldPage
        ? queryAll<HTMLElement>(
            firstItem,
            'span.style-module_listingPrice__lsbyO > p.style-module_content__tmQCh',
          ).find((element) => isVisible(element)) ||
          findLikelyPriceElement(firstItem) ||
          null
        : findLikelyPriceElement(firstItem) || null)
    : null
  const boatsComPriceElement = firstItem
    ? queryAll<HTMLElement>(firstItem, '.price').find((element) => isVisible(element)) || null
    : null
  const locationElement = firstItem
    ? (yachtWorldPage
        ? queryAll<HTMLElement>(
            firstItem,
            'span.style-module_listingBody__VNPuA > p.style-module_content__tmQCh.style-module_content-3__kZFb1, span.style-module_listingBody__VNPuA > p.style-module_content__tmQCh',
          ).find((element) => isVisible(element)) ||
          findLikelyLocationElement(firstItem) ||
          null
        : findLikelyLocationElement(firstItem) || null)
    : null
  const boatsComLocationElement = firstItem
    ? queryAll<HTMLElement>(firstItem, '.country').find((element) => isVisible(element)) || null
    : null
  const imageElement = firstItem
    ? (yachtWorldPage
        ? queryAll<HTMLImageElement>(
            firstItem,
            'div.style-module_wrapper__3JAO6 > span.style-module_image__tb1LM > img',
          ).find((image) => isMeaningfulGalleryImage(image, false)) ||
          findLikelyImageElement(firstItem) ||
          null
        : findLikelyImageElement(firstItem) || null)
    : null
  const boatsComImageElement = firstItem
    ? queryAll<HTMLImageElement>(firstItem, '.img-container img').find((image) =>
        isMeaningfulGalleryImage(image, false),
      ) || null
    : null

  analysis.itemSelector = itemSelector
  analysis.nextPageSelector =
    (yachtWorldPage && queryAll(document, 'a.next').length ? 'a.next' : '') ||
    (yachtWorldPage && queryAll(document, 'a[rel="next"]').length ? 'a[rel="next"]' : '') ||
    (boatsComPage && queryAll(document, 'a.next').length ? 'a.next' : '') ||
    (boatsComPage && queryAll(document, 'a[rel="next"]').length ? 'a[rel="next"]' : '') ||
    detectNextPageSelector(document)
  analysis.sampleDetailUrl = sampleDetailUrl
  analysis.stats.listingCardCount = itemRoots.length
  analysis.stats.distinctImageCount = (boatsComImageElement || imageElement) ? 1 : 0

  if (!itemSelector) {
    analysis.warnings.push(
      'Could not confidently detect a repeating listing card. Pick the card manually.',
    )
    analysis.pageState = 'parser_changed'
    analysis.stateMessage =
      analysis.stateMessage || 'The page loaded, but the helper could not infer a stable listing-card selector.'
  }

  if (!sampleDetailUrl) {
    analysis.warnings.push('Could not detect any sample detail link on the search page.')
    analysis.pageState = 'parser_changed'
    analysis.stateMessage =
      analysis.stateMessage || 'The page loaded, but the helper could not find any listing detail links.'
  }

  analysis.fields = [
    ruleFromElement(document, 'url', 'item', titleAnchor || null, firstItem || document, {
      extract: 'attr',
      attribute: 'href',
      transform: 'url',
    }),
    ruleFromElement(document, 'title', 'item', titleAnchor || null, firstItem || document),
    ruleFromElement(
      document,
      'price',
      'item',
      boatsComPriceElement || priceElement,
      firstItem || document,
      {
      transform: 'price',
      required: false,
      },
    ),
    ruleFromElement(
      document,
      'location',
      'item',
      boatsComLocationElement || locationElement,
      firstItem || document,
      {
      required: false,
      },
    ),
    ruleFromElement(
      document,
      'images',
      'item',
      boatsComImageElement || imageElement,
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

  return analysis
}

function buildDetailAnalysis(document: Document, pageUrl: string): AutoDetectedAnalysis {
  const analysis = createBaseAnalysis(document, pageUrl)
  const state = classifyDocumentState(document, pageUrl)
  const yachtWorldPage = isYachtWorldPage(pageUrl)
  const boatsComPage = isBoatsComPage(pageUrl)
  const titleElement =
    (yachtWorldPage
      ? queryAll<HTMLElement>(document, 'div#bdp-boat-summary h1').find((element) => isVisible(element)) ||
        null
      : null) || findVisibleTitleElement(document)
  const boatsComTitleElement =
    queryAll<HTMLElement>(document, 'section.boat-details h1, .boat-details h1').find((element) =>
      isVisible(element),
    ) || null
  const summaryRoot = findDetailSummaryRoot(document, titleElement)
  const priceElement =
    (yachtWorldPage
      ? queryAll<HTMLElement>(
          document,
          'div.next-previous-listing-price, div#bdp-boat-summary [class*="listingPrice" i] > p, div#bdp-boat-summary [class*="price" i] > p',
        ).find((element) => isVisible(element)) || null
      : null) ||
    findLikelyPriceElement(summaryRoot) ||
    findLikelyPriceElement(document) ||
    null
  const boatsComPriceElement =
    queryAll<HTMLElement>(
      document,
      'section.boat-details .details-header .price, section.boat-details .price',
    ).find((element) => isVisible(element)) || null
  const locationElement =
    (yachtWorldPage
      ? queryAll<HTMLElement>(
          document,
          'div.next-previous-listing-location, div#bdp-boat-summary [class*="location" i]',
        ).find((element) => isVisible(element)) || null
      : null) ||
    findLikelyLocationElement(summaryRoot) ||
    findLikelyLocationElement(document) ||
    null
  const boatsComLocationElement =
    queryAll<HTMLElement>(document, '#seller-map-view, button.map-trigger').find((element) =>
      isVisible(element),
    ) || null
  const descriptionElement =
    (yachtWorldPage
      ? queryAll<HTMLElement>(
          document,
          'div.accordion-details-items details > div.data-html > div.data-html-inner-wrapper > div.render-html, div.data-html-inner-wrapper > div.render-html',
        ).find((element) => isVisible(element) && normalizeText(element.textContent).length > 140) ||
        null
      : null) ||
    findLikelyDescriptionElement(document) ||
    null
  const imageElement =
    (yachtWorldPage
      ? queryAll<HTMLImageElement>(
          document,
          'div.style-module_mediaCarousel__gADiR div.embla__slide img',
        ).find((image) => isMeaningfulGalleryImage(image, false)) || null
      : null) ||
    (boatsComPage
      ? queryAll<HTMLImageElement>(document, '#detail-carousel img, .img-gallery img').find(
          (image) => isMeaningfulGalleryImage(image, false),
        ) || null
      : null) ||
    findLikelyImageElement(document) ||
    null
  const boatsComGalleryImages = boatsComPage
    ? queryAll<HTMLImageElement>(
        document,
        '#detail-carousel img[src*="images.boats.com"], .img-gallery img[src*="images.boats.com"]',
      ).filter((image) => Boolean(readImageSource(image)))
    : []
  const detailImage =
    boatsComPage && boatsComGalleryImages.length
      ? {
          selector: '#detail-carousel img, .img-gallery img',
          distinctImageCount: getDistinctImageSourceCount(boatsComGalleryImages),
        }
      : buildDetailImageSelector(document, imageElement)
  const descriptionIsMeta = descriptionElement?.tagName.toLowerCase() === 'meta'

  analysis.pageType = 'detail'
  analysis.pageState = state.pageState
  analysis.stateMessage = state.stateMessage
  analysis.stats.distinctImageCount = detailImage.distinctImageCount

  if (state.pageState === 'challenge' || state.pageState === 'no_results') {
    if (state.stateMessage) {
      analysis.warnings.push(state.stateMessage)
    }
    return analysis
  }

  analysis.fields = [
    ruleFromElement(document, 'title', 'detail', boatsComTitleElement || titleElement || null, document),
    ruleFromElement(document, 'price', 'detail', boatsComPriceElement || priceElement, document, {
      transform: 'price',
      required: false,
    }),
    ruleFromElement(document, 'location', 'detail', boatsComLocationElement || locationElement, document, {
      required: false,
    }),
    ruleFromElement(document, 'description', 'detail', descriptionElement, document, {
      extract: descriptionIsMeta ? 'attr' : 'text',
      attribute: descriptionIsMeta ? 'content' : '',
      required: false,
    }),
    detailImage.selector
      ? createFieldRule('images', 'detail', detailImage.selector, {
          extract: 'attr',
          attribute: 'src',
          transform: 'url',
          multiple: true,
          required: false,
        })
      : null,
  ].filter((field): field is ScraperFieldRule => Boolean(field))

  if (!titleElement) {
    analysis.warnings.push('Could not detect the main title automatically. Pick it manually.')
    analysis.pageState = 'parser_changed'
    analysis.stateMessage =
      analysis.stateMessage || 'The detail page loaded, but the main listing title was not detected.'
  }

  if (!detailImage.selector) {
    analysis.warnings.push('Could not detect a multi-image gallery automatically on the detail page.')
  }

  return analysis
}

export function analyzeDocument(document: Document, pageUrl: string): AutoDetectedAnalysis {
  const pageType = detectPageType(document, pageUrl)

  if (pageType === 'detail') {
    return buildDetailAnalysis(document, pageUrl)
  }

  if (pageType === 'search') {
    return buildSearchAnalysis(document, pageUrl)
  }

  const state = classifyDocumentState(document, pageUrl)
  const analysis = createBaseAnalysis(document, pageUrl)
  analysis.pageState = state.pageState === 'ok' ? 'parser_changed' : state.pageState
  analysis.stateMessage =
    state.stateMessage || 'This page does not look like a listing index or a detail page yet.'
  analysis.warnings = [analysis.stateMessage]
  return analysis
}

export function extractSearchPageDocument(
  document: Document,
  pageUrl: string,
  request: SearchPageExtractRequest,
): SearchPageExtractResponse {
  const analysis = analyzeDocument(document, pageUrl)
  const itemSelector = request.draft.config.itemSelector.trim()
  const itemFields = request.draft.config.fields.filter((field) => field.scope === 'item')
  const warnings = [...analysis.warnings]

  if (!itemSelector) {
    return {
      analysis,
      pageUrl,
      itemCount: 0,
      nextPageUrl: null,
      records: [],
      warnings: [...warnings, 'Item selector is required before scraping search pages.'],
    }
  }

  const itemRoots = queryAll<HTMLElement>(document, itemSelector)
  const records: BrowserScrapeRecord[] = []

  if (!itemRoots.length) {
    warnings.push(`No items matched ${itemSelector} on ${pageUrl}`)
  }

  for (const root of itemRoots) {
    if (records.length >= request.draft.config.maxItemsPerRun) {
      break
    }

    const record = createEmptyBrowserRecord(request.draft.boatSource)

    for (const field of itemFields) {
      assignFieldValue(record, field, readSelectionValues(root, field, pageUrl))
    }

    const normalizedRecord = normalizePresetRecord(request.presetId, record, {
      context: 'search',
      pageUrl,
    })

    if (!normalizedRecord.url) {
      warnings.push('Skipped a search result because no URL could be extracted.')
      continue
    }

    records.push(normalizedRecord)
  }

  const nextHref = request.draft.config.nextPageSelector.trim()
    ? queryAll<HTMLAnchorElement>(document, request.draft.config.nextPageSelector)
        .find((element) => Boolean(element.getAttribute('href')))
        ?.getAttribute('href') || null
    : null

  return {
    analysis,
    pageUrl,
    itemCount: itemRoots.length,
    nextPageUrl: nextHref ? toAbsoluteUrl(nextHref, pageUrl) : null,
    records,
    warnings,
  }
}

export function extractDetailPageDocument(
  document: Document,
  pageUrl: string,
  request: DetailPageExtractRequest,
): DetailPageExtractResponse {
  const analysis = analyzeDocument(document, pageUrl)
  const detailFields = request.draft.config.fields.filter((field) => field.scope === 'detail')
  const record = createEmptyBrowserRecord(request.draft.boatSource)

  for (const field of detailFields) {
    assignFieldValue(record, field, readSelectionValues(document, field, pageUrl))
  }

  const normalizedRecord = normalizePresetRecord(request.presetId, record, {
    context: 'detail',
    pageUrl,
  })

  return {
    analysis,
    pageUrl,
    record: normalizedRecord,
    warnings: uniqueStrings([...analysis.warnings, ...normalizedRecord.warnings]),
  }
}

export function capturePageDocument(document: Document, pageUrl: string): FixtureCaptureResponse {
  const analysis = analyzeDocument(document, pageUrl)
  const doctype = document.doctype
    ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ''}${document.doctype.systemId ? ` "${document.doctype.systemId}"` : ''}>`
    : ''
  const view = document.defaultView

  return {
    html: [doctype, document.documentElement.outerHTML].filter(Boolean).join('\n'),
    analysis,
    page: {
      url: pageUrl,
      title: document.title,
      readyState: document.readyState,
      viewport: {
        width: view?.innerWidth || 0,
        height: view?.innerHeight || 0,
        scrollX: view?.scrollX || 0,
        scrollY: view?.scrollY || 0,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
      },
    },
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

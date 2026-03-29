(() => {
  const MAX_CANDIDATES = 12
  const MAX_IMAGE_GROUPS = 10

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim()
  }

  function queryAll(selector, root = document) {
    try {
      return [...root.querySelectorAll(selector)]
    } catch {
      return []
    }
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  function stableClasses(element) {
    return [...element.classList]
      .filter((name) => /^[a-z][\w-]{1,}$/i.test(name))
      .filter((name) => !/(active|selected|current|visible|hidden|loading|loaded|focus|hover)/i.test(name))
      .slice(0, 2)
  }

  function selectorPart(element) {
    const tag = element.tagName.toLowerCase()

    if (element.id && !/\d{3,}/.test(element.id)) {
      return `${tag}#${CSS.escape(element.id)}`
    }

    if (element instanceof HTMLMetaElement && element.name) {
      return `${tag}[name="${CSS.escape(element.name)}"]`
    }

    const classes = stableClasses(element)
    if (classes.length) {
      return `${tag}.${classes.map((name) => CSS.escape(name)).join('.')}`
    }

    if (!element.parentElement) {
      return tag
    }

    const siblings = [...element.parentElement.children].filter(
      (sibling) => sibling.tagName === element.tagName,
    )
    if (siblings.length <= 1) {
      return tag
    }

    return `${tag}:nth-of-type(${siblings.indexOf(element) + 1})`
  }

  function cssPath(element, stopAt = document.body) {
    const parts = []
    let current = element

    while (current && current !== stopAt && current !== document.documentElement) {
      parts.unshift(selectorPart(current))
      const selector = parts.join(' > ')
      try {
        if (document.querySelectorAll(selector).length === 1) {
          return selector
        }
      } catch {}
      current = current.parentElement
    }

    return parts.join(' > ')
  }

  function uniqueBy(values, keyFn) {
    const seen = new Set()
    const result = []

    for (const value of values) {
      const key = keyFn(value)
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      result.push(value)
    }

    return result
  }

  function readFirstSrcsetUrl(value) {
    return (
      value
        ?.split(',')
        .map((entry) => entry.trim().split(/\s+/)[0] || '')
        .find(Boolean) || ''
    )
  }

  function readImageSource(target) {
    return (
      target.currentSrc ||
      target.src ||
      target.getAttribute('data-src') ||
      target.getAttribute('data-lazy-src') ||
      target.getAttribute('data-original') ||
      readFirstSrcsetUrl(target.getAttribute('data-srcset')) ||
      readFirstSrcsetUrl(target.getAttribute('srcset')) ||
      ''
    )
  }

  function visibleTextCandidates(selectors, predicate) {
    return uniqueBy(
      selectors.flatMap((selector) =>
        queryAll(selector).map((element) => ({
          selector: cssPath(element),
          text: normalizeText(element.textContent),
          visible: isVisible(element),
        })),
      )
        .filter((entry) => entry.text)
        .filter((entry) => predicate(entry.text, entry.visible)),
      (entry) => `${entry.selector}:${entry.text}`,
    ).slice(0, MAX_CANDIDATES)
  }

  function titleCandidates() {
    return visibleTextCandidates(
      ['h1', 'h2', '[class*="title" i]', '[class*="heading" i]', '[data-testid*="title" i]'],
      (text, visible) => visible && text.length >= 6 && text.length <= 180,
    )
  }

  function priceCandidates() {
    return visibleTextCandidates(
      ['*'],
      (text, visible) =>
        visible &&
        text.length <= 80 &&
        (/[$€£]\s?\d/.test(text) || /\b\d[\d,.]*\s?(usd|eur|gbp)\b/i.test(text)),
    )
  }

  function locationCandidates() {
    return visibleTextCandidates(
      ['[class*="location" i]', '[class*="address" i]', '*'],
      (text, visible) =>
        visible &&
        text.length <= 140 &&
        (/[A-Za-z].*,\s*[A-Za-z]/.test(text) ||
          /(florida|texas|california|new jersey|north carolina|south carolina|new york)/i.test(
            text,
          )),
    )
  }

  function descriptionCandidates() {
    const metaDescription = queryAll('meta[name="description"]').map((element) => ({
      selector: cssPath(element),
      text: element.getAttribute('content') || '',
      visible: false,
      length: normalizeText(element.getAttribute('content') || '').length,
      source: 'meta',
    }))

    const visibleBlocks = uniqueBy(
      queryAll(
        '[class*="description" i], [class*="overview" i], [class*="about" i], article p, section p, main p, div',
      )
        .map((element) => ({
          selector: cssPath(element),
          text: normalizeText(element.textContent),
          visible: isVisible(element),
          length: normalizeText(element.textContent).length,
          source: 'visible',
        }))
        .filter((entry) => entry.visible && entry.length >= 120)
        .filter((entry) => entry.length <= 2500),
      (entry) => `${entry.selector}:${entry.text.slice(0, 120)}`,
    )

    return [...metaDescription, ...visibleBlocks]
      .slice(0, MAX_CANDIDATES)
      .map((entry) => ({
        selector: entry.selector,
        source: entry.source,
        length: entry.length,
        textPreview: entry.text.slice(0, 300),
      }))
  }

  function imageGroups() {
    const images = queryAll('img')
      .map((image) => ({
        element: image,
        src: readImageSource(image),
      }))
      .filter((entry) => entry.src)

    const grouped = new Map()
    for (const image of images) {
      const container =
        image.element.closest('[class*="gallery" i], [class*="carousel" i], [class*="slider" i], picture, figure, section, div') ||
        image.element.parentElement ||
        image.element
      const key = cssPath(container)
      const current = grouped.get(key) || {
        containerSelector: key,
        totalImages: 0,
        httpImages: [],
        ignoredImages: [],
      }

      current.totalImages += 1
      if (/^https?:\/\//i.test(image.src) && !/(\.svg\b|servedby|adbutler|doubleclick|googleads|google-analytics|facebook|pixel)/i.test(image.src)) {
        current.httpImages.push(image.src)
      } else {
        current.ignoredImages.push(image.src)
      }
      grouped.set(key, current)
    }

    return [...grouped.values()]
      .map((group) => ({
        containerSelector: group.containerSelector,
        totalImages: group.totalImages,
        keptImageCount: uniqueBy(group.httpImages, (value) => value).length,
        ignoredImageCount: uniqueBy(group.ignoredImages, (value) => value).length,
        sampleKeptImages: uniqueBy(group.httpImages, (value) => value).slice(0, 8),
        sampleIgnoredImages: uniqueBy(group.ignoredImages, (value) => value).slice(0, 4),
      }))
      .filter((group) => group.totalImages > 0)
      .sort((left, right) => right.keptImageCount - left.keptImageCount || right.totalImages - left.totalImages)
      .slice(0, MAX_IMAGE_GROUPS)
  }

  const output = {
    kind: 'detail-page-inspector',
    pageUrl: window.location.href,
    pageTitle: document.title,
    titleCandidates: titleCandidates(),
    priceCandidates: priceCandidates(),
    locationCandidates: locationCandidates(),
    descriptionCandidates: descriptionCandidates(),
    imageGroups: imageGroups(),
  }

  const payload = JSON.stringify(output, null, 2)
  if (typeof copy === 'function') {
    copy(payload)
    console.log('Detail page inspector copied to clipboard.')
  } else {
    console.log('Detail page inspector ready. Copy the JSON below.')
  }
  console.log(output)
})()

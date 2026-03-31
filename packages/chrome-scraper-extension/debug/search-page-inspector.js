;(() => {
  const MAX_CARDS = 5
  const MAX_TEXT_BLOCKS = 12
  const MAX_LINKS = 8
  const MAX_IMAGES = 8

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

  function stableClasses(element) {
    return [...element.classList]
      .filter((name) => /^[a-z][\w-]{1,}$/i.test(name))
      .filter(
        (name) =>
          !/(active|selected|current|visible|hidden|loading|loaded|focus|hover)/i.test(name),
      )
      .slice(0, 2)
  }

  function selectorPart(element) {
    const tag = element.tagName.toLowerCase()

    if (element.id && !/\d{3,}/.test(element.id)) {
      return `${tag}#${CSS.escape(element.id)}`
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

  function getDetailAnchors(root = document) {
    return queryAll('a[href]', root).filter((anchor) => /\/yacht\//i.test(anchor.href))
  }

  function countUniqueDetailLinks(root) {
    return new Set(getDetailAnchors(root).map((anchor) => anchor.href)).size
  }

  function repeatedSelectorCandidates() {
    const anchors = getDetailAnchors(document).slice(0, 20)
    const candidates = new Map()

    for (const anchor of anchors) {
      let current = anchor
      for (let depth = 0; current && current !== document.body && depth < 7; depth += 1) {
        const selector = selectorPart(current)
        const fullSelector = cssPath(current)
        const globalSelector =
          stableClasses(current).length > 0
            ? `${current.tagName.toLowerCase()}.${stableClasses(current)
                .map((name) => CSS.escape(name))
                .join('.')}`
            : current.tagName.toLowerCase()
        const matches = queryAll(globalSelector)
        const detailLinkCount = countUniqueDetailLinks(current)

        if (
          matches.length >= 3 &&
          matches.length <= 160 &&
          detailLinkCount >= 1 &&
          detailLinkCount <= 3
        ) {
          const existing = candidates.get(globalSelector) || {
            selector: globalSelector,
            sampleAbsoluteSelector: fullSelector,
            matchedCards: matches.length,
            sampleDetailLinksPerCard: detailLinkCount,
            sampleTitles: [],
          }
          existing.sampleTitles.push(normalizeText(anchor.textContent))
          candidates.set(globalSelector, existing)
        }

        current = current.parentElement
      }
    }

    return [...candidates.values()]
      .map((candidate) => ({
        ...candidate,
        sampleTitles: uniqueBy(candidate.sampleTitles.filter(Boolean), (value) => value).slice(
          0,
          3,
        ),
        score:
          Math.max(0, 140 - Math.abs(candidate.matchedCards - getDetailAnchors(document).length)) +
          (candidate.sampleDetailLinksPerCard === 1 ? 80 : 20),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 8)
  }

  function chooseCardElements() {
    const candidates = repeatedSelectorCandidates()
    if (candidates.length) {
      const chosen = candidates[0]
      return {
        chosenSelector: chosen.selector,
        candidates,
        elements: queryAll(chosen.selector).filter(
          (element) => countUniqueDetailLinks(element) >= 1,
        ),
      }
    }

    const anchors = getDetailAnchors(document)
    const elements = uniqueBy(
      anchors
        .map((anchor) =>
          anchor.closest('article, li, [class*="card" i], [class*="listing" i], div'),
        )
        .filter(Boolean),
      (element) => cssPath(element),
    )

    return {
      chosenSelector: null,
      candidates,
      elements,
    }
  }

  function nextPageCandidates() {
    const nodes = queryAll('a[href], button, [role="button"]')
      .map((element) => {
        const text = normalizeText(element.textContent)
        const aria = normalizeText(element.getAttribute('aria-label'))
        const href = element.href || ''
        const score =
          (/\bnext\b/i.test(text) ? 5 : 0) +
          (/\bnext\b/i.test(aria) ? 5 : 0) +
          (/page=\d+/i.test(href) ? 3 : 0) +
          (/pagination|pager|next/i.test(element.className) ? 2 : 0)

        return {
          selector: cssPath(element),
          text,
          ariaLabel: aria,
          href,
          score,
        }
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)

    return uniqueBy(nodes, (entry) => entry.selector).slice(0, 8)
  }

  function directTextChildren(element) {
    return [...element.children].flatMap((child) => {
      const text = normalizeText(child.textContent)
      if (!text || text.length < 2) {
        return []
      }

      return [
        {
          selector: cssPath(child, element),
          text: text.slice(0, 220),
        },
      ]
    })
  }

  function priceCandidates(element) {
    return uniqueBy(
      queryAll('*', element)
        .map((node) => ({
          selector: cssPath(node, element),
          text: normalizeText(node.textContent),
        }))
        .filter((entry) => entry.text && entry.text.length <= 80)
        .filter((entry) => /[$€£]\s?\d|\d[\d,.]+\s?(usd|eur|gbp)/i.test(entry.text)),
      (entry) => `${entry.selector}:${entry.text}`,
    ).slice(0, 8)
  }

  function locationCandidates(element) {
    return uniqueBy(
      queryAll('*', element)
        .map((node) => ({
          selector: cssPath(node, element),
          text: normalizeText(node.textContent),
        }))
        .filter((entry) => entry.text && entry.text.length <= 120)
        .filter(
          (entry) =>
            /[A-Za-z].*,\s*[A-Za-z]/.test(entry.text) ||
            /(florida|texas|california|new jersey|north carolina|south carolina|new york)/i.test(
              entry.text,
            ),
        ),
      (entry) => `${entry.selector}:${entry.text}`,
    ).slice(0, 8)
  }

  function imageCandidates(element) {
    return uniqueBy(
      queryAll('img', element)
        .map((image) => ({
          selector: cssPath(image, element),
          src: readImageSource(image),
          alt: normalizeText(image.alt),
        }))
        .filter((entry) => entry.src),
      (entry) => entry.src,
    ).slice(0, MAX_IMAGES)
  }

  function linkCandidates(element) {
    return uniqueBy(
      queryAll('a[href]', element)
        .map((anchor) => ({
          selector: cssPath(anchor, element),
          href: anchor.href,
          text: normalizeText(anchor.textContent),
        }))
        .filter((entry) => entry.href),
      (entry) => entry.href,
    ).slice(0, MAX_LINKS)
  }

  const cards = chooseCardElements()
  const output = {
    kind: 'search-page-inspector',
    pageUrl: window.location.href,
    pageTitle: document.title,
    detailAnchorCount: getDetailAnchors(document).length,
    chosenCardSelector: cards.chosenSelector,
    cardSelectorCandidates: cards.candidates,
    nextPageCandidates: nextPageCandidates(),
    sampledCards: cards.elements.slice(0, MAX_CARDS).map((card, index) => ({
      index: index + 1,
      cardSelector: cssPath(card),
      detailLinkCount: countUniqueDetailLinks(card),
      links: linkCandidates(card),
      priceCandidates: priceCandidates(card),
      locationCandidates: locationCandidates(card),
      images: imageCandidates(card),
      textBlocks: directTextChildren(card).slice(0, MAX_TEXT_BLOCKS),
      cardTextPreview: normalizeText(card.textContent).slice(0, 500),
    })),
  }

  const payload = JSON.stringify(output, null, 2)
  if (typeof copy === 'function') {
    copy(payload)
    console.log('Search page inspector copied to clipboard.')
  } else {
    console.log('Search page inspector ready. Copy the JSON below.')
  }
  console.log(output)
})()

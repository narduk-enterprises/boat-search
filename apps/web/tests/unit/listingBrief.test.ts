import { describe, expect, it } from 'vitest'
import {
  normalizeListingDescriptionText,
  parseListingBrief,
  splitProseIntoParagraphs,
} from '../../app/utils/listingBrief'

describe('normalizeListingDescriptionText', () => {
  it('breaks mashed Label: boundaries', () => {
    expect(normalizeListingDescriptionText('Ice BlueTransducer: Airmar')).toBe(
      'Ice Blue\nTransducer: Airmar',
    )
  })
})

describe('parseListingBrief', () => {
  it('returns prose-only for text without spec lines', () => {
    const blocks = parseListingBrief('Just a short intro with no colons worth splitting.')
    expect(blocks).toEqual([
      { kind: 'prose', text: 'Just a short intro with no colons worth splitting.' },
    ])
  })

  it('parses line-oriented label:value rows', () => {
    const raw = `Hull Color: Ice Blue
Engine Hours: 205 each
Fuel Type: 89 Octane`
    const blocks = parseListingBrief(raw)
    expect(blocks).toEqual([
      {
        kind: 'specs',
        items: [
          { label: 'Hull Color', value: 'Ice Blue' },
          { label: 'Engine Hours', value: '205 each' },
          { label: 'Fuel Type', value: '89 Octane' },
        ],
      },
    ])
  })

  it('keeps separate paragraphs', () => {
    const raw = 'First paragraph here.\n\nHull Color: Red\n\nDealer notes apply.'
    const blocks = parseListingBrief(raw)
    expect(blocks.length).toBeGreaterThan(1)
    expect(blocks.some((b) => b.kind === 'specs')).toBe(true)
  })

  it('splits semicolon-separated clauses into lines', () => {
    const raw = 'Hull Color: Blue; Engine Hours: 100; Ready to fish.'
    const blocks = parseListingBrief(raw)
    expect(blocks.some((b) => b.kind === 'specs')).toBe(true)
  })
})

describe('splitProseIntoParagraphs', () => {
  it('splits on sentence boundaries', () => {
    const parts = splitProseIntoParagraphs('First sentence. Second one! Third?')
    expect(parts.length).toBeGreaterThanOrEqual(2)
  })
})

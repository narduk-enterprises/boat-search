import { describe, expect, it } from 'vitest'
import {
  chooseRepresentativeBoat,
  deriveBoatDedupeState,
  findMatchingSourceListing,
} from '../../lib/boatDedupe'

function createBoat(
  overrides: Partial<{
    id: number
    source: string
    url: string
    listingId: string | null
    make: string | null
    model: string | null
    year: number | null
    length: string | null
    price: string | null
    location: string | null
    city: string | null
    state: string | null
    country: string | null
    contactInfo: string | null
    contactName: string | null
    contactPhone: string | null
    description: string | null
    fullText: string | null
    images: string[]
    updatedAt: string
  }> = {},
) {
  return {
    id: overrides.id ?? 1,
    source: overrides.source ?? 'boats.com',
    url: overrides.url ?? `https://example.com/boats/${overrides.id ?? 1}`,
    listingId: overrides.listingId ?? String(1000 + (overrides.id ?? 1)),
    make: overrides.make ?? 'Pathfinder',
    model: overrides.model ?? '2500 Hybrid',
    year: overrides.year ?? 2021,
    length: overrides.length ?? '25 ft',
    price: overrides.price ?? '149900',
    location: overrides.location ?? 'Texas City, Texas',
    city: overrides.city ?? 'Texas City',
    state: overrides.state ?? 'Texas',
    country: overrides.country ?? 'US',
    contactInfo: overrides.contactInfo ?? null,
    contactName: overrides.contactName ?? null,
    contactPhone: overrides.contactPhone ?? null,
    description: overrides.description ?? 'Clean listing copy.',
    fullText: overrides.fullText ?? 'Detailed brochure copy.',
    images: overrides.images ?? [`https://images.example.com/${overrides.id ?? 1}.jpg`],
    updatedAt: overrides.updatedAt ?? '2026-03-29T12:00:00.000Z',
  }
}

describe('boat dedupe core', () => {
  it('matches exact source listings by source and listing id before URL', () => {
    const existing = [
      createBoat({
        id: 7,
        source: 'yachtworld.com',
        listingId: 'abc-123',
        url: 'https://www.yachtworld.com/yacht/original-slug-abc-123/',
      }),
    ]

    const match = findMatchingSourceListing(existing, {
      source: 'yachtworld.com',
      listingId: 'abc-123',
      url: 'https://www.yachtworld.com/yacht/updated-slug-abc-123/',
      make: 'Pathfinder',
      model: '2500 Hybrid',
      year: 2021,
      length: '25 ft',
      price: '149900',
      location: 'Texas City, Texas',
      city: 'Texas City',
      state: 'Texas',
      country: 'US',
      contactInfo: null,
      contactName: null,
      contactPhone: null,
      description: null,
      fullText: null,
      images: [],
    })

    expect(match?.id).toBe(7)
  })

  it('supersedes historical exact duplicates and keeps only one active survivor', () => {
    const result = deriveBoatDedupeState([
      createBoat({
        id: 10,
        source: 'boats.com',
        listingId: 'same-listing',
        url: 'https://boats.com/listing/old',
        updatedAt: '2026-03-28T10:00:00.000Z',
      }),
      createBoat({
        id: 11,
        source: 'boats.com',
        listingId: 'same-listing',
        url: 'https://boats.com/listing/new',
        updatedAt: '2026-03-29T10:00:00.000Z',
      }),
    ])

    const oldBoat = result.assignments.find((assignment) => assignment.boatId === 10)
    const newBoat = result.assignments.find((assignment) => assignment.boatId === 11)

    expect(oldBoat?.supersededByBoatId).toBe(11)
    expect(oldBoat?.dedupeMethod).toBe('exact-source-listing')
    expect(newBoat?.supersededByBoatId).toBeNull()
    expect(result.entities).toHaveLength(1)
    expect(result.entities[0]?.representativeBoatId).toBe(11)
  })

  it('creates one canonical entity for strong cross-site phone matches', () => {
    const result = deriveBoatDedupeState([
      createBoat({
        id: 21,
        source: 'boats.com',
        contactPhone: '772-610-4565',
        contactInfo: 'Please contact Matt Nader at 772-610-4565',
      }),
      createBoat({
        id: 22,
        source: 'yachtworld.com',
        listingId: 'yw-22',
        url: 'https://www.yachtworld.com/yacht/22/',
        contactPhone: '(772) 610-4565',
        contactInfo: 'Matt Nader 772-610-4565',
      }),
    ])

    const left = result.assignments.find((assignment) => assignment.boatId === 21)
    const right = result.assignments.find((assignment) => assignment.boatId === 22)

    expect(left?.entityKey).toBe(right?.entityKey)
    expect(left?.dedupeMethod).toBe('cross-source-contact')
    expect(result.entities).toHaveLength(1)
    expect(result.candidates).toHaveLength(0)
  })

  it('stores borderline pairs as uncertain candidates without merging them', () => {
    const result = deriveBoatDedupeState([
      createBoat({
        id: 31,
        source: 'boats.com',
        contactPhone: null,
        contactInfo: null,
        contactName: 'Chris Thomas',
      }),
      createBoat({
        id: 32,
        source: 'yachtworld.com',
        listingId: 'yw-32',
        url: 'https://www.yachtworld.com/yacht/32/',
        price: '152000',
        contactPhone: null,
        contactInfo: null,
        contactName: 'Chris Thomas',
      }),
    ])

    const left = result.assignments.find((assignment) => assignment.boatId === 31)
    const right = result.assignments.find((assignment) => assignment.boatId === 32)

    expect(left?.entityKey).not.toBe(right?.entityKey)
    expect(result.entities).toHaveLength(2)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.ruleHits).toContain('contact_name_match')
  })

  it('chooses the richest, freshest listing as representative', () => {
    const representative = chooseRepresentativeBoat([
      createBoat({
        id: 41,
        description: 'Short copy.',
        fullText: 'Short brochure.',
        images: ['https://images.example.com/41.jpg'],
        updatedAt: '2026-03-28T10:00:00.000Z',
      }),
      createBoat({
        id: 42,
        description: 'Long copy '.repeat(50),
        fullText: 'Long brochure '.repeat(120),
        images: [
          'https://images.example.com/42-a.jpg',
          'https://images.example.com/42-b.jpg',
          'https://images.example.com/42-c.jpg',
        ],
        updatedAt: '2026-03-29T10:00:00.000Z',
      }),
    ])

    expect(representative.id).toBe(42)
  })
})

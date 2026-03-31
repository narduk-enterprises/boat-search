import { describe, expect, it } from 'vitest'
import {
  consumeRefreshableBoatIdentity,
  createBrowserRunIdentityState,
  hasKnownBoatIdentity,
  normalizeBoatSourceUrl,
  rememberBoatIdentity,
} from '@/shared/sourceIdentity'

describe('source identity', () => {
  it('normalizes urls before comparing them', () => {
    const state = createBrowserRunIdentityState({
      listingIds: [],
      normalizedUrls: ['https://WWW.YACHTWORLD.com/boats/12345/'],
    })

    expect(
      normalizeBoatSourceUrl('https://www.yachtworld.com/boats/12345/?ref=search#gallery'),
    ).toBe('https://www.yachtworld.com/boats/12345')
    expect(
      hasKnownBoatIdentity(state, {
        listingId: null,
        url: 'https://www.yachtworld.com/boats/12345/?ref=search#gallery',
      }),
    ).toBe(true)
  })

  it('matches listing ids and remembers new identities for later pages', () => {
    const state = createBrowserRunIdentityState({
      listingIds: ['abc-123'],
      normalizedUrls: [],
    })

    expect(
      hasKnownBoatIdentity(state, {
        listingId: 'abc-123',
        url: 'https://example.com/listing/abc-123',
      }),
    ).toBe(true)

    expect(
      hasKnownBoatIdentity(state, {
        listingId: 'new-456',
        url: 'https://example.com/listing/new-456',
      }),
    ).toBe(false)

    rememberBoatIdentity(state, {
      listingId: 'new-456',
      url: 'https://example.com/listing/new-456?from=search',
    })

    expect(
      hasKnownBoatIdentity(state, {
        listingId: 'new-456',
        url: 'https://example.com/listing/new-456',
      }),
    ).toBe(true)
  })

  it('refreshes weak existing identities only once per run', () => {
    const state = createBrowserRunIdentityState(
      {
        listingIds: ['abc-123'],
        normalizedUrls: ['https://example.com/listing/abc-123'],
      },
      {
        listingIds: ['abc-123'],
        normalizedUrls: ['https://example.com/listing/abc-123'],
      },
    )

    expect(
      consumeRefreshableBoatIdentity(state, {
        listingId: 'abc-123',
        url: 'https://example.com/listing/abc-123?from=search',
      }),
    ).toBe(true)

    expect(
      consumeRefreshableBoatIdentity(state, {
        listingId: 'abc-123',
        url: 'https://example.com/listing/abc-123?from=search',
      }),
    ).toBe(false)

    expect(
      hasKnownBoatIdentity(state, {
        listingId: 'abc-123',
        url: 'https://example.com/listing/abc-123',
      }),
    ).toBe(true)
  })
})

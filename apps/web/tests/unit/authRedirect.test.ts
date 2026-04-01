import { describe, expect, it } from 'vitest'
import { resolveSafeAuthRedirect } from '~~/app/utils/authRedirect'

describe('resolveSafeAuthRedirect', () => {
  it('allows safe in-app redirects', () => {
    expect(resolveSafeAuthRedirect('/ai-boat-finder', '/account/profile')).toBe('/ai-boat-finder')
    expect(resolveSafeAuthRedirect('/ai-boat-finder?step=guardrails', '/account/profile')).toBe(
      '/ai-boat-finder?step=guardrails',
    )
  })

  it('falls back for unsafe or empty redirects', () => {
    expect(resolveSafeAuthRedirect('https://example.com', '/account/profile')).toBe(
      '/account/profile',
    )
    expect(resolveSafeAuthRedirect('//example.com', '/account/profile')).toBe('/account/profile')
    expect(resolveSafeAuthRedirect('boats-for-sale', '/account/profile')).toBe('/account/profile')
    expect(resolveSafeAuthRedirect(undefined, '/account/profile')).toBe('/account/profile')
  })
})

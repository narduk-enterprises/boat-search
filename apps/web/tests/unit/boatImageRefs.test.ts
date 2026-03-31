import { describe, expect, it } from 'vitest'
import {
  collectR2KeysFromBoatImagesJson,
  isAppHostedBoatImageUrl,
  parseBoatImagesJson,
  r2KeyFromBoatImageUrl,
} from '../../lib/boatImageRefs'

describe('boatImageRefs', () => {
  describe('parseBoatImagesJson', () => {
    it('returns empty for null, invalid JSON, or non-array', () => {
      expect(parseBoatImagesJson(null)).toEqual([])
      expect(parseBoatImagesJson('')).toEqual([])
      expect(parseBoatImagesJson('not json')).toEqual([])
      expect(parseBoatImagesJson('{}')).toEqual([])
      expect(parseBoatImagesJson('["a", 1]')).toEqual(['a'])
    })

    it('keeps string entries only', () => {
      expect(parseBoatImagesJson('["/images/a.jpg", "/images/b.jpg"]')).toEqual([
        '/images/a.jpg',
        '/images/b.jpg',
      ])
    })
  })

  describe('isAppHostedBoatImageUrl', () => {
    it('accepts relative /images/ paths', () => {
      expect(isAppHostedBoatImageUrl('/images/uploads/x.jpg')).toBe(true)
      expect(isAppHostedBoatImageUrl('  /images/foo/bar.webp  ')).toBe(true)
    })

    it('accepts absolute URLs with /images/ path', () => {
      expect(isAppHostedBoatImageUrl('https://boat-search.nard.uk/images/uploads/x.jpg')).toBe(true)
    })

    it('rejects external and non-image paths', () => {
      expect(isAppHostedBoatImageUrl('https://cdn.example.com/pic.jpg')).toBe(false)
      expect(isAppHostedBoatImageUrl('/uploads/x.jpg')).toBe(false)
      expect(isAppHostedBoatImageUrl('')).toBe(false)
      expect(isAppHostedBoatImageUrl('not a url')).toBe(false)
    })
  })

  describe('r2KeyFromBoatImageUrl', () => {
    it('strips /images/ prefix as R2 key', () => {
      expect(r2KeyFromBoatImageUrl('/images/uploads/uuid.jpg')).toBe('uploads/uuid.jpg')
      expect(r2KeyFromBoatImageUrl('https://boat-search.nard.uk/images/boats/123/hero.webp')).toBe(
        'boats/123/hero.webp',
      )
    })

    it('returns null for non-hosted URLs', () => {
      expect(r2KeyFromBoatImageUrl('https://x.com/y')).toBeNull()
    })

    it('decodes path segments', () => {
      expect(r2KeyFromBoatImageUrl('/images/uploads/foo%20bar.jpg')).toBe('uploads/foo bar.jpg')
    })
  })

  describe('collectR2KeysFromBoatImagesJson', () => {
    it('dedupes keys from JSON array', () => {
      expect(
        collectR2KeysFromBoatImagesJson(
          '["/images/a/x.jpg","https://h.com/images/b/y.png","/images/a/x.jpg"]',
        ),
      ).toEqual(['a/x.jpg', 'b/y.png'])
    })
  })
})

import { describe, expect, it } from 'vitest'
import { readImageSource, readLargestSrcsetUrl } from '../../src/content/imageCandidates'

describe('readLargestSrcsetUrl', () => {
  it('returns the URL with the largest width descriptor', () => {
    const srcset =
      'https://cdn.example/a.jpg 200w, https://cdn.example/b.jpg 800w, https://cdn.example/c.jpg 400w'
    expect(readLargestSrcsetUrl(srcset)).toBe('https://cdn.example/b.jpg')
  })

  it('prefers width descriptors over undescribed trailing URLs', () => {
    const srcset = 'https://cdn.example/small.jpg 200w, https://cdn.example/raw.jpg'
    expect(readLargestSrcsetUrl(srcset)).toBe('https://cdn.example/small.jpg')
  })

  it('when no descriptors, prefers the last URL', () => {
    const srcset = 'https://cdn.example/1.jpg, https://cdn.example/2.jpg, https://cdn.example/3.jpg'
    expect(readLargestSrcsetUrl(srcset)).toBe('https://cdn.example/3.jpg')
  })

  it('returns empty string for null or empty', () => {
    expect(readLargestSrcsetUrl(null)).toBe('')
    expect(readLargestSrcsetUrl('')).toBe('')
  })
})

describe('readImageSource', () => {
  it('prefers data-src over src when both are set', () => {
    const img = document.createElement('img')
    img.src = 'https://cdn.example/thumb.jpg?w=200'
    img.setAttribute('data-src', 'https://cdn.example/full.jpg?w=1200')
    expect(readImageSource(img)).toBe('https://cdn.example/full.jpg?w=1200')
  })

  it('uses largest srcset candidate when present', () => {
    const img = document.createElement('img')
    img.src = 'https://cdn.example/fallback.jpg'
    img.setAttribute(
      'srcset',
      'https://cdn.example/a.jpg 320w, https://cdn.example/b.jpg 1024w, https://cdn.example/c.jpg 640w',
    )
    expect(readImageSource(img)).toBe('https://cdn.example/b.jpg')
  })

  it('prefers linked full-resolution image URLs over thumbnail src attributes', () => {
    const link = document.createElement('a')
    link.href = 'https://images.yachtworld.com/detail/viking-52-1.jpg'

    const img = document.createElement('img')
    img.src = 'https://images.yachtworld.com/resize/viking-52-1.jpg?w=320'

    link.append(img)
    document.body.append(link)

    expect(readImageSource(img)).toBe('https://images.yachtworld.com/detail/viking-52-1.jpg')
  })

  it('prefers explicit full-size data attributes before srcset candidates', () => {
    const img = document.createElement('img')
    img.setAttribute('data-large-image', 'https://cdn.example/full.jpg?w=2400')
    img.setAttribute('srcset', 'https://cdn.example/a.jpg 640w, https://cdn.example/b.jpg 1280w')

    expect(readImageSource(img)).toBe('https://cdn.example/full.jpg?w=2400')
  })
})

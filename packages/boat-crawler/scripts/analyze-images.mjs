#!/usr/bin/env node
/**
 * Analyze boats.com page structure to find correct image selectors
 */

import { chromium } from 'playwright'

const testUrl = process.argv[2] || 'https://www.boats.com/power-boats/1998-cabo-express-9963617/'

console.log(`🔍 Analyzing image structure for: ${testUrl}\n`)

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

try {
  await page.goto(testUrl, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  // Analyze image structure
  const analysis = await page.evaluate(() => {
    const results = {
      mainImage: null,
      galleryImages: [],
      allImages: [],
      imageContainers: [],
    }

    // Find main image containers
    const containerSelectors = [
      '.boat-image',
      '.listing-image',
      '.gallery',
      '.photo-gallery',
      '[class*="main-image"]',
      '[class*="primary-image"]',
      '[class*="hero-image"]',
      '[class*="featured-image"]',
      'picture',
      '[data-image]',
      '.image-container',
      '.boat-photos',
      '.listing-photos',
    ]

    for (const selector of containerSelectors) {
      const containers = document.querySelectorAll(selector)
      containers.forEach((container) => {
        const imgs = container.querySelectorAll('img')
        if (imgs.length > 0) {
          results.imageContainers.push({
            selector,
            className: container.className,
            imageCount: imgs.length,
            firstImageSrc: imgs[0].src || imgs[0].getAttribute('data-src'),
          })
        }
      })
    }

    // Find all images and categorize
    const allImgs = document.querySelectorAll('img')
    allImgs.forEach((img, idx) => {
      const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src')
      if (!src || !src.startsWith('http')) return

      // Skip logos, icons, ads
      if (
        src.includes('logo') ||
        src.includes('icon') ||
        src.includes('ad') ||
        src.includes('banner')
      )
        return

      const info = {
        index: idx,
        src: src.substring(0, 100),
        alt: img.alt || '',
        className: img.className || '',
        parentClass: img.parentElement?.className || '',
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      }

      // Identify main image (usually largest, in specific containers)
      if (
        !results.mainImage &&
        (info.width > 400 ||
          info.parentClass.includes('main') ||
          info.parentClass.includes('hero') ||
          info.parentClass.includes('featured'))
      ) {
        results.mainImage = info
      }

      // Gallery images (usually multiple similar-sized images)
      if (info.width > 200 && info.width < 2000) {
        results.galleryImages.push(info)
      }

      results.allImages.push(info)
    })

    return results
  })

  console.log('📊 Image Analysis Results:\n')
  console.log('Image Containers Found:')
  analysis.imageContainers.forEach((container, i) => {
    console.log(`  ${i + 1}. ${container.selector} (${container.imageCount} images)`)
    console.log(`     Class: ${container.className}`)
    console.log(`     First image: ${container.firstImageSrc?.substring(0, 80)}...`)
  })

  console.log(`\nMain Image:`)
  if (analysis.mainImage) {
    console.log(`  Src: ${analysis.mainImage.src}...`)
    console.log(`  Alt: ${analysis.mainImage.alt}`)
    console.log(`  Size: ${analysis.mainImage.width}x${analysis.mainImage.height}`)
  } else {
    console.log('  Not found')
  }

  console.log(`\nGallery Images: ${analysis.galleryImages.length}`)
  analysis.galleryImages.slice(0, 3).forEach((img, i) => {
    console.log(`  ${i + 1}. ${img.src}... (${img.width}x${img.height})`)
  })

  console.log(`\nTotal Images Found: ${analysis.allImages.length}`)
} catch (error) {
  console.error('Error:', error.message)
} finally {
  await browser.close()
}

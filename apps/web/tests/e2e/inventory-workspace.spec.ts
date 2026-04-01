import { expect, test, waitForBaseUrlReady, waitForHydration, warmUpApp } from './fixtures'

test.describe('inventory workspace', () => {
  test.beforeAll(async ({ browser, baseURL }) => {
    if (!baseURL) {
      throw new Error('Inventory E2E tests require Playwright baseURL to be configured.')
    }

    await waitForBaseUrlReady(baseURL)
    await warmUpApp(browser, baseURL, '/boats-for-sale')
  })

  test('desktop list view uses one sticky action rail and auto-applies filters', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.goto('/boats-for-sale')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    const header = page.getByTestId('boat-inventory-action-header')
    await expect(header).toBeVisible()
    await expect(page.getByRole('heading', { name: /Boats for sale/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Search$/i })).toHaveCount(0)
    await expect(header.getByRole('link', { name: /^Map$/i })).toHaveCount(1)
    await expect(header.getByRole('button', { name: /^Filters(?: \(\d+\))?$/ })).toHaveCount(1)

    await header.getByRole('button', { name: /^Filters(?: \(\d+\))?$/ }).click()
    const panel = page.getByTestId('boat-inventory-filters-panel')
    await expect(panel).toBeVisible()
    await expect(page.getByRole('button', { name: /Apply filters|Show results/i })).toHaveCount(0)

    await panel.getByRole('button', { name: 'Under $50k', exact: true }).click()
    await expect(page).toHaveURL(/maxPrice=50000/)

    await panel.getByPlaceholder('Sea Ray, diesel, flybridge…').fill('diesel')
    await expect(page).toHaveURL(/q=diesel/)

    await panel.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(page).not.toHaveURL(/maxPrice=50000/)
    await expect(page).not.toHaveURL(/q=diesel/)
  })

  test('guest AI Boat Finder entry routes to sign-up with redirect preserved', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)

    await page.locator('main').getByRole('link', { name: 'AI Boat Finder', exact: true }).click()
    await expect(page).toHaveURL(/\/register\?redirect=(%2F|\/)ai-boat-finder/)
  })

  test('map view reuses the sticky action rail with a list toggle', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.goto('/boats-for-sale/map')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    const header = page.getByTestId('boat-inventory-action-header')
    await expect(header).toBeVisible()
    await expect(header.getByRole('link', { name: /^List$/i })).toHaveCount(1)
    await expect(header.getByRole('button', { name: /^Filters(?: \(\d+\))?$/ })).toHaveCount(1)
    await expect(page.getByRole('heading', { name: /Boats for sale map/i })).toHaveCount(0)
  })

  test('top navigation preserves inventory filters between list and map', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.goto('/boats-for-sale?make=Sea%20Ray&maxPrice=50000')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')

    const desktopNav = page.locator('.brand-header-center')

    await desktopNav.getByRole('link', { name: 'Map', exact: true }).click()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/boats-for-sale/map')
    await expect.poll(() => new URL(page.url()).searchParams.get('make')).toBe('Sea Ray')
    await expect.poll(() => new URL(page.url()).searchParams.get('maxPrice')).toBe('50000')

    await desktopNav.getByRole('link', { name: 'Live inventory', exact: true }).click()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/boats-for-sale')
    await expect.poll(() => new URL(page.url()).searchParams.get('make')).toBe('Sea Ray')
    await expect.poll(() => new URL(page.url()).searchParams.get('maxPrice')).toBe('50000')
    await expect.poll(() => new URL(page.url()).hash).toBe('#inventory-results')
  })

  test('mobile inventory uses the same top rail without duplicate bottom controls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/boats-for-sale')
    await waitForHydration(page)
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo({ top: 900 }))

    const header = page.getByTestId('boat-inventory-action-header')
    await expect(header).toBeVisible()
    await expect(header.getByRole('link', { name: /^Map$/i })).toHaveCount(1)
    await expect(header.getByRole('button', { name: /^Filters(?: \(\d+\))?$/ })).toHaveCount(1)
    await expect(page.getByRole('heading', { name: /Boats for sale/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Search$/i })).toHaveCount(0)
  })
})

import { expect, test, waitForBaseUrlReady, waitForHydration, warmUpApp } from './fixtures'

test.describe('web smoke', () => {
  test.beforeAll(async ({ browser, baseURL }) => {
    if (!baseURL) {
      throw new Error('web smoke tests require Playwright baseURL to be configured.')
    }

    await waitForBaseUrlReady(baseURL)
    await warmUpApp(browser, baseURL)
  })

  test('home page renders the AI finder hero', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)
    await expect(
      page.getByRole('heading', {
        name: /Start with the market, or jump straight to tailored suggestions\./i,
      }),
    ).toBeVisible()
    await expect(page.getByText(/Two paths\. No clutter\./i)).toBeVisible()
    await expect(page).toHaveTitle(/Boat Search \| Live Inventory and AI Boat Suggestions/i)
  })
})

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
        name: /Save one fishing brief and let AI rank the right boats/i,
      }),
    ).toBeVisible()
    await expect(
      page.getByText(/signed-in buyer workflow for fishing and offshore shoppers/i).first(),
    ).toBeVisible()
    await expect(page).toHaveTitle(/AI Fishing Boat Finder/)
  })
})

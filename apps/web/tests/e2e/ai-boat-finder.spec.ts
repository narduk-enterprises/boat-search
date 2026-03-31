import {
  createUniqueEmail,
  expect,
  test,
  waitForBaseUrlReady,
  waitForHydration,
  warmUpApp,
  registerAndLogin,
} from './fixtures'

/**
 * These tests register a fresh user and require the auth backend to return a session
 * immediately (e.g. local auth or Supabase with email confirmation disabled).
 * If signup only queues email confirmation, tests skip so CI/local Supabase setups stay green.
 */
test.describe('AI boat finder stepped flow', () => {
  test.describe.configure({ timeout: 60_000, mode: 'parallel' })

  test.beforeAll(async ({ browser, baseURL }) => {
    if (!baseURL) {
      throw new Error('Playwright baseURL is required for AI boat finder E2E.')
    }
    await waitForBaseUrlReady(baseURL)
    await warmUpApp(browser, baseURL, '/')
  })

  async function registerAndEnterFinder(page: import('@playwright/test').Page, path: string) {
    await page.goto('/register')
    await waitForHydration(page)
    const email = createUniqueEmail('boat-finder')
    await registerAndLogin(page, {
      name: 'Boat Finder',
      email,
      password: 'password123',
    })
    await page.goto(path)
    await waitForHydration(page)
    if (page.url().includes('/login')) {
      return false
    }
    await expect(page.getByTestId('boat-finder-wizard')).toBeVisible({ timeout: 30_000 })
    return true
  }

  async function advanceWizardUntil(
    page: import('@playwright/test').Page,
    expectedUrl: RegExp,
    attempts = 3,
  ) {
    const next = page.getByTestId('boat-finder-step-next')

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (expectedUrl.test(page.url())) return
      await next.click()

      try {
        await expect(page).toHaveURL(expectedUrl, { timeout: 5_000 })
        return
      } catch {
        continue
      }
    }

    await expect(page).toHaveURL(expectedUrl, { timeout: 5_000 })
  }

  test('step query and section nav sync with URL', async ({ page }) => {
    const ok = await registerAndEnterFinder(page, '/ai-boat-finder?step=guardrails')
    test.skip(!ok, 'Registration did not establish a session (e.g. Supabase email confirmation).')

    await expect(page).toHaveURL(/step=guardrails/, { timeout: 5_000 })
    await expect(page).toHaveURL(/[?&]q=\d+/, { timeout: 5_000 })
    await expect(page.getByRole('heading', { name: 'Guardrails', exact: true })).toBeVisible()

    await page.getByRole('tab', { name: /Mission/i }).click()
    await expect(page).toHaveURL(/step=mission/, { timeout: 5_000 })
    await expect(page).toHaveURL(/[?&]q=\d+/, { timeout: 5_000 })

    for (let questionIndex = 2; questionIndex <= 7; questionIndex++) {
      await advanceWizardUntil(page, new RegExp(`[?&]q=${questionIndex}(?:&|$)`))
    }
    await advanceWizardUntil(page, /step=guardrails/)
  })

  test('minimum answers enable finish → summary → generate reaches search', async ({ page }) => {
    const ok = await registerAndEnterFinder(page, '/ai-boat-finder')
    test.skip(!ok, 'Registration did not establish a session (e.g. Supabase email confirmation).')

    await expect(page.getByTestId('boat-finder-finish-submit')).toHaveCount(0)
    await expect(page.getByTestId('boat-finder-jump-blockers')).toBeVisible()

    await page.getByRole('button', { name: 'Weekend offshore trips', exact: true }).click()
    await advanceWizardUntil(page, /[?&]q=2(?:&|$)/)
    await page.getByRole('button', { name: 'Western Gulf (TX / LA)', exact: true }).click()
    await advanceWizardUntil(page, /[?&]q=3(?:&|$)/)
    await page.getByRole('button', { name: 'Half-day drive', exact: true }).click()

    await page.getByRole('tab', { name: /Guardrails/i }).click()
    await expect(page).toHaveURL(/step=guardrails/, { timeout: 5_000 })

    await page.getByLabel(/Budget ceiling/i).fill('350000')

    await expect(page.getByTestId('boat-finder-optional-resume')).toBeVisible()
    const finishBtn = page.getByTestId('boat-finder-finish-submit')
    await expect(finishBtn).toBeVisible()
    await expect(finishBtn).toBeEnabled()

    await finishBtn.click()
    await expect(page).toHaveURL(/\/ai-boat-finder\/summary/)
    await expect(page.getByTestId('boat-finder-summary-shell')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('boat-finder-summary-generate').click()
    await expect(page).toHaveURL(/\/search\?.*sessionId=/, { timeout: 60_000 })
  })

  test('last section end stays in wizard; Continue jumps to first shortlist blocker', async ({
    page,
  }) => {
    const ok = await registerAndEnterFinder(page, '/ai-boat-finder?step=anythingElse&q=1')
    test.skip(!ok, 'Registration did not establish a session (e.g. Supabase email confirmation).')

    await expect(page.getByTestId('boat-finder-active-step')).toBeVisible()
    await page.getByTestId('boat-finder-step-next').click()
    await expect(page).not.toHaveURL(/step=brief/)
    await expect(page.getByTestId('boat-finder-brief-view')).toHaveCount(0)
    const next = page.getByTestId('boat-finder-step-next')
    await expect(next).toBeEnabled()
    await expect(next).toContainText(/Complete required fields/i)
    await next.click()
    await expect(page).toHaveURL(/step=(mission|guardrails)/)
  })

  test('legacy step=brief URL normalizes to last questionnaire section', async ({ page }) => {
    const ok = await registerAndEnterFinder(page, '/ai-boat-finder?step=brief')
    test.skip(!ok, 'Registration did not establish a session (e.g. Supabase email confirmation).')

    await expect(page).not.toHaveURL(/step=brief/)
    await expect(page).toHaveURL(/step=anythingElse/)
    await expect(page).toHaveURL(/[?&]q=\d+/)
  })

  /**
   * `boat-finder-page-shell`: layout width must stay stable across mission steps (flex/grid
   * min-width:auto + scrollable/tab intrinsic sizing is guarded via `min-w-0` in app code).
   */
  test('boat-finder-page-shell width stays stable across mission question transitions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })

    const ok = await registerAndEnterFinder(page, '/ai-boat-finder?step=mission&q=2')
    test.skip(!ok, 'Registration did not establish a session (e.g. Supabase email confirmation).')

    const shell = page.getByTestId('boat-finder-page-shell')
    await expect(shell).toBeVisible()

    async function shellWidths() {
      return page.evaluate(() => {
        const el = document.querySelector('[data-testid="boat-finder-page-shell"]')
        if (!el || !(el instanceof HTMLElement)) return null
        const r = el.getBoundingClientRect()
        return {
          offsetWidth: el.offsetWidth,
          rectWidthRounded: Math.round(r.width),
        }
      })
    }

    const tol = 1
    const offsets: number[] = []
    const rectsRounded: number[] = []

    async function recordShell() {
      const m = await shellWidths()
      expect(m, 'boat-finder-page-shell widths').not.toBeNull()
      offsets.push(m!.offsetWidth)
      rectsRounded.push(m!.rectWidthRounded)
    }

    await expect(page.getByTestId('boat-finder-active-step')).toBeVisible()
    await recordShell()

    const next = page.getByTestId('boat-finder-step-next')
    const prev = page.getByTestId('boat-finder-step-prev')

    // Client-side URL updates only — full reloads can change scrollbar metrics and fail this check.
    for (let q = 3; q <= 7; q++) {
      await next.click()
      await expect(page).toHaveURL(new RegExp(`[?&]q=${q}(?:&|$)`))
      await expect(page.getByTestId('boat-finder-active-step')).toBeVisible()
      await recordShell()
    }

    for (let q = 6; q >= 2; q--) {
      await prev.click()
      await expect(page).toHaveURL(new RegExp(`[?&]q=${q}(?:&|$)`))
      await expect(page.getByTestId('boat-finder-active-step')).toBeVisible()
      await recordShell()
    }

    const offsetSpread = Math.max(...offsets) - Math.min(...offsets)
    const rectSpread = Math.max(...rectsRounded) - Math.min(...rectsRounded)
    expect(
      offsetSpread,
      `boat-finder-page-shell offsetWidth must stay stable (samples: ${offsets.join(', ')})`,
    ).toBeLessThanOrEqual(tol)
    expect(
      rectSpread,
      `boat-finder-page-shell rounded getBoundingClientRect().width must stay stable (samples: ${rectsRounded.join(', ')}; offset: ${offsets.join(', ')})`,
    ).toBeLessThanOrEqual(tol)
  })
})

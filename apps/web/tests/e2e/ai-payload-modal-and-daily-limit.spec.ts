import type { Page } from '@playwright/test'
import {
  test,
  expect,
  createUniqueEmail,
  waitForBaseUrlReady,
  waitForHydration,
  warmUpApp,
  registerAndLogin,
} from './fixtures'

/**
 * Tests for the AI payload preview modal and the daily run limit (3/day).
 *
 * These tests register fresh users and require the auth backend to return a
 * session immediately (e.g. local auth or Supabase with email confirmation disabled).
 */
test.describe('AI payload modal & daily run limit', () => {
  test.describe.configure({ timeout: 90_000, mode: 'serial' })

  test.beforeAll(async ({ browser, baseURL }) => {
    if (!baseURL) {
      throw new Error('Playwright baseURL is required for AI payload modal E2E.')
    }
    await waitForBaseUrlReady(baseURL)
    await warmUpApp(browser, baseURL, '/')
  })

  // ─── Helpers ───────────────────────────────────────────────

  /** Register a new user and confirm the session is live. */
  async function registerUser(page: Page) {
    await page.goto('/register')
    await waitForHydration(page)
    const email = createUniqueEmail('payload-modal')
    await registerAndLogin(page, {
      name: 'Payload Modal Tester',
      email,
      password: 'password123',
    })
    return !page.url().includes('/login')
  }

  // Helper to retry API calls that may hit per-isolate rate limits
  async function retryFetch(
    page: Page,
    evalFn: () => Promise<unknown>,
    maxRetries = 3,
  ): Promise<unknown> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await evalFn()
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        if (msg.includes('429') && attempt < maxRetries - 1) {
          await page.waitForTimeout(1000 * (attempt + 1))
          continue
        }
        throw error
      }
    }
    throw new Error('retryFetch: all retries exhausted')
  }

  /**
   * Create a buyer profile via the API and populate it with valid answers
   * so the Generate button is enabled. Returns the profile ID.
   */
  async function createProfileWithAnswers(page: Page): Promise<number> {
    const profile = (await retryFetch(page, () =>
      page.evaluate(async () => {
        const res = await fetch('/api/buyer-profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ name: 'Test Profile' }),
        })
        if (!res.ok) throw new Error(await res.text())
        return res.json()
      }),
    )) as { id: number }
    const profileId = profile.id

    await retryFetch(page, () =>
      page.evaluate(async (id) => {
        const res = await fetch(`/api/buyer-profiles/${id}/activate`, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
        if (!res.ok) throw new Error(await res.text())
      }, profileId),
    )

    const validAnswers = {
      facts: {
        primaryUses: ['Weekend offshore trips'],
        targetWatersOrRegion: 'Western Gulf (TX / LA)',
        travelRadius: 'Half-day drive',
        crewProfile: '',
        familyUsage: [],
        experienceLevel: '',
        usageCadence: '',
        budgetMin: undefined,
        budgetMax: 350000,
        lengthMin: undefined,
        lengthMax: undefined,
        storagePlan: '',
        storagePlanNotes: '',
      },
      preferences: {
        targetSpecies: [],
        boatStyles: [],
        ownershipPriorities: [],
        mustHaves: [],
        dealBreakers: [],
        maintenanceReality: '',
        conditionTolerance: '',
        overnightComfort: '',
        propulsionPreferences: [],
        rangePriority: '',
      },
      reflectiveAnswers: {
        partnerAlignment: '',
        timePressure: '',
        familyFrictionPoints: [],
        ownershipStressors: [],
        dreamVsPractical: '',
      },
      openContextNote: '',
      questionStates: {},
    }

    await retryFetch(page, () =>
      page.evaluate(
        async ({ id, answers }) => {
          const res = await fetch(`/api/buyer-profiles/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ profile: answers }),
          })
          if (!res.ok) throw new Error(await res.text())
        },
        { id: profileId, answers: validAnswers },
      ),
    )

    return profileId
  }

  // ─── Modal Tests (summary page — ssr: false, no hydration issues) ──

  test.describe('Prompt preview modal', () => {
    test('View AI payload button opens modal with all sections and closes', async ({ page }) => {
      const ok = await registerUser(page)
      test.skip(!ok, 'Registration did not establish a session.')

      const profileId = await createProfileWithAnswers(page)
      await page.goto(`/ai-boat-finder/summary?profileId=${profileId}`)
      await waitForHydration(page)
      await expect(page.getByTestId('boat-finder-summary-shell')).toBeVisible({ timeout: 15_000 })

      // Trigger button should be visible
      const triggerButton = page.getByTestId('ai-payload-trigger')
      await expect(triggerButton).toBeVisible({ timeout: 10_000 })
      await expect(triggerButton).toHaveText(/View AI payload/i)

      // Modal should not be open yet
      await expect(page.getByTestId('ai-payload-modal-header')).toHaveCount(0)

      // Open the modal
      await triggerButton.click()

      // Modal header
      const modalHeader = page.getByTestId('ai-payload-modal-header')
      await expect(modalHeader).toBeVisible({ timeout: 5_000 })
      await expect(modalHeader).toContainText('Shortlist AI')

      // Modal body contains all expected payload sections
      const modalBody = page.getByTestId('ai-payload-modal-body')
      await expect(modalBody).toBeVisible()
      await expect(modalBody.getByRole('heading', { name: 'Buyer brief' })).toBeVisible()
      await expect(modalBody.getByRole('heading', { name: 'Hard constraints' })).toBeVisible()
      await expect(modalBody.getByRole('heading', { name: 'Soft preferences' })).toBeVisible()
      await expect(
        modalBody.getByRole('heading', { name: 'Structured filters applied' }),
      ).toBeVisible()
      await expect(modalBody.getByRole('heading', { name: 'Uncertainties' })).toBeVisible()
      await expect(modalBody.getByRole('heading', { name: 'Reflective context' })).toBeVisible()

      // Close button dismisses the modal
      await page.getByTestId('ai-payload-modal-close').click()
      await expect(page.getByTestId('ai-payload-modal-header')).not.toBeVisible({ timeout: 5_000 })
    })

    test('summary page shows daily usage badge with runs remaining', async ({ page }) => {
      const ok = await registerUser(page)
      test.skip(!ok, 'Registration did not establish a session.')

      const profileId = await createProfileWithAnswers(page)
      await page.goto(`/ai-boat-finder/summary?profileId=${profileId}`)
      await waitForHydration(page)
      await expect(page.getByTestId('boat-finder-summary-shell')).toBeVisible({ timeout: 15_000 })

      const usageBadge = page.getByTestId('daily-run-usage')
      await expect(usageBadge).toBeVisible({ timeout: 10_000 })
      await expect(usageBadge).toContainText(/\d+ of \d+ AI runs remaining/i)
    })
  })

  // ─── Daily Run Limit API Tests (no page navigation needed) ──

  test.describe('Daily run limit', () => {
    test('fresh user has 3 runs remaining via API', async ({ page }) => {
      const ok = await registerUser(page)
      test.skip(!ok, 'Registration did not establish a session.')

      const profileId = await createProfileWithAnswers(page)

      const profileData = await page.evaluate(async (id) => {
        const res = await fetch(`/api/buyer-profiles/${id}`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
        if (!res.ok) throw new Error(await res.text())
        return res.json()
      }, profileId)

      expect(profileData.dailyRunCount).toBe(0)
      expect(profileData.dailyRunLimit).toBe(3)
      expect(profileData.runsRemaining).toBe(3)
      expect(profileData.canRunNow).toBe(true)
    })

    test('runs remaining decrements after AI run', async ({ page }) => {
      const ok = await registerUser(page)
      test.skip(!ok, 'Registration did not establish a session.')

      const profileId = await createProfileWithAnswers(page)

      await page.evaluate(async (id) => {
        const res = await fetch('/api/recommendation-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ profileId: id }),
        })
        if (!res.ok) throw new Error(await res.text())
      }, profileId)

      const profileData = await page.evaluate(async (id) => {
        const res = await fetch(`/api/buyer-profiles/${id}`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
        if (!res.ok) throw new Error(await res.text())
        return res.json()
      }, profileId)

      expect(profileData.dailyRunCount).toBe(1)
      expect(profileData.runsRemaining).toBe(2)
    })

    test('server rejects with 429 and canRunNow=false after daily limit exhausted', async ({
      page,
    }) => {
      const ok = await registerUser(page)
      test.skip(!ok, 'Registration did not establish a session.')

      // Create 3 profiles and run one session on each (avoids per-profile cooldown)
      const profiles: number[] = []
      for (let i = 0; i < 3; i++) {
        const pid = await createProfileWithAnswers(page)
        profiles.push(pid)
      }

      for (const id of profiles) {
        await page.evaluate(async (pid) => {
          const res = await fetch('/api/recommendation-sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify({ profileId: pid }),
          })
          if (!res.ok && res.status !== 429) throw new Error(await res.text())
        }, id)
      }

      // Fourth attempt should fail with 429
      const overageProfile = await createProfileWithAnswers(page)
      const result = await page.evaluate(async (pid) => {
        const res = await fetch('/api/recommendation-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ profileId: pid }),
        })
        return { status: res.status, body: await res.json() }
      }, overageProfile)

      expect(result.status).toBe(429)
      expect(result.body.statusMessage).toContain('AI runs')

      // Profile API should reflect the exhausted limit
      const profileData = await page.evaluate(async (id) => {
        const res = await fetch(`/api/buyer-profiles/${id}`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
        if (!res.ok) throw new Error(await res.text())
        return res.json()
      }, profiles[0]!)

      expect(profileData.canRunNow).toBe(false)
      expect(profileData.runsRemaining).toBe(0)
      expect(profileData.dailyRunCount).toBe(3)
    })
  })
})

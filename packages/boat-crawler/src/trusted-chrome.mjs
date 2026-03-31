import { chromium } from 'playwright'

export const chromeExecutablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

function getEnv(name) {
  return process.env[name]?.trim() || ''
}

export function getRequiredChromeProfile() {
  const userDataDir =
    getEnv('TRUSTED_CHROME_USER_DATA_DIR') || getEnv('EXTENSION_E2E_CHROME_USER_DATA_DIR')
  const profileDir =
    getEnv('TRUSTED_CHROME_PROFILE_DIR') || getEnv('EXTENSION_E2E_CHROME_PROFILE_DIR')

  if (!userDataDir || !profileDir) {
    throw new Error(
      'Missing trusted Chrome profile env. Set TRUSTED_CHROME_USER_DATA_DIR and TRUSTED_CHROME_PROFILE_DIR.',
    )
  }

  return { userDataDir, profileDir }
}

export async function openTrustedChromeWindow(url, options = {}) {
  const { waitMs = 3_000 } = options
  const { userDataDir, profileDir } = getRequiredChromeProfile()

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: chromeExecutablePath,
    headless: false,
    viewport: { width: 1600, height: 1200 },
    args: [`--profile-directory=${profileDir}`, '--disable-blink-features=AutomationControlled'],
  })

  const page = context.pages()[0] || (await context.newPage())
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(waitMs)

  return { context, page }
}

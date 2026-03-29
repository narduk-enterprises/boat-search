#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const chromeExecutablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

function getEnv(name) {
  return process.env[name]?.trim() || ''
}

function printUsage() {
  console.log(`Usage:
  node scripts/capture-trusted-page.mjs <url> <output-html-path> [--wait-ms=3000]

Environment:
  TRUSTED_CHROME_USER_DATA_DIR   Chrome user data directory
  TRUSTED_CHROME_PROFILE_DIR     Chrome profile directory name

Fallback env names:
  EXTENSION_E2E_CHROME_USER_DATA_DIR
  EXTENSION_E2E_CHROME_PROFILE_DIR

Example:
  TRUSTED_CHROME_USER_DATA_DIR="$HOME/Library/Application Support/Google/Chrome" \\
  TRUSTED_CHROME_PROFILE_DIR="Profile 1" \\
  node scripts/capture-trusted-page.mjs \\
    'https://www.boats.com/boats-for-sale/?length=40-60&type=fishing' \\
    '../chrome-scraper-extension/tests/fixtures/boats-com/search-ok.html'
`)
}

function getRequiredChromeProfile() {
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

function parseArgs(argv) {
  const positional = []
  let waitMs = 3_000

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      return { help: true, url: '', outputHtmlPath: '', waitMs }
    }

    if (arg.startsWith('--wait-ms=')) {
      const value = Number.parseInt(arg.slice('--wait-ms='.length), 10)
      if (Number.isFinite(value) && value >= 0) {
        waitMs = value
      }
      continue
    }

    positional.push(arg)
  }

  return {
    help: false,
    url: positional[0] || '',
    outputHtmlPath: positional[1] || '',
    waitMs,
  }
}

const args = parseArgs(process.argv.slice(2))

if (args.help || !args.url || !args.outputHtmlPath) {
  printUsage()
  process.exit(args.help ? 0 : 1)
}

const { userDataDir, profileDir } = getRequiredChromeProfile()
const outputHtmlPath = resolve(process.cwd(), args.outputHtmlPath)
const outputMetaPath = outputHtmlPath.replace(/\.html?$/i, '.meta.json')
const outputScreenshotPath = outputHtmlPath.replace(/\.html?$/i, '.png')

const rl = readline.createInterface({ input, output })

let context

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: chromeExecutablePath,
    headless: false,
    viewport: { width: 1600, height: 1200 },
    args: [
      `--profile-directory=${profileDir}`,
      '--disable-blink-features=AutomationControlled',
    ],
  })

  const page = context.pages()[0] || (await context.newPage())

  console.log(`Opening ${args.url}`)
  await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(args.waitMs)

  console.log('\nManual capture flow:')
  console.log('1. Use the opened Chrome window with your trusted profile.')
  console.log('2. Solve any challenge, dismiss cookie banners, and navigate to the exact page state to save.')
  console.log('3. Return here and press Enter to capture the current page HTML.')
  console.log('4. Type "skip" and press Enter to exit without writing files.\n')

  const answer = (await rl.question('Capture current page? [Enter=save, skip=abort] ')).trim()
  if (answer.toLowerCase() === 'skip') {
    console.log('Capture aborted.')
    process.exit(0)
  }

  const [html, title, finalUrl] = await Promise.all([
    page.content(),
    page.title(),
    page.url(),
  ])

  await mkdir(dirname(outputHtmlPath), { recursive: true })
  await writeFile(outputHtmlPath, html, 'utf8')
  await page.screenshot({ path: outputScreenshotPath, fullPage: true })
  await writeFile(
    outputMetaPath,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        requestedUrl: args.url,
        finalUrl,
        title,
        screenshotPath: outputScreenshotPath,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  console.log(`\nSaved HTML: ${outputHtmlPath}`)
  console.log(`Saved screenshot: ${outputScreenshotPath}`)
  console.log(`Saved metadata: ${outputMetaPath}`)
} finally {
  rl.close()
  await context?.close()
}

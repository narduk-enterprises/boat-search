#!/usr/bin/env node

import readline from 'node:readline/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stdin as input, stdout as output } from 'node:process'
import {
  buildConsoleCaptureSnippet,
  countYachtWorldGalleryImages,
  extractYachtWorldDetailUrlsFromHtml,
  mirrorHtmlOutputs,
  saveCapturedPayload,
  waitForClipboardPayload,
  writeClipboard,
} from '../src/fixture-capture.mjs'
import { getFixturePreset, GUIDED_YACHTWORLD_FIXTURE_ORDER } from '../src/fixture-presets.mjs'
import { openTrustedChromeWindow } from '../src/trusted-chrome.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(__dirname, '..')

function printUsage() {
  console.log(`Usage:
  node scripts/capture-yachtworld-console-loop.mjs [--wait-ms=3000] [--timeout-ms=180000] [--poll-ms=750]
    [--search-ok-url=https://...]
    [--search-no-results-url=https://...]
    [--detail-ok-url=https://...]
    [--detail-gallery-noise-url=https://...]

What it does:
  1. Copies the DevTools capture snippet to your clipboard for each YachtWorld fixture step.
  2. Opens a fresh trusted Chrome window on the target URL.
  3. Watches the clipboard until Chrome DevTools copies back a valid capture payload.
  4. Saves HTML + metadata and advances to the next YachtWorld fixture automatically.
`)
}

function parseArgs(argv) {
  const overrides = {
    'search-ok': '',
    'search-no-results': '',
    'detail-ok': '',
    'detail-gallery-noise': '',
  }
  let waitMs = 3_000
  let timeoutMs = 180_000
  let pollIntervalMs = 750

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      return { help: true, overrides, waitMs, timeoutMs, pollIntervalMs }
    }

    if (arg.startsWith('--wait-ms=')) {
      const value = Number.parseInt(arg.slice('--wait-ms='.length), 10)
      if (Number.isFinite(value) && value >= 0) {
        waitMs = value
      }
      continue
    }

    if (arg.startsWith('--timeout-ms=')) {
      const value = Number.parseInt(arg.slice('--timeout-ms='.length), 10)
      if (Number.isFinite(value) && value > 0) {
        timeoutMs = value
      }
      continue
    }

    if (arg.startsWith('--poll-ms=')) {
      const value = Number.parseInt(arg.slice('--poll-ms='.length), 10)
      if (Number.isFinite(value) && value > 0) {
        pollIntervalMs = value
      }
      continue
    }

    const overrideMatch = arg.match(
      /^--(search-ok|search-no-results|detail-ok|detail-gallery-noise)-url=(.+)$/i,
    )
    if (overrideMatch?.[1] && overrideMatch[2]) {
      overrides[overrideMatch[1].toLowerCase()] = overrideMatch[2].trim()
    }
  }

  return {
    help: false,
    overrides,
    waitMs,
    timeoutMs,
    pollIntervalMs,
  }
}

function normalizeYachtWorldUrl(url) {
  try {
    const parsed = new URL(url, 'https://www.yachtworld.com')
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return url.trim()
  }
}

function isYachtWorldSearchUrl(url) {
  return /^https:\/\/www\.yachtworld\.com\/boats-for-sale\//i.test(url)
}

function isYachtWorldDetailUrl(url) {
  return /^https:\/\/www\.yachtworld\.com\/yacht\//i.test(url)
}

function detectNoResultsPage(html) {
  return /no boats match|no results|0 results|no listings found|nothing found/i.test(html)
}

function validateStepPayload(stepId, payload) {
  const warnings = []
  const detailUrls = extractYachtWorldDetailUrlsFromHtml(payload.html)
  const galleryImageCount = countYachtWorldGalleryImages(payload.html)

  if (stepId === 'search-ok') {
    if (!isYachtWorldSearchUrl(payload.page.url)) {
      warnings.push('Captured page is not a YachtWorld search results URL.')
    }
    if (detailUrls.length === 0) {
      warnings.push('Captured search page did not expose any YachtWorld detail links.')
    }
  }

  if (stepId === 'search-no-results') {
    if (!isYachtWorldSearchUrl(payload.page.url)) {
      warnings.push('Captured page is not a YachtWorld search results URL.')
    }
    if (!detectNoResultsPage(payload.html)) {
      warnings.push('Captured page does not look like a no-results YachtWorld search page.')
    }
  }

  if (stepId === 'detail-ok') {
    if (!isYachtWorldDetailUrl(payload.page.url)) {
      warnings.push('Captured page is not a YachtWorld detail URL.')
    }
    if (galleryImageCount === 0) {
      warnings.push('Captured detail page did not expose any YachtWorld gallery images.')
    }
  }

  if (stepId === 'detail-gallery-noise') {
    if (!isYachtWorldDetailUrl(payload.page.url)) {
      warnings.push('Captured page is not a YachtWorld detail URL.')
    }
    if (galleryImageCount === 0) {
      warnings.push('Captured detail page did not expose any YachtWorld gallery images.')
    } else if (galleryImageCount < 3) {
      warnings.push(
        'Captured page has very few gallery images, so it may not be a strong gallery-noise fixture.',
      )
    }
  }

  return warnings
}

async function promptForUrl(rl, stepId, defaultUrl) {
  const label = `${stepId} URL`
  const prompt = defaultUrl
    ? `${label} [Enter to use default, type "skip" to skip]: `
    : `${label} [paste a URL, or type "skip" to skip]: `

  while (true) {
    if (defaultUrl) {
      console.log(`Recommended ${label}: ${defaultUrl}`)
    }

    const answer = (await rl.question(prompt)).trim()
    if (!answer) {
      if (defaultUrl) return defaultUrl
      console.log('A URL is required for this step unless you choose skip.')
      continue
    }

    if (answer.toLowerCase() === 'skip') {
      return null
    }

    const normalized = normalizeYachtWorldUrl(answer)
    if (/^https?:\/\//i.test(normalized)) {
      return normalized
    }

    console.log('Enter a full URL starting with http:// or https://.')
  }
}

async function promptForRetry(rl, reason) {
  const answer = (await rl.question(`${reason} [Enter=retry, skip=skip step, abort=exit]: `))
    .trim()
    .toLowerCase()

  if (answer === 'skip') return 'skip'
  if (answer === 'abort') return 'abort'
  return 'retry'
}

async function promptForValidationDecision(rl, stepId) {
  const answer = (
    await rl.question(
      `Save ${stepId} anyway? [Enter=save, retry=retry, skip=skip step, abort=exit]: `,
    )
  )
    .trim()
    .toLowerCase()

  if (answer === 'retry') return 'retry'
  if (answer === 'skip') return 'skip'
  if (answer === 'abort') return 'abort'
  return 'save'
}

function buildStepOutput(stepId) {
  const preset = getFixturePreset('yachtworld', stepId)
  if (!preset) {
    throw new Error(`Missing YachtWorld fixture preset for ${stepId}.`)
  }

  return {
    outputHtmlPath: resolve(packageDir, preset.outputPath),
    mirrorHtmlOutputs: Array.isArray(preset.mirrorHtmlOutputs) ? preset.mirrorHtmlOutputs : [],
    defaultUrl: preset.defaultUrl || '',
  }
}

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  printUsage()
  process.exit(0)
}

const rl = readline.createInterface({ input, output })
const snippet = buildConsoleCaptureSnippet()
const detectedDetailUrls = []
const capturedUrls = {}

try {
  console.log('Starting the guided YachtWorld fixture capture loop.')
  console.log(
    'Each step copies a DevTools snippet, opens a fresh trusted Chrome window, and waits for the clipboard payload.\n',
  )

  for (const stepId of GUIDED_YACHTWORLD_FIXTURE_ORDER) {
    const preset = buildStepOutput(stepId)
    const stepOverride = args.overrides[stepId] || ''

    let defaultUrl = stepOverride || preset.defaultUrl
    if (stepId === 'detail-ok' && !stepOverride) {
      defaultUrl = detectedDetailUrls[0] || defaultUrl
    }
    if (stepId === 'detail-gallery-noise' && !stepOverride) {
      defaultUrl = detectedDetailUrls.find((url) => url !== capturedUrls['detail-ok']) || defaultUrl
    }

    const requestedUrl = await promptForUrl(rl, stepId, defaultUrl)
    if (!requestedUrl) {
      console.log(`Skipping ${stepId}.\n`)
      continue
    }

    while (true) {
      let context = null

      try {
        await writeClipboard(snippet)
        console.log(`\n${stepId}: copied the capture snippet to your clipboard.`)
        console.log(`Opening a fresh trusted Chrome window at:\n${requestedUrl}\n`)
        ;({ context } = await openTrustedChromeWindow(requestedUrl, { waitMs: args.waitMs }))

        console.log('Next:')
        console.log('1. Use the opened trusted Chrome window.')
        console.log('2. Open DevTools Console.')
        console.log('3. Paste the snippet and press Enter.')
        console.log('4. This script is now watching the clipboard for the captured payload.')

        let lastLoggedState = null
        const payload = await waitForClipboardPayload({
          snippet,
          timeoutMs: args.timeoutMs,
          pollIntervalMs: args.pollIntervalMs,
          onProgress: ({ state, elapsedMs }) => {
            if (state === lastLoggedState) {
              return
            }

            lastLoggedState = state
            if (state === 'snippet') {
              console.log(
                `Waiting for DevTools to overwrite the clipboard with capture JSON... (${Math.round(elapsedMs / 1000)}s)`,
              )
            } else if (state === 'other') {
              console.log(
                `Clipboard changed, but it is not a valid Boat Search payload yet... (${Math.round(elapsedMs / 1000)}s)`,
              )
            }
          },
        })

        const validationWarnings = validateStepPayload(stepId, payload)
        if (validationWarnings.length > 0) {
          console.log(`\nValidation warnings for ${stepId}:`)
          for (const warning of validationWarnings) {
            console.log(`- ${warning}`)
          }

          const resolution = await promptForValidationDecision(rl, stepId)
          if (resolution === 'retry') {
            await context?.close()
            continue
          }
          if (resolution === 'abort') {
            process.exit(1)
          }
          if (resolution === 'skip') {
            await context?.close()
            console.log(`Skipped ${stepId} after validation.\n`)
            break
          }
        }

        const saved = await saveCapturedPayload({
          outputHtmlPath: preset.outputHtmlPath,
          payload,
          requestedUrl,
          validationWarnings,
        })
        const mirroredPaths = await mirrorHtmlOutputs(
          saved.outputHtmlPath,
          preset.mirrorHtmlOutputs,
        )

        console.log(`\nSaved HTML: ${saved.outputHtmlPath}`)
        console.log(`Saved metadata: ${saved.outputMetaPath}`)
        if (mirroredPaths.length > 0) {
          console.log('Mirrored HTML to:')
          for (const mirroredPath of mirroredPaths) {
            console.log(`- ${mirroredPath}`)
          }
        }

        if (stepId === 'search-ok') {
          detectedDetailUrls.splice(
            0,
            detectedDetailUrls.length,
            ...extractYachtWorldDetailUrlsFromHtml(payload.html),
          )
          if (detectedDetailUrls.length > 0) {
            console.log(
              `Detected ${detectedDetailUrls.length} YachtWorld detail URLs for later fixture steps.`,
            )
          }
        }

        capturedUrls[stepId] = payload.page.url
        await context?.close()
        console.log(`Completed ${stepId}.\n`)
        break
      } catch (error) {
        await context?.close()
        console.error(
          `\n${stepId} failed: ${error instanceof Error ? error.message : String(error)}`,
        )
        const resolution = await promptForRetry(rl, `Retry ${stepId}?`)
        if (resolution === 'retry') {
          continue
        }
        if (resolution === 'abort') {
          process.exit(1)
        }
        console.log(`Skipped ${stepId}.\n`)
        break
      }
    }
  }

  console.log('YachtWorld fixture capture loop finished.')
} finally {
  rl.close()
}

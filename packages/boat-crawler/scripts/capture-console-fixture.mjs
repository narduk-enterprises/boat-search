#!/usr/bin/env node

import readline from 'node:readline/promises'
import { basename, resolve } from 'node:path'
import { stdin as input, stdout as output } from 'node:process'
import {
  buildConsoleCaptureSnippet,
  saveCapturedPayload,
  waitForClipboardPayload,
  writeClipboard,
} from '../src/fixture-capture.mjs'

function printUsage() {
  console.log(`Usage:
  node scripts/capture-console-fixture.mjs <output-html-path> [--requested-url=https://...] [--timeout-ms=180000] [--poll-ms=750]

Example:
  node scripts/capture-console-fixture.mjs \\
    ../chrome-scraper-extension/tests/fixtures/boats-com/search-ok.html

What it does:
  1. Copies a fixture-capture snippet to your clipboard.
  2. You paste that snippet into Chrome DevTools on the exact page state you want.
  3. The snippet copies the captured payload back to your clipboard.
  4. This helper waits for valid capture JSON, then writes the HTML and metadata files to disk.

Notes:
  - This fallback captures HTML + metadata only.
  - Visible-page screenshots still need to be captured separately if we decide we need them.
`)
}

function parseArgs(argv) {
  const positional = []
  let requestedUrl = ''
  let timeoutMs = 180_000
  let pollIntervalMs = 750

  for (const arg of argv) {
    if (arg === '--') {
      continue
    }

    if (arg === '--help' || arg === '-h') {
      return { help: true, outputHtmlPath: '', requestedUrl, timeoutMs, pollIntervalMs }
    }

    if (arg.startsWith('--requested-url=')) {
      requestedUrl = arg.slice('--requested-url='.length).trim()
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

    positional.push(arg)
  }

  return {
    help: false,
    outputHtmlPath: positional[0] || '',
    requestedUrl,
    timeoutMs,
    pollIntervalMs,
  }
}

async function readPromptAnswer(rl) {
  if (input.isTTY) {
    return (
      await rl.question('\nPress Enter to start watching the clipboard, or type "skip" to abort: ')
    ).trim()
  }

  const chunks = []
  for await (const chunk of input) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
  }

  return chunks.join('').trim()
}

const args = parseArgs(process.argv.slice(2))

if (args.help || !args.outputHtmlPath) {
  printUsage()
  process.exit(args.help ? 0 : 1)
}

const outputHtmlPath = resolve(process.cwd(), args.outputHtmlPath)
const snippet = buildConsoleCaptureSnippet()
const fixtureLabel = basename(outputHtmlPath).replace(/\.html?$/i, '')
const rl = readline.createInterface({ input, output })

try {
  await writeClipboard(snippet)

  console.log(`Copied the capture snippet to your clipboard for ${fixtureLabel}.`)
  if (args.requestedUrl) {
    console.log(`Requested URL: ${args.requestedUrl}`)
  }
  console.log(`\nNext:`)
  console.log(`1. Open the exact page state you want in trusted Chrome.`)
  console.log(`2. Open DevTools Console.`)
  console.log(`3. Paste the snippet and press Enter.`)
  console.log(`4. This helper will keep polling until the clipboard contains a valid capture payload.`)

  const answer = await readPromptAnswer(rl)
  if (answer.toLowerCase() === 'skip') {
    console.log('Capture aborted.')
    process.exit(0)
  }

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

  const saved = await saveCapturedPayload({
    outputHtmlPath,
    payload,
    requestedUrl: args.requestedUrl,
  })

  console.log(`\nSaved HTML: ${saved.outputHtmlPath}`)
  console.log(`Saved metadata: ${saved.outputMetaPath}`)
  console.log(`No screenshot was captured in clipboard mode.`)
} finally {
  rl.close()
}

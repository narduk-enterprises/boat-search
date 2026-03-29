#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

const execFileAsync = promisify(execFile)

function printUsage() {
  console.log(`Usage:
  node scripts/capture-console-fixture.mjs <output-html-path>

Example:
  node scripts/capture-console-fixture.mjs \\
    ../chrome-scraper-extension/tests/fixtures/boats-com/search-ok.html

What it does:
  1. Copies a fixture-capture snippet to your clipboard.
  2. You paste that snippet into Chrome DevTools on the exact page state you want.
  3. The snippet copies the captured payload back to your clipboard.
  4. This helper writes the HTML and metadata files to disk.

Notes:
  - This fallback captures HTML + metadata only.
  - Visible-page screenshots still need to be captured separately if we decide we need them.
`)
}

function buildDoctypeString() {
  return [
    '(() => {',
    "  const docType = document.doctype",
    "    ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC \"${document.doctype.publicId}\"` : ''}${!document.doctype.publicId && document.doctype.systemId ? ' SYSTEM' : ''}${document.doctype.systemId ? ` \"${document.doctype.systemId}\"` : ''}>`",
    "    : '';",
    "  const payload = {",
    "    schema: 'boat-search-fixture-capture-v1',",
    '    capturedAt: new Date().toISOString(),',
    '    page: {',
    '      url: window.location.href,',
    '      title: document.title,',
    '      host: window.location.host,',
    '      readyState: document.readyState,',
    '      viewport: {',
    '        width: window.innerWidth,',
    '        height: window.innerHeight,',
    '        scrollX: window.scrollX,',
    '        scrollY: window.scrollY,',
    '        scrollWidth: document.documentElement.scrollWidth,',
    '        scrollHeight: document.documentElement.scrollHeight,',
    '        clientWidth: document.documentElement.clientWidth,',
    '        clientHeight: document.documentElement.clientHeight,',
    '      },',
    '    },',
    '    stats: {',
    '      anchorCount: document.links.length,',
    '      imageCount: document.images.length,',
    "      textLength: (document.body?.innerText || '').length,",
    '    },',
    "    html: `${docType}${docType ? '\\n' : ''}${document.documentElement.outerHTML}`,",
    '  };',
    '  const serialized = JSON.stringify(payload);',
    "  if (typeof copy === 'function') {",
    '    copy(serialized);',
    "    console.log('Fixture payload copied to clipboard.', payload);",
    '    return payload;',
    '  }',
    "  if (navigator.clipboard?.writeText) {",
    '    return navigator.clipboard.writeText(serialized).then(() => {',
    "      console.log('Fixture payload copied to clipboard.', payload);",
    '      return payload;',
    '    });',
    '  }',
    "  throw new Error('Clipboard copy is unavailable in this console context.');",
    '})();',
  ].join('\n')
}

async function writeClipboard(text) {
  await new Promise((resolve, reject) => {
    const child = spawn('pbcopy')

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`pbcopy exited with status ${code ?? 'unknown'}.`))
    })

    child.stdin.on('error', reject)
    child.stdin.end(text)
  })
}

async function readClipboard() {
  const { stdout } = await execFileAsync('pbpaste')
  return stdout
}

async function readPromptAnswer(rl) {
  if (input.isTTY) {
    return (await rl.question(
      '\nPress Enter to save from the clipboard, or type "skip" to abort: ',
    )).trim()
  }

  const chunks = []
  for await (const chunk of input) {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'))
  }

  return chunks.join('').trim()
}

function buildMeta(payload, fixtureLabel, outputHtmlPath) {
  return {
    captureMethod: 'devtools-console-clipboard',
    fixtureLabel,
    capturedAt: payload.capturedAt,
    finalUrl: payload.page.url,
    title: payload.page.title,
    host: payload.page.host,
    readyState: payload.page.readyState,
    viewport: payload.page.viewport,
    stats: payload.stats,
    outputHtmlPath,
  }
}

function parseCapturedPayload(rawClipboard) {
  let parsed

  try {
    parsed = JSON.parse(rawClipboard)
  } catch (error) {
    throw new Error(
      `Clipboard did not contain valid capture JSON. ${error instanceof Error ? error.message : ''}`.trim(),
    )
  }

  if (
    !parsed ||
    parsed.schema !== 'boat-search-fixture-capture-v1' ||
    typeof parsed.html !== 'string' ||
    !parsed.html.trim() ||
    !parsed.page ||
    typeof parsed.page.url !== 'string'
  ) {
    throw new Error(
      'Clipboard did not contain a valid fixture payload. Paste and run the copied snippet in DevTools first.',
    )
  }

  return parsed
}

const positionalArgs = process.argv.slice(2).filter((arg) => arg !== '--')
const outputArg = positionalArgs[0]

if (!outputArg || outputArg === '--help' || outputArg === '-h') {
  printUsage()
  process.exit(outputArg ? 0 : 1)
}

const outputHtmlPath = resolve(process.cwd(), outputArg)
const outputMetaPath = outputHtmlPath.replace(/\.html?$/i, '.meta.json')
const fixtureLabel = basename(outputHtmlPath).replace(/\.html?$/i, '')
const snippet = buildDoctypeString()
const rl = readline.createInterface({ input, output })

try {
  await writeClipboard(snippet)

  console.log(`Copied the capture snippet to your clipboard.`)
  console.log(`\nNext:`)
  console.log(`1. Open the exact page state you want in trusted Chrome.`)
  console.log(`2. Open DevTools Console.`)
  console.log(`3. Paste the snippet and press Enter.`)
  console.log(`4. Return here once the console says the payload was copied.`)

  const answer = await readPromptAnswer(rl)
  if (answer.toLowerCase() === 'skip') {
    console.log('Capture aborted.')
    process.exit(0)
  }

  const clipboardText = await readClipboard()
  const payload = parseCapturedPayload(clipboardText)

  await mkdir(dirname(outputHtmlPath), { recursive: true })
  await writeFile(outputHtmlPath, payload.html, 'utf8')
  await writeFile(
    outputMetaPath,
    `${JSON.stringify(buildMeta(payload, fixtureLabel, outputHtmlPath), null, 2)}\n`,
    'utf8',
  )

  console.log(`\nSaved HTML: ${outputHtmlPath}`)
  console.log(`Saved metadata: ${outputMetaPath}`)
  console.log(`No screenshot was captured in clipboard mode.`)
} finally {
  rl.close()
}

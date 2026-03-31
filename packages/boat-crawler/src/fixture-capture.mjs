import { execFile, spawn } from 'node:child_process'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const CAPTURE_PAYLOAD_SCHEMA = 'boat-search-fixture-capture-v1'

export function buildConsoleCaptureSnippet() {
  return [
    '(() => {',
    '  const docType = document.doctype',
    "    ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC \"${document.doctype.publicId}\"` : ''}${!document.doctype.publicId && document.doctype.systemId ? ' SYSTEM' : ''}${document.doctype.systemId ? ` \"${document.doctype.systemId}\"` : ''}>`",
    "    : '';",
    '  const payload = {',
    `    schema: '${CAPTURE_PAYLOAD_SCHEMA}',`,
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
    '  if (navigator.clipboard?.writeText) {',
    '    return navigator.clipboard.writeText(serialized).then(() => {',
    "      console.log('Fixture payload copied to clipboard.', payload);",
    '      return payload;',
    '    });',
    '  }',
    "  throw new Error('Clipboard copy is unavailable in this console context.');",
    '})();',
  ].join('\n')
}

export async function writeClipboard(text) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('pbcopy')

    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`pbcopy exited with status ${code ?? 'unknown'}.`))
    })

    child.stdin.on('error', rejectPromise)
    child.stdin.end(text)
  })
}

export async function readClipboard() {
  const { stdout } = await execFileAsync('pbpaste')
  return stdout
}

function normalizeClipboardText(value) {
  return String(value || '')
    .replaceAll(/\r\n/g, '\n')
    .trim()
}

export function parseCapturedPayload(rawClipboard) {
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
    parsed.schema !== CAPTURE_PAYLOAD_SCHEMA ||
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

export function classifyClipboardContent(rawClipboard, snippet) {
  const normalizedClipboard = normalizeClipboardText(rawClipboard)
  const normalizedSnippet = normalizeClipboardText(snippet)

  if (!normalizedClipboard) {
    return { state: 'empty', payload: null }
  }

  if (normalizedClipboard === normalizedSnippet) {
    return { state: 'snippet', payload: null }
  }

  try {
    return {
      state: 'payload',
      payload: parseCapturedPayload(rawClipboard),
    }
  } catch {
    return { state: 'other', payload: null }
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms)
  })
}

export async function waitForClipboardPayload({
  snippet,
  timeoutMs = 180_000,
  pollIntervalMs = 750,
  readClipboardImpl = readClipboard,
  onProgress,
} = {}) {
  const startedAt = Date.now()
  let attempts = 0
  let lastState = 'empty'

  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1
    const rawClipboard = await readClipboardImpl()
    const current = classifyClipboardContent(rawClipboard, snippet)

    if (current.state === 'payload' && current.payload) {
      return current.payload
    }

    lastState = current.state
    onProgress?.({
      attempts,
      elapsedMs: Date.now() - startedAt,
      state: current.state,
    })

    await sleep(pollIntervalMs)
  }

  if (lastState === 'snippet') {
    throw new Error(
      'Timed out waiting for the captured payload. The clipboard still contains the injected snippet, so DevTools has not copied the page payload back yet.',
    )
  }

  if (lastState === 'other') {
    throw new Error(
      'Timed out waiting for the captured payload. The clipboard changed, but it never became a valid Boat Search capture payload.',
    )
  }

  throw new Error('Timed out waiting for the captured payload on the clipboard.')
}

export async function saveCapturedPayload({
  outputHtmlPath,
  payload,
  requestedUrl = '',
  captureMethod = 'devtools-console-clipboard',
  validationWarnings = [],
}) {
  const resolvedOutputHtmlPath = resolve(process.cwd(), outputHtmlPath)
  const outputMetaPath = resolvedOutputHtmlPath.replace(/\.html?$/i, '.meta.json')

  await mkdir(dirname(resolvedOutputHtmlPath), { recursive: true })
  await writeFile(resolvedOutputHtmlPath, payload.html, 'utf8')
  await writeFile(
    outputMetaPath,
    `${JSON.stringify(
      {
        captureMethod,
        fixtureLabel:
          resolvedOutputHtmlPath
            .split('/')
            .pop()
            ?.replace(/\.html?$/i, '') || null,
        capturedAt: payload.capturedAt,
        requestedUrl: requestedUrl || payload.page.url,
        finalUrl: payload.page.url,
        title: payload.page.title,
        host: payload.page.host,
        readyState: payload.page.readyState,
        viewport: payload.page.viewport,
        stats: payload.stats,
        validationWarnings,
        outputHtmlPath: resolvedOutputHtmlPath,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  return {
    outputHtmlPath: resolvedOutputHtmlPath,
    outputMetaPath,
  }
}

export async function mirrorHtmlOutputs(primaryOutputPath, mirrorOutputPaths = []) {
  const mirroredPaths = []

  for (const mirrorOutputPath of mirrorOutputPaths) {
    const resolvedMirrorPath = resolve(process.cwd(), mirrorOutputPath)
    await mkdir(dirname(resolvedMirrorPath), { recursive: true })
    await copyFile(primaryOutputPath, resolvedMirrorPath)
    mirroredPaths.push(resolvedMirrorPath)
  }

  return mirroredPaths
}

export function extractYachtWorldDetailUrlsFromHtml(html) {
  const matches = html.matchAll(/(?:https:\/\/www\.yachtworld\.com)?(\/yacht\/[^"'?#\s>]+\/?)/gi)
  const urls = new Set()

  for (const match of matches) {
    const rawPath = match[1]
    if (!rawPath) continue

    try {
      const url = new URL(rawPath, 'https://www.yachtworld.com')
      url.hash = ''
      url.search = ''
      const normalizedPath = url.pathname.replace(/\/+$/, '')
      urls.add(`https://www.yachtworld.com${normalizedPath}/`)
    } catch {
      // Ignore malformed hrefs in fixture HTML.
    }
  }

  return [...urls]
}

export function countYachtWorldGalleryImages(html) {
  const matches = html.matchAll(
    /<img[^>]+src=(["'])(https:\/\/images\.yachtworld\.com\/[^"']+)\1/gi,
  )
  const urls = new Set()

  for (const match of matches) {
    if (match[2]) {
      urls.add(match[2])
    }
  }

  return urls.size
}

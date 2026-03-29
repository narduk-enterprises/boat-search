#!/usr/bin/env node

import { copyFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { getFixturePreset } from '../src/fixture-presets.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageDir = resolve(__dirname, '..')

function printUsage() {
  console.log(`Usage:
  node scripts/capture-fixture-preset.mjs <site> <fixture> [--url=https://...] [--trusted] [--dry-run]

Sites:
  boats-com
  yachtworld

Fixtures:
  search-ok
  search-no-results
  detail-ok
  detail-gallery-noise (yachtworld only)

Examples:
  node scripts/capture-fixture-preset.mjs yachtworld search-ok
  node scripts/capture-fixture-preset.mjs yachtworld search-ok --url='https://www.yachtworld.com/boats-for-sale/condition-used/type-power/class-power-saltwater-fishing/price-100000,500000/'
  node scripts/capture-fixture-preset.mjs yachtworld search-ok --trusted --url='https://www.yachtworld.com/boats-for-sale/condition-used/type-power/class-power-saltwater-fishing/price-100000,500000/'

Default mode:
  Uses the DevTools clipboard capture flow so you can drive a trusted Chrome tab manually.

Trusted mode:
  Launches the existing trusted-profile capture helper and requires --url plus the trusted Chrome env vars.
`)
}

function parseArgs(argv) {
  const positional = []
  let url = ''
  let trusted = false
  let dryRun = false

  for (const arg of argv) {
    if (arg === '--') {
      continue
    }

    if (arg === '--help' || arg === '-h') {
      return { help: true, site: '', fixture: '', url, trusted, dryRun }
    }

    if (arg === '--trusted') {
      trusted = true
      continue
    }

    if (arg === '--dry-run') {
      dryRun = true
      continue
    }

    if (arg.startsWith('--url=')) {
      url = arg.slice('--url='.length).trim()
      continue
    }

    positional.push(arg)
  }

  return {
    help: false,
    site: positional[0] || '',
    fixture: positional[1] || '',
    url,
    trusted,
    dryRun,
  }
}

async function mirrorHtmlOutputs(primaryOutputPath, mirrorOutputPaths) {
  const mirroredPaths = []

  for (const mirrorOutputPath of mirrorOutputPaths) {
    const resolvedMirrorPath = resolve(packageDir, mirrorOutputPath)
    await mkdir(dirname(resolvedMirrorPath), { recursive: true })
    await copyFile(primaryOutputPath, resolvedMirrorPath)
    mirroredPaths.push(resolvedMirrorPath)
  }

  return mirroredPaths
}

function runNodeScript(scriptPath, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: packageDir,
      env: process.env,
      ...options,
    })

    child.on('error', rejectPromise)
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise()
        return
      }

      rejectPromise(new Error(`${scriptPath} exited with status ${code ?? 'unknown'}.`))
    })
  })
}

const args = parseArgs(process.argv.slice(2))

if (args.help || !args.site || !args.fixture) {
  printUsage()
  process.exit(args.help ? 0 : 1)
}

const preset = getFixturePreset(args.site, args.fixture)

if (!preset) {
  console.error(`Unsupported fixture preset: ${args.site} ${args.fixture}`)
  printUsage()
  process.exit(1)
}

const resolvedOutputPath = resolve(packageDir, preset.outputPath)
const resolvedUrl = args.url || preset.defaultUrl || ''
const mirrorHtmlOutputsList = Array.isArray(preset.mirrorHtmlOutputs)
  ? preset.mirrorHtmlOutputs
  : []

if (args.dryRun) {
  console.log(
    JSON.stringify(
      {
        site: args.site,
        fixture: args.fixture,
        mode: args.trusted ? 'trusted' : 'console',
        outputPath: resolvedOutputPath,
        mirrorHtmlOutputs: mirrorHtmlOutputsList.map((mirrorOutputPath) =>
          resolve(packageDir, mirrorOutputPath),
        ),
        url: resolvedUrl || null,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

if (resolvedUrl) {
  console.log(`Open this page before capturing:\n${resolvedUrl}\n`)
}

if (args.trusted) {
  if (!resolvedUrl) {
    console.error('Trusted mode requires --url so the helper can open the right page.')
    process.exit(1)
  }

  await runNodeScript(resolve(__dirname, 'capture-trusted-page.mjs'), [
    resolvedUrl,
    resolvedOutputPath,
  ])
} else {
  const captureArgs = [resolvedOutputPath]
  if (resolvedUrl) {
    captureArgs.push(`--requested-url=${resolvedUrl}`)
  }
  await runNodeScript(resolve(__dirname, 'capture-console-fixture.mjs'), captureArgs)
}

if (mirrorHtmlOutputsList.length > 0) {
  const mirroredPaths = await mirrorHtmlOutputs(resolvedOutputPath, mirrorHtmlOutputsList)
  console.log(`\nMirrored HTML to:`)
  for (const mirroredPath of mirroredPaths) {
    console.log(`- ${mirroredPath}`)
  }
}

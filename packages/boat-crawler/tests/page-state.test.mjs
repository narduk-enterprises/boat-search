import assert from 'assert/strict'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import test from 'node:test'
import { fileURLToPath } from 'url'
import { classifyBoatsComSignal } from '../src/sources/boats-com.mjs'
import { classifyBoatTraderSignal } from '../src/sources/boattrader.mjs'
import { classifyHullTruthSignal } from '../src/sources/hulltruth.mjs'
import { classifyYachtWorldSignal } from '../src/sources/yachtworld.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadFixture(...parts) {
  const html = readFileSync(join(__dirname, 'fixtures', ...parts), 'utf8')
  return {
    title: html.match(/<title>([^<]+)<\/title>/i)?.[1] || '',
    bodyText: html.replace(/<[^>]+>/g, ' '),
    html,
  }
}

test('boats.com classifier recognizes ok and no-results fixtures', () => {
  assert.equal(
    classifyBoatsComSignal(loadFixture('boats-com', 'search-ok.html'), { isDetail: false }).state,
    'ok',
  )
  assert.equal(
    classifyBoatsComSignal(loadFixture('boats-com', 'no-results.html'), { isDetail: false }).state,
    'no_results',
  )
})

test('BoatTrader classifier recognizes ok and rate-limited fixtures', () => {
  assert.equal(classifyBoatTraderSignal(loadFixture('boattrader', 'search-ok.html')).state, 'ok')
  assert.equal(
    classifyBoatTraderSignal(loadFixture('boattrader', 'rate-limit.html')).state,
    'rate_limited',
  )
})

test('YachtWorld classifier recognizes ok, challenge, and consent fixtures', () => {
  assert.equal(classifyYachtWorldSignal(loadFixture('yachtworld', 'search-ok.html')).state, 'ok')
  assert.equal(
    classifyYachtWorldSignal(loadFixture('yachtworld', 'challenge.html')).state,
    'challenge_or_block',
  )
  assert.equal(
    classifyYachtWorldSignal(loadFixture('yachtworld', 'consent.html')).state,
    'consent_required',
  )
})

test('Hull Truth classifier recognizes ok and block fixtures', () => {
  assert.equal(classifyHullTruthSignal(loadFixture('hulltruth', 'search-ok.html')).state, 'ok')
  assert.equal(
    classifyHullTruthSignal(loadFixture('hulltruth', 'block.html')).state,
    'challenge_or_block',
  )
})

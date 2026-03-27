import assert from 'assert/strict'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import test from 'node:test'
import { CheckpointStore } from '../src/checkpoint-store.mjs'

test('checkpoint store persists queued and processed URLs across reloads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'boat-crawler-checkpoint-'))
  const store = new CheckpointStore({ baseDir: dir, sourceKey: 'boats-com' })

  store.markQueued('https://www.boats.com/search?page=1')
  store.markProcessed('https://www.boats.com/detail/1')
  store.recordStopState({
    pageState: 'challenge_or_block',
    reason: 'blocked',
    url: 'https://www.boats.com/search?page=2',
  })

  const reloaded = new CheckpointStore({ baseDir: dir, sourceKey: 'boats-com' })

  assert.equal(reloaded.hasSeen('https://www.boats.com/search?page=1'), true)
  assert.equal(reloaded.hasProcessed('https://www.boats.com/detail/1'), true)
  assert.equal(reloaded.state.stopStates.length, 1)
})

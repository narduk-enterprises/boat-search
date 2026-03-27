import assert from 'assert/strict'
import test from 'node:test'
import { runAllSources } from '../src/orchestrator.mjs'

test('orchestrator continues after one source stops or fails', async () => {
  const summaries = await runAllSources({
    sourceKeys: ['boats-com', 'yachtworld', 'boattrader'],
    runner: async (sourceKey) => {
      if (sourceKey === 'yachtworld') {
        return {
          sourceKey,
          status: 'stopped',
          stopReason: 'challenge_or_block',
        }
      }

      if (sourceKey === 'boattrader') {
        throw new Error('synthetic failure')
      }

      return {
        sourceKey,
        status: 'completed',
        boatsFound: 10,
        boatsScraped: 8,
      }
    },
  })

  assert.equal(summaries.length, 3)
  assert.deepEqual(
    summaries.map((summary) => summary.status),
    ['completed', 'stopped', 'failed'],
  )
})

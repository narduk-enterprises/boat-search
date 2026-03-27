import { getAllSources } from './source-registry.mjs'
import { runSource } from './source-runner.mjs'

export async function runAllSources({
  sourceKeys = getAllSources().map((source) => source.key),
  env = process.env,
  runner = runSource,
} = {}) {
  const summaries = []

  for (const sourceKey of sourceKeys) {
    try {
      const summary = await runner(sourceKey, env)
      summaries.push(summary)
    } catch (error) {
      summaries.push({
        sourceKey,
        status: 'failed',
        stopReason: error.message,
      })
    }
  }

  return summaries
}

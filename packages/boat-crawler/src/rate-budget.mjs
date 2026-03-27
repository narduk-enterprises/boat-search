import { jitter, sleep } from './utils.mjs'

export class RateBudget {
  constructor(config = {}) {
    this.defaultMinDelayMs = config.defaultMinDelayMs || 1_200
    this.jitterMs = config.jitterMs || 400
    this.overrides = config.overrides || {}
    this.lastRequestAtByHost = new Map()
  }

  async waitForTurn(url) {
    const host = new URL(url).hostname
    const minDelayMs = this.overrides[host] || this.defaultMinDelayMs
    const lastAt = this.lastRequestAtByHost.get(host) || 0
    const nextAllowedAt = lastAt + jitter(minDelayMs, this.jitterMs)
    const waitMs = Math.max(0, nextAllowedAt - Date.now())

    if (waitMs > 0) {
      await sleep(waitMs)
    }

    this.lastRequestAtByHost.set(host, Date.now())
  }
}

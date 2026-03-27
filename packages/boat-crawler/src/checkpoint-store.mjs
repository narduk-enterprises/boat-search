import { join } from 'path'
import { ensureDir, readJsonFile, writeJsonFile } from './utils.mjs'

export class CheckpointStore {
  constructor({ baseDir, sourceKey }) {
    this.baseDir = baseDir
    this.sourceKey = sourceKey
    ensureDir(baseDir)
    this.path = join(baseDir, `${sourceKey}.json`)
    this.state = this.#load()
  }

  #load() {
    const existing = readJsonFile(this.path, null)
    if (existing) {
      return {
        version: 1,
        sourceKey: this.sourceKey,
        queuedUrls: new Set(existing.queuedUrls || []),
        processedUrls: new Set(existing.processedUrls || []),
        stopStates: Array.isArray(existing.stopStates) ? existing.stopStates : [],
        lastJobId: existing.lastJobId || null,
        updatedAt: existing.updatedAt || null,
      }
    }

    return {
      version: 1,
      sourceKey: this.sourceKey,
      queuedUrls: new Set(),
      processedUrls: new Set(),
      stopStates: [],
      lastJobId: null,
      updatedAt: null,
    }
  }

  #save() {
    writeJsonFile(this.path, {
      version: this.state.version,
      sourceKey: this.sourceKey,
      queuedUrls: [...this.state.queuedUrls],
      processedUrls: [...this.state.processedUrls],
      stopStates: this.state.stopStates,
      lastJobId: this.state.lastJobId,
      updatedAt: new Date().toISOString(),
    })
  }

  setLastJobId(jobId) {
    this.state.lastJobId = jobId
    this.#save()
  }

  hasSeen(url) {
    return this.state.queuedUrls.has(url) || this.state.processedUrls.has(url)
  }

  hasProcessed(url) {
    return this.state.processedUrls.has(url)
  }

  markQueued(url) {
    this.state.queuedUrls.add(url)
    this.#save()
  }

  markProcessed(url) {
    this.state.queuedUrls.add(url)
    this.state.processedUrls.add(url)
    this.#save()
  }

  recordStopState(stopState) {
    this.state.stopStates.push({
      ...stopState,
      recordedAt: new Date().toISOString(),
    })
    this.#save()
  }
}

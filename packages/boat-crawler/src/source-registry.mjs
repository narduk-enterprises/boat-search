import { boatsComSource } from './sources/boats-com.mjs'
import { boattraderSource } from './sources/boattrader.mjs'
import { hullTruthSource } from './sources/hulltruth.mjs'
import { yachtWorldSource } from './sources/yachtworld.mjs'

const SOURCES = [boatsComSource, boattraderSource, yachtWorldSource, hullTruthSource]

export function getAllSources() {
  return SOURCES
}

export function getSource(sourceKey) {
  const source = SOURCES.find((entry) => entry.key === sourceKey)
  if (!source) {
    throw new Error(`Unknown crawler source: ${sourceKey}`)
  }

  return source
}

import { describe, expect, it } from 'vitest'
import {
  createEmptyScraperPipelineDraft,
  multilineToList,
  scraperPipelineDraftSchema,
} from '../../lib/scraperPipeline'

describe('scraper pipeline draft schema', () => {
  it('rejects configs without a URL rule', () => {
    const draft = createEmptyScraperPipelineDraft()
    draft.name = 'Test pipeline'
    draft.boatSource = 'boats.com'
    draft.config.startUrls = ['https://example.com/listings']
    draft.config.itemSelector = '.listing'
    draft.config.fields = draft.config.fields.filter((field) => field.key !== 'url')

    const parsed = scraperPipelineDraftSchema.safeParse(draft)

    expect(parsed.success).toBe(false)
  })

  it('requires detail fetching when a field targets detail scope', () => {
    const draft = createEmptyScraperPipelineDraft()
    draft.name = 'Test pipeline'
    draft.boatSource = 'boats.com'
    draft.config.startUrls = ['https://example.com/listings']
    draft.config.itemSelector = '.listing'
    draft.config.fetchDetailPages = false

    const parsed = scraperPipelineDraftSchema.safeParse(draft)

    expect(parsed.success).toBe(false)
  })

  it('normalizes line-separated values for textarea inputs', () => {
    expect(multilineToList(' example.com \n\n boats.com \n')).toEqual(['example.com', 'boats.com'])
  })
})

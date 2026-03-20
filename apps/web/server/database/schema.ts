import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

/**
 * App-specific database schema.
 *
 * Re-exports the layer's base tables (users, sessions, todos) so that
 * drizzle-kit can discover them from this workspace. Add app-specific
 * tables below the re-export.
 */
export * from '#layer/server/database/schema'

// ─── App-Specific Tables ────────────────────────────────────

export const boats = sqliteTable(
  'boats',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    listingId: text('listing_id'),
    source: text('source').notNull().default('boats.com'),
    url: text('url').notNull(),

    // Basic info
    make: text('make'),
    model: text('model'),
    year: integer('year'),
    length: text('length'),
    price: text('price'),
    currency: text('currency').default('USD'),

    // Location
    location: text('location'),
    city: text('city'),
    state: text('state'),
    country: text('country').default('US'),

    // Details
    description: text('description'),
    sellerType: text('seller_type'),
    listingType: text('listing_type'),

    // Images (JSON array stored as text)
    images: text('images'),

    // Metadata
    fullText: text('full_text'),
    scrapedAt: text('scraped_at').notNull(),
    updatedAt: text('updated_at').notNull(),

    // Search criteria (tracking which search found this)
    searchLengthMin: integer('search_length_min'),
    searchLengthMax: integer('search_length_max'),
    searchType: text('search_type'),
    searchLocation: text('search_location'),
  },
  (table) => [
    index('idx_boats_listing_id').on(table.listingId),
    index('idx_boats_url').on(table.url),
    index('idx_boats_make_model').on(table.make, table.model),
    index('idx_boats_year').on(table.year),
    index('idx_boats_price').on(table.price),
    index('idx_boats_state').on(table.state),
  ],
)

export const crawlJobs = sqliteTable('crawl_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  searchUrl: text('search_url').notNull(),
  status: text('status').notNull().default('running'),
  boatsFound: integer('boats_found').default(0),
  boatsScraped: integer('boats_scraped').default(0),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  error: text('error'),
})

export const xaiAnalyses = sqliteTable('xai_analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  boatIds: text('boat_ids'),
  prompt: text('prompt').notNull(),
  response: text('response').notNull(),
  model: text('model').notNull().default('grok-3-mini'),
  category: text('category'),
  tokensUsed: integer('tokens_used'),
  createdAt: text('created_at').notNull(),
})

import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core'

/**
 * App-specific database schema.
 *
 * Re-exports the layer's base tables (users, sessions, todos) so that
 * drizzle-kit can discover them from this workspace. Add app-specific
 * tables below the re-export.
 */
import { users } from '@narduk-enterprises/narduk-nuxt-template-layer/server/database/schema'

export * from '@narduk-enterprises/narduk-nuxt-template-layer/server/database/schema'
export * from './auth-bridge-schema'

export const boats = sqliteTable(
  'boats',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    listingId: text('listing_id'),
    source: text('source').notNull().default('boats.com'),
    url: text('url').notNull(),
    entityId: integer('entity_id'),
    supersededByBoatId: integer('superseded_by_boat_id'),
    dedupeMethod: text('dedupe_method'),
    dedupeConfidence: integer('dedupe_confidence'),
    make: text('make'),
    model: text('model'),
    year: integer('year'),
    length: text('length'),
    price: text('price'),
    currency: text('currency').default('USD'),
    location: text('location'),
    city: text('city'),
    state: text('state'),
    country: text('country').default('US'),
    description: text('description'),
    contactInfo: text('contact_info'),
    contactName: text('contact_name'),
    contactPhone: text('contact_phone'),
    otherDetails: text('other_details'),
    disclaimer: text('disclaimer'),
    features: text('features'),
    electricalEquipment: text('electrical_equipment'),
    electronics: text('electronics'),
    insideEquipment: text('inside_equipment'),
    outsideEquipment: text('outside_equipment'),
    additionalEquipment: text('additional_equipment'),
    propulsion: text('propulsion'),
    engineMake: text('engine_make'),
    engineModel: text('engine_model'),
    engineYearDetail: text('engine_year_detail'),
    totalPower: text('total_power'),
    engineHours: text('engine_hours'),
    engineTypeDetail: text('engine_type_detail'),
    driveType: text('drive_type'),
    fuelTypeDetail: text('fuel_type_detail'),
    propellerType: text('propeller_type'),
    propellerMaterial: text('propeller_material'),
    specifications: text('specifications'),
    cruisingSpeed: text('cruising_speed'),
    maxSpeed: text('max_speed'),
    range: text('range'),
    lengthOverall: text('length_overall'),
    maxBridgeClearance: text('max_bridge_clearance'),
    maxDraft: text('max_draft'),
    minDraftDetail: text('min_draft_detail'),
    beamDetail: text('beam_detail'),
    dryWeight: text('dry_weight'),
    windlass: text('windlass'),
    electricalCircuit: text('electrical_circuit'),
    deadriseAtTransom: text('deadrise_at_transom'),
    hullMaterial: text('hull_material'),
    hullShape: text('hull_shape'),
    keelType: text('keel_type'),
    freshWaterTank: text('fresh_water_tank'),
    fuelTank: text('fuel_tank'),
    holdingTank: text('holding_tank'),
    guestHeads: text('guest_heads'),
    sellerType: text('seller_type'),
    listingType: text('listing_type'),
    images: text('images'),
    sourceImages: text('source_images'),
    fullText: text('full_text'),
    scrapedAt: text('scraped_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    searchLengthMin: integer('search_length_min'),
    searchLengthMax: integer('search_length_max'),
    searchType: text('search_type'),
    searchLocation: text('search_location'),
  },
  (table) => [
    index('idx_boats_listing_id').on(table.listingId),
    index('idx_boats_url').on(table.url),
    index('idx_boats_entity_id').on(table.entityId),
    index('idx_boats_superseded_by_boat_id').on(table.supersededByBoatId),
    index('idx_boats_make_model').on(table.make, table.model),
    index('idx_boats_year').on(table.year),
    index('idx_boats_price').on(table.price),
    index('idx_boats_state').on(table.state),
  ],
)

export const boatEntities = sqliteTable(
  'boat_entities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    representativeBoatId: integer('representative_boat_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_boat_entities_representative').on(table.representativeBoatId)],
)

export const boatDedupeCandidates = sqliteTable(
  'boat_dedupe_candidates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    leftBoatId: integer('left_boat_id').notNull(),
    rightBoatId: integer('right_boat_id').notNull(),
    confidenceScore: integer('confidence_score').notNull(),
    ruleHitsJson: text('rule_hits_json').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_boat_dedupe_candidates_left').on(table.leftBoatId),
    index('idx_boat_dedupe_candidates_right').on(table.rightBoatId),
  ],
)

export const crawlJobs = sqliteTable('crawl_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  searchUrl: text('search_url').notNull(),
  pipelineId: integer('pipeline_id'),
  pipelineName: text('pipeline_name'),
  runMode: text('run_mode').notNull().default('manual'),
  status: text('status').notNull().default('running'),
  boatsFound: integer('boats_found').default(0),
  boatsScraped: integer('boats_scraped').default(0),
  pagesVisited: integer('pages_visited').default(0),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  error: text('error'),
  resultJson: text('result_json'),
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

export const buyerProfiles = sqliteTable('buyer_profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  dataJson: text('data_json').notNull().default('{}'),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

export const savedSearches = sqliteTable(
  'saved_searches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    filterJson: text('filter_json').notNull(),
    frequency: text('frequency').notNull().default('daily'),
    paused: integer('paused', { mode: 'boolean' }).notNull().default(false),
    lastNotifiedAt: text('last_notified_at'),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('idx_saved_searches_user_id').on(table.userId)],
)

export const boatFavorites = sqliteTable(
  'boat_favorites',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    boatId: integer('boat_id')
      .notNull()
      .references(() => boats.id, { onDelete: 'cascade' }),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.boatId] }),
    index('idx_boat_favorites_user_id').on(table.userId),
  ],
)

export const recommendationSessions = sqliteTable(
  'recommendation_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileSnapshotJson: text('profile_snapshot_json').notNull(),
    generatedFilterJson: text('generated_filter_json').notNull(),
    resultSummaryJson: text('result_summary_json').notNull(),
    rankedBoatIdsJson: text('ranked_boat_ids_json').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [index('idx_recommendation_sessions_user_id').on(table.userId, table.createdAt)],
)

export const boatFitSummaries = sqliteTable(
  'boat_fit_summaries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    boatId: integer('boat_id')
      .notNull()
      .references(() => boats.id, { onDelete: 'cascade' }),
    sessionId: integer('session_id').references(() => recommendationSessions.id, {
      onDelete: 'set null',
    }),
    summaryJson: text('summary_json').notNull(),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index('idx_boat_fit_summaries_lookup').on(table.userId, table.boatId, table.createdAt),
    index('idx_boat_fit_summaries_session').on(table.sessionId),
  ],
)

export const scraperPipelines = sqliteTable(
  'scraper_pipelines',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    boatSource: text('boat_source').notNull(),
    description: text('description'),
    configJson: text('config_json').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    lastRunAt: text('last_run_at'),
  },
  (table) => [
    index('idx_scraper_pipelines_active').on(table.active),
    index('idx_scraper_pipelines_source').on(table.boatSource),
  ],
)

import { createAppDatabase } from '#layer/server/utils/database'
import * as d1Schema from '#server/database/schema'
import * as pgSchema from '#server/database/pg-schema'

/**
 * App Drizzle instance (layer + boats, crawl_jobs, xai_analyses).
 * Prefer this over `useDatabase` from the layer so app tables are always in schema.
 */
export const useAppDatabase = createAppDatabase({
  d1: d1Schema,
  pg: pgSchema,
})

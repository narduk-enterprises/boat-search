import { createAppDatabase } from '#layer/server/utils/database'
import * as schema from '~~/server/database/schema'

/**
 * App Drizzle instance (layer + boats, crawl_jobs, xai_analyses).
 * Prefer this over `useDatabase` from the layer so app tables are always in schema.
 */
export const useAppDatabase = createAppDatabase(schema)

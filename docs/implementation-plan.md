# Boat Search — implementation plan

## Data pipeline (in-repo)

| Step | Command | Output |
|------|---------|--------|
| Create SQLite schema | `pnpm run crawler:setup` | `packages/boat-crawler/data/boats.db` |
| Crawl listings | `pnpm run crawler:texas`, `pnpm run crawler:scrape`, or `pnpm run crawler:all` | rows in `boats` + `crawl_jobs` |
| Seed D1 | `pnpm run seed:boats` (or `--production`) | Cloudflare D1 used by `apps/web` |

Scraper sources live under **`packages/boat-crawler/`** (scripts, optional `pnpm run crawler:ui` for the local Express viewer). Respect site terms, robots, and rate limits; crawlers are for local development and controlled ingestion only.

## IA shell (done in repo)

- `app/app.vue` — Boat Search nav (Search, Browse, Guides, Alerts, AI finder), sign-in, footer columns.
- `pages/search` — query-synced filters via `useBoatSearchPage` + `BoatListingCard`.
- Marketing/legal: `boat-alerts`, `ai-boat-finder`, `about`, `faq`, `contact`, `privacy`, `terms`, `boats-for-sale/*` hubs, `best/*`, `guides/*`, `browse`.
- Account stubs (auth middleware): `account/profile`, `saved-searches`, `alerts`, `favorites`, `recommendations`, `settings`.
- `useAppDatabase` + boat APIs migrated off layer-only `useDatabase`.
- Theme: `app.config.ts` primary `blue`; site copy updated in `nuxt.config`.

## Product rollout (summary)

1. **IA shell** — Full route inventory from the product spec with thin pages, global header/footer, `useSeo` + schema per page type; dedicated `/search` (avoid slug collision with `/boats/[id]`); SEO hubs under e.g. `/boats-for-sale/...`; authenticated area under `/account/*`.
2. **Brand & theme** — Nuxt UI tokens + copy aligned to “serious search engine + buyer layer” (not fishing-only).
3. **Persistence** — `useAppDatabase`, Drizzle tables for buyer profile, saved searches, favorites, alert preferences; mutation APIs with rate limits.
4. **Alerts** — Email (provider TBD) + cron/worker job matching new listings to saved searches.
5. **AI** — Refit prompts for fit/tradeoffs; NL → filters; profile-aware listing explanations; PostHog funnel events.
6. **SEO depth** — Hub pages backed by real queries; Product/detail schema when fields are reliable; guides (Nuxt Content optional).

## Priority order (when scope must shrink)

Search results quality → saved search alerts → recommendations → profile loop → boat detail → SEO hubs → visual trust.

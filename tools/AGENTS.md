# AGENTS.md — tools/

These are **Node.js automation scripts** that run locally or in CI. They are
**NOT** deployed to Cloudflare Workers.

> **⚠️ Important:** These scripts use `node:fs`, `node:child_process`, and other
> Node.js built-in modules. This does NOT violate the project's "no Node.js
> modules" constraint — that constraint applies only to `server/` code deployed
> to Workers.

## Scripts

| Script                 | Purpose                                                                                                                                                                           | Usage                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `init.ts`              | Transforms a fresh template clone into a ready-to-deploy app (renames, provisions D1, Doppler, analytics). Prefer the control plane provision API which calls this automatically. | `pnpm run setup -- --name="..." --display="..." --url="..."` |
| `validate.ts`          | Confirms infrastructure is correctly provisioned (D1, Doppler, GitHub secrets)                                                                                                    | `pnpm run validate`                                          |
| `generate-favicons.ts` | Generates all favicon variants (apple-touch-icon, ico, PNG, webmanifest) from a source SVG                                                                                        | `pnpm generate:favicons`                                     |
| `setup-analytics.ts`   | Bootstraps GA4, Google Search Console, and IndexNow                                                                                                                               | Called by `init.ts` or run directly                          |
| `gsc-toolbox.ts`       | Google Search Console API utilities                                                                                                                                               | Used by `setup-analytics.ts`                                 |
| `seed-boats.ts`        | Copy `packages/boat-crawler/data/boats.db` into D1 via wrangler                                                                                                                     | `pnpm run seed:boats` / `pnpm run seed:boats:production`     |

## `packages/boat-crawler/` (Playwright scrapers)

Node-only crawlers (Crawlee + Playwright) for boats.com, YachtWorld, BoatTrader,
and The Hull Truth. They write **`packages/boat-crawler/data/boats.db`**. Run
`pnpm run crawler:setup` once, then e.g. `pnpm run crawler:texas` or
`pnpm run crawler:all`, then `pnpm run seed:boats` to load D1 for `apps/web`.

## vs. `scripts/`

The `scripts/` directory at the repo root contains **shell helper scripts** for
developer convenience (`dev-kill.sh`, `run-dev-auth.sh`). The `tools/` directory
contains **TypeScript automation** for project initialization and
infrastructure.

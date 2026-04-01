# Boat Search — Product Specification

## Product Vision

Boat Search aggregates used fishing boat inventory from public marketplaces and
layers AI-ranked buying intelligence on top. Users create **buyer profiles**
that capture different buying scenarios, then run AI assessments against live
inventory to get ranked shortlists.

## Core User Flow

```
Homepage → Login → AI Boat Profiles (library)
                     ↓
              Create / select profile
                     ↓
              Fill out questionnaire (the "buyer brief")
                     ↓
              Run AI assessment
                     ↓
              View ranked shortlist (inline + shortlist page)
                     ↓
              Open individual listings → Source sites
```

## Navigation Structure

### Top Nav (all users)

- **Live inventory** → `/boats-for-sale`
  - When already inside the inventory workspace, preserves current query state
    and returns to the results anchor when switching back from map view
- **Map** → `/boats-for-sale/map`
  - When already inside the inventory workspace, preserves the current query
    state

### Top Nav (authenticated)

- **AI Boat Profiles** → `/account/profile`

### User Menu (authenticated)

- AI Boat Profiles → `/account/profile`
- Shortlist history → `/search`
- Favorites → `/account/favorites`

### Footer

- **Explore:** Live inventory, Inventory map
- **Buyer tools:** AI Boat Profiles, Shortlist history, Alerts

## Feature: Inventory Workspace (`/boats-for-sale`, `/boats-for-sale/map`)

The public inventory workspace is a shared search surface with two views over
the same route-driven query state.

- Shared filters: vessel mode, vessel subtype, keywords, make, location, min/max
  price, min/max length
- Filters open in a right-side slideover and auto-apply; there is no separate
  "Apply filters" step in the current UI
- Sticky action rail shows results context, reset, sort, filters, active filter
  chips, and the alternate list/map view toggle
- Switching between list and map from either the sticky action rail or the top
  nav preserves the current inventory query state
- List view returns 24 results per page across the full inventory feed
- Map view returns 100 results per page and only includes boats with verified
  coordinates (`geoMode=matched`)
- Both views support shared sort state, pagination, removable filter chips, and
  links to boat detail pages plus original source listings

### Inventory Workspace Behaviors

- **Auto-apply filters:** keyword and numeric inputs debounce; preset chips and
  vessel-lane changes apply immediately
- **List view:** stacked inventory cards with source badge, year, length, seller
  type, description teaser, and CTAs for the Boat Search detail page and the
  original listing
- **Map view:** split layout with a selected-boat sidebar, click-to-select
  result rows, and map pins for coordinate-ready boats
- **Map → list return:** navigating back to `/boats-for-sale` from map view
  lands on the results anchor (`#inventory-results`)

## Feature: AI Boat Profiles

### Library (`/account/profile`)

- Up to 5 named buyer profiles per user
- Each profile is a self-contained buying scenario
- Cards show: name, active badge, last-run timestamp, cooldown state
- Actions: create, rename, duplicate, activate, delete, rerun
- One profile is "active" (used as default context)

### Profile Editor (`/account/profile/[id]`)

- Full questionnaire editor (same fields as the AI Boat Finder wizard)
- Autosave on edit (900ms debounce)
- **AI Run History** section showing past runs for THIS profile
  - Each run: date, ranking method (AI vs fallback), query summary, top pick
  - "View" button links to full shortlist at `/search?sessionId=X`
  - Shows last 5 runs, with "View all" link to global history
- **Run AI assessment** button (saves + runs, stays on page, refreshes history)
- 24-hour cooldown per profile (enforced server-side, shown in UI)

### Cooldown

- 24-hour rolling window per profile
- Enforced server-side (429 response with `nextRunAvailableAt`)
- UI pre-checks and disables "Run AI" button
- Countdown displayed as "Rerun available in Xh Ym"

## Feature: AI Boat Finder (Wizard)

The `/ai-boat-finder` pages still exist as the stepped questionnaire wizard.
They can be accessed via deep link with `?profileId=X`. The wizard:

- Resolves profileId from query param or active profile
- Saves answers to the profile via autosave
- On "Finish", navigates to `/ai-boat-finder/summary`
- After AI generation, navigates back to the profile editor

**Not linked from navigation.** The primary questionnaire editing experience is
the profile editor page. The wizard is a supplementary UX path.

## Feature: Shortlist Page (`/search`)

Displays the full ranked shortlist for a given session. Accessed via:

- `?sessionId=X` query parameter
- "View" buttons from profile run history
- "View shortlist" from recommendation history page

Contains: overview panel, top-pick callout, pursue/pass sections with boat
cards.

## Feature: Recommendation History (`/account/recommendations`)

Global view of all AI runs across all profiles. Each session shows:

- Profile name badge (snapshot from run time)
- Ranking method, query summary, top pick
- "Open shortlist" and "Rerun profile" buttons

## Routes

| Route                      | Access | Purpose                                  |
| -------------------------- | ------ | ---------------------------------------- |
| `/`                        | Public | Landing page with 3 entry points         |
| `/boats-for-sale`          | Public | Inventory workspace list view            |
| `/boats-for-sale/map`      | Public | Inventory workspace map view             |
| `/browse`                  | Public | Browse by budget, make, region, use case |
| `/account/profile`         | Auth   | AI Boat Profiles library                 |
| `/account/profile/[id]`    | Auth   | Profile editor + run history             |
| `/ai-boat-finder`          | Auth   | Stepped questionnaire wizard             |
| `/ai-boat-finder/summary`  | Auth   | Review brief before AI run               |
| `/search`                  | Auth   | View shortlist (sessionId query)         |
| `/account/recommendations` | Auth   | Global run history                       |
| `/account/favorites`       | Auth   | Saved boats                              |
| `/account/alerts`          | Auth   | Boat alerts                              |
| `/boats/[id]`              | Public | Individual boat detail                   |

## Technical Constraints

- **Cloudflare Workers** — all server code runs in V8 isolates
- **D1 SQLite** — via Drizzle ORM
- **Stateless** — no shared in-memory state across requests
- **Nuxt 4 + Nuxt UI 4** — component framework
- **24h cooldown** — per-isolate sliding-window + server timestamp check

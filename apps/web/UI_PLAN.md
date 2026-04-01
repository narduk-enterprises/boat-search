# Boat Search — UI Plan

## Design System

Inherits from `@narduk-enterprises/narduk-nuxt-template-layer`:

- **Nuxt UI 4** component library
- **Tailwind CSS v4** with `@theme` design tokens
- Semantic color tokens (`text-default`, `text-muted`, `bg-elevated`, etc.)
- Glass/card utilities (`.card-base`, `.brand-surface`)
- Lucide icons only (`i-lucide-*`)

## Page Architecture

### Inventory Workspace List (`/boats-for-sale`)

```
┌──────────────────────────────────────────────────────┐
│ Sticky action rail                                  │
│ results label                         [Reset]       │
│ [Map] [Sort] [Filters (N)]                         │
│ active filter chips with inline remove              │
├──────────────────────────────────────────────────────┤
│ BoatInventoryResults                                │
│ ┌─ BoatInventoryListItem ────────────────────────┐  │
│ │ image  source/year/length badges               │  │
│ │ title + location + price                       │  │
│ │ teaser copy                                    │  │
│ │ [Open boat] [Open source]                      │  │
│ └────────────────────────────────────────────────┘  │
│ pagination card (when multiple pages)               │
├──────────────────────────────────────────────────────┤
│ Right slideover: BoatInventoryFilters               │
│ Sort modal: newest / price / year                   │
└──────────────────────────────────────────────────────┘
```

**Key behaviors:**

- Single sticky action rail under the app shell header; no duplicate bottom
  action bar
- Filters auto-apply, with debounced text/numeric inputs and immediate preset
  actions
- Active filter chips can be removed inline from the sticky rail
- View toggle uses the current normalized inventory query so list ↔ map keeps
  the same filters and sort state

### Inventory Workspace Map (`/boats-for-sale/map`)

```
┌──────────────────────────────────────────────────────┐
│ Sticky action rail                                  │
│ map-ready results label                [Reset]      │
│ [List] [Sort] [Filters (N)]                        │
│ active filter chips with inline remove              │
├───────────────────────────────┬──────────────────────┤
│ BoatInventoryMapView sidebar  │ AppMapKit canvas    │
│ selected boat summary card    │ boat pins           │
│ map-ready rows on this page   │ loading / empty     │
│ pagination footer             │ map-ready fallback  │
├───────────────────────────────┴──────────────────────┤
│ Right slideover: BoatInventoryFilters               │
│ Sort modal: newest / price / year                   │
└──────────────────────────────────────────────────────┘
```

**Key behaviors:**

- Only boats with verified coordinates appear in map mode
- Sidebar selection and pin selection stay in sync
- Returning to list view preserves the current query and restores the
  `#inventory-results` anchor
- Top-nav `Live inventory` and `Map` links reuse the same workspace query when
  the user is already inside the inventory workspace

### AI Boat Profiles Library (`/account/profile`)

```
┌─────────────────────────────────────────────┐
│ h1: AI Boat Profiles                        │
│ subtitle: buying scenario explanation       │
│                              [New profile]  │
├─────────────────────────────────────────────┤
│ ┌─ ProfileCard ──────────────────────────┐  │
│ │ Name   [Active badge]   « Edit  [⋯] » │  │
│ │ Updated: date  Last AI: date          │  │
│ │ Cooldown: 22h 15m remaining           │  │
│ │ [✏ Edit]  [▶ Run AI]                  │  │
│ └────────────────────────────────────────┘  │
│ ┌─ ProfileCard ──────────────────────────┐  │
│ │ ...                                    │  │
│ └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Components:**

- `AccountBuyerProfileCard` — card with inline rename, badges, action menu
- `AccountBuyerProfileCreateDialog` — modal for naming new profile

### Profile Editor (`/account/profile/[id]`)

```
┌─────────────────────────────────────────────────┐
│ ← Back   ProfileName  [Active]                  │
│ subtitle: fill out questionnaire, run AI        │
│ ⏰ Cooldown: 22h 15m           [Save] [Run AI]  │
├─────────────────────────────────────────────────┤
│                                                  │
│ ┌─ AI Run History ───────────────────────────┐  │
│ │ AI RANKED  •  Mar 31, 2026, 1:45 PM       │  │
│ │ "Gulf coast center console..."     [View]  │  │
│ │ Top pick: 2023 Yellowfin 36                │  │
│ ├────────────────────────────────────────────┤  │
│ │ FALLBACK  •  Mar 30, 2026, 9:12 AM        │  │
│ │ "Offshore tournament rig..."       [View]  │  │
│ └────────────────────────────────────────────┘  │
│                                                  │
│ ┌─ BuyerAiPromptPreviewCard ─────────────────┐  │
│ │ Buyer brief summary (read-only preview)    │  │
│ └────────────────────────────────────────────┘  │
│                                                  │
│ [Edit full questionnaire ▾]                      │
│ ┌─ BoatFinderProfileFields (collapsed) ──────┐  │
│ │ Mission, fishing type, budget, region...   │  │
│ └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Key behaviors:**

- Autosave on questionnaire changes (900ms debounce)
- "Run AI assessment" saves + runs + stays on page + refreshes run history
- Run history shows last 5 sessions, links to `/search?sessionId=X`
- Cooldown indicator with countdown

### Shortlist Page (`/search?sessionId=X`)

```
┌──────────────────────────────────────────────────┐
│ ┌─ BoatShortlistOverview ─────────────────────┐  │
│ │ h1: "Your working shortlist..."             │  │
│ │ Overview metrics + top pick callout         │  │
│ │ [AI Boat Profiles]  [All run history]       │  │
│ └─────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ BoatRecommendationList ────────────────────┐  │
│ │ §Pursue first: boat cards with fit notes    │  │
│ │ §Pass first: weak-fit boat cards            │  │
│ └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Recommendation History (`/account/recommendations`)

```
┌─────────────────────────────────────────────┐
│ h1: Recommendation history                  │
│              [AI Boat Profiles]             │
├─────────────────────────────────────────────┤
│ ┌─ SessionCard ──────────────────────────┐  │
│ │ [AI ranked] [Profile name] •  date     │  │
│ │ Query summary headline                 │  │
│ │ Top pick: boat name                    │  │
│ │           [Open shortlist] [Rerun]     │  │
│ └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Component Hierarchy

```
app.vue (shell)
├── Header nav: Live inventory | Map | AI Boat Profiles
│   preserves inventory query state when switching list ↔ map in workspace
├── User menu: AI Boat Profiles | Shortlist history | Favorites
└── Footer: Explore + Buyer tools + Company

/boats-for-sale (inventory list)
├── BoatInventoryActionHeader
├── BoatInventoryResults
│   └── BoatInventoryListItem (×N)
├── BoatInventoryFilters (slideover)
└── Sort modal

/boats-for-sale/map (inventory map)
├── BoatInventoryActionHeader
├── BoatInventoryMapView
├── BoatInventoryFilters (slideover)
└── Sort modal

/account/profile (library)
├── AccountBuyerProfileCard (×N)
└── AccountBuyerProfileCreateDialog

/account/profile/[id] (editor)
├── Run History section (UCard per session)
├── BuyerAiPromptPreviewCard
└── BoatFinderProfileFields (collapsible)

/search (shortlist viewer)
├── BoatShortlistOverview
└── BoatRecommendationList
    └── BoatListingCard (×N)
```

## Composable Architecture

| Composable                     | Scope          | Purpose                                           |
| ------------------------------ | -------------- | ------------------------------------------------- |
| `useBoatInventorySearch`       | Inventory      | Shared query-state, fetch, sort, pagination, nav  |
| `useBoatInventoryAutocomplete` | Inventory      | Helper text and autocomplete context for filters  |
| `useBuyerProfiles`             | Library        | List, create, duplicate, activate, delete, rename |
| `useBuyerProfile(id)`          | Single profile | CRUD + run state + cooldown                       |
| `useActiveBuyerProfile`        | App-wide       | Convenience: active profile ID + existence check  |
| `useProfileRunHistory(id)`     | Profile editor | Sessions filtered by profileId                    |
| `useRecommendationSessions`    | App-wide       | All sessions + createSession                      |

## Interaction Patterns

### Inventory Workspace

1. User lands on `/boats-for-sale` or `/boats-for-sale/map`
2. Sticky action rail stays pinned below the app shell header
3. Filters open in a right slideover and update the route query automatically
4. Sort opens in a modal and resets pagination to page 1
5. Switching between list and map from the sticky rail or header nav preserves
   the current inventory query state
6. Map → list navigation restores the results anchor for immediate context

### Create Profile

1. Click "New profile" on library
2. Modal opens → type name → Create
3. Navigates to `/account/profile/[newId]`

### Fill Questionnaire

1. From profile editor, click "Edit full questionnaire"
2. Questionnaire panel expands
3. Answers autosave as user makes changes

### Run AI

1. From profile editor, click "Run AI assessment"
2. Saves current answers → calls `createSession({ profileId })`
3. On success: toast + refresh profile + refresh run history
4. New run appears at top of "AI Run History" section
5. User clicks "View" to open full shortlist in `/search`

### Cooldown

1. After running, "Run AI assessment" button disabled
2. Countdown shown: "Rerun available in Xh Ym"
3. After 24h, button re-enables
4. Server enforces via 429 response if client bypasses check

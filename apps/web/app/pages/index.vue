<script setup lang="ts">
const config = useRuntimeConfig()
const appName = config.public.appName || 'Boat Search'

useSeo({
  title: `${appName} — Find Your Perfect Fishing Boat`,
  description:
    'Search fishing boats 20-60ft across the US. AI-powered market analysis by xAI Grok. Data from boats.com, YachtWorld, and more.',
})
useWebPageSchema({
  name: `${appName} — Fishing Boat Search`,
  description: 'Search fishing boats across the US with AI-powered market analysis.',
})

const { fetchBoats, fetchBoatStats, triggerAnalysis } = useBoats()

// Filters
const makeFilter = ref('')
const minPrice = ref<number | undefined>(undefined)
const maxPrice = ref<number | undefined>(undefined)
const minLength = ref<number | undefined>(undefined)
const maxLength = ref<number | undefined>(undefined)

// Preset chip options
const makeChips = [
  'Hatteras',
  'Viking',
  'Bertram',
  'Grady-White',
  'Boston Whaler',
  'Yellowfin',
  'Contender',
  'Regulator',
  'Sea Hunt',
  'Pursuit',
]
const lengthChips = [
  { label: "20-30'", min: 20, max: 30 },
  { label: "30-40'", min: 30, max: 40 },
  { label: "40-50'", min: 40, max: 50 },
  { label: "50-60'", min: 50, max: 60 },
]
const priceChips = [
  { label: '$50K-150K', min: 50000, max: 150000 },
  { label: '$150K-300K', min: 150000, max: 300000 },
  { label: '$300K-500K', min: 300000, max: 500000 },
  { label: '$500K-1M', min: 500000, max: 1000000 },
]

// Data
const { data: boats, status: boatsStatus } = fetchBoats()
const { data: stats } = fetchBoatStats()

// Computed stat labels
const avgPriceLabel = computed(() =>
  stats.value?.avgPrice ? formatPrice(stats.value.avgPrice) : '—',
)
const priceRangeLabel = computed(() => {
  if (!stats.value?.minPrice || !stats.value?.maxPrice) return '—'
  return `${formatPrice(stats.value.minPrice)} – ${formatPrice(stats.value.maxPrice)}`
})
const totalBoatsLabel = computed(() => String(stats.value?.total || 0))
const uniqueMakesLabel = computed(() => String(stats.value?.uniqueMakes || 0))

// Active chip tracking
const activeLength = computed(() => {
  if (!minLength.value && !maxLength.value) return null
  return lengthChips.find((c) => c.min === minLength.value && c.max === maxLength.value) || null
})
const activePrice = computed(() => {
  if (!minPrice.value && !maxPrice.value) return null
  return priceChips.find((c) => c.min === minPrice.value && c.max === maxPrice.value) || null
})
const hasActiveFilters = computed(() => {
  return !!(
    makeFilter.value ||
    minPrice.value ||
    maxPrice.value ||
    minLength.value ||
    maxLength.value
  )
})

// Analysis
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Grok returns dynamic structured JSON that doesn't fit a static type
const analysisData = ref<any>(null)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- boat map keyed by dynamic IDs from DB
const analysisBoatMap = ref<Record<number, any>>({})
const analysisError = ref<string | null>(null)
const analysisRawFallback = ref<string | null>(null)
const analysisLoading = ref(false)
const analysisCategory = ref('')
const userContext = ref(
  "Me and my buddy want to go in together on a 45-50ft convertible. Our budget is around $400K combined. We want to fish the Gulf — offshore tournaments, tuna, wahoo. We're based in Galveston and need something we can run year-round without breaking the bank on maintenance.",
)
const showPromptPreview = ref(false)

// How it works toggle
const showHowItWorks = ref(false)

// Prompt preview — mirrors what the server will send to Grok
const promptPreview = computed(() => {
  const cat = analysisCategory.value || 'All Fishing Boats'
  const boatCount = boats.value?.length || 0
  const makeFilter_ = makeFilter.value

  let preview = `🤖 SYSTEM PROMPT (Captain's Market Intelligence)\n`
  preview += `Expert offshore fishing boat analyst — 30+ years marine surveyor, yacht broker, tournament captain.\n`
  preview += `Specialties: hull/structural analysis, engine/drivetrain (CAT, MAN, Cummins), market dynamics, fishing capability, cost of ownership.\n`
  preview += `Focus: ${cat}${cat === 'All Fishing Boats' ? ' — cover ALL makes and types' : ''}\n`
  preview += `Response: Market Snapshot → Top Values → Red Flags → Maintenance Reality → Buyer's Playbook → Bottom Line\n`

  preview += `\n📝 USER PROMPT\n`
  preview += `Analyze fishing boats currently for sale across the US.\n\n`
  preview += `Inventory: ~${boatCount} listings\n`

  // Show active filters
  const activeFilters = []
  if (makeFilter_) activeFilters.push(`Make: ${makeFilter_}`)
  if (minLength.value || maxLength.value)
    activeFilters.push(`Length: ${minLength.value || '?'}-${maxLength.value || '?'}ft`)
  if (minPrice.value || maxPrice.value)
    activeFilters.push(
      `Price: $${(minPrice.value || 0).toLocaleString()}-$${(maxPrice.value || 0).toLocaleString()}`,
    )
  if (activeFilters.length) preview += `Active filters: ${activeFilters.join(', ')}\n`

  preview += `\n📊 ENRICHED DATA SENT TO GROK:\n`
  preview += `Each boat listing includes:\n`
  preview += `  • Year, Make, Model, Length, Price, Location, Source\n`
  preview += `  • Truncated description (~300 chars) with condition, engines, features\n`
  preview += `  • Photo count per listing\n`

  // Show sample boats
  if (boats.value && boats.value.length > 0) {
    preview += `\n📋 SAMPLE LISTINGS (first 3 of ${boatCount}):\n`
    for (const b of boats.value.slice(0, 3)) {
      const line = [
        b.year,
        b.make,
        b.model,
        b.length ? `${b.length}ft` : null,
        b.price ? `$${Number(b.price).toLocaleString()}` : null,
        b.location,
      ]
        .filter(Boolean)
        .join(' ')
      preview += `- ${line}\n`
      if (b.description) {
        const desc = String(b.description).slice(0, 150).replaceAll(/\n+/g, ' ').trim()
        preview += `  → ${desc}...\n`
      }
    }
  }

  if (userContext.value) {
    preview += `\n🎯 BUYER'S PERSONAL SITUATION:\n${userContext.value}\n`
    preview += `\n→ Grok will tailor analysis to your specific situation, budget, and plans.`
  } else {
    preview += `\n💡 Add your personal situation above for tailored recommendations.`
  }

  return preview
})

function toggleMakeChip(make: string) {
  makeFilter.value = makeFilter.value === make ? '' : make
  applyFilters()
}

function toggleLengthChip(chip: { min: number; max: number }) {
  if (minLength.value === chip.min && maxLength.value === chip.max) {
    minLength.value = undefined
    maxLength.value = undefined
  } else {
    minLength.value = chip.min
    maxLength.value = chip.max
  }
  applyFilters()
}

function togglePriceChip(chip: { min: number; max: number }) {
  if (minPrice.value === chip.min && maxPrice.value === chip.max) {
    minPrice.value = undefined
    maxPrice.value = undefined
  } else {
    minPrice.value = chip.min
    maxPrice.value = chip.max
  }
  applyFilters()
}

function clearAllFilters() {
  makeFilter.value = ''
  minPrice.value = undefined
  maxPrice.value = undefined
  minLength.value = undefined
  maxLength.value = undefined
  applyFilters()
}

async function applyFilters() {
  const { data } = await fetchBoats({
    make: makeFilter.value || undefined,
    minPrice: minPrice.value,
    maxPrice: maxPrice.value,
    minLength: minLength.value,
    maxLength: maxLength.value,
  })
  boats.value = data.value
}

/**
 * Try to repair truncated JSON from Grok (when response hits token limit mid-string).
 * Closes unterminated strings, arrays, and objects, and strips trailing commas.
 */
function repairTruncatedJSON(raw: string): string {
  let repaired = raw.trim()
  // Close any unterminated string
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length
  if (quoteCount % 2 !== 0) repaired += '"'
  // Strip trailing commas before closing brackets (common in truncated JSON)
  repaired = repaired.replaceAll(/,\s*([}\]])/g, '$1')
  // Close unclosed arrays and objects
  const opens = { '{': 0, '[': 0 }
  const closes = { '}': '{', ']': '[' } as const
  for (const ch of repaired) {
    if (ch === '{' || ch === '[') opens[ch]++
    if (ch === '}' || ch === ']') opens[closes[ch]]--
  }
  for (let i = 0; i < opens['[']; i++) repaired += ']'
  for (let i = 0; i < opens['{']; i++) repaired += '}'
  return repaired
}

/**
 * Sanitize a parsed Grok analysis response — normalize schema violations
 * like bare strings where arrays are expected.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Grok returns dynamic JSON; sanitization normalizes arbitrary shapes
function sanitizeAnalysisResponse(data: any): any {
  // Ensure boatAnalyses is an array
  if (data.boatAnalyses && !Array.isArray(data.boatAnalyses)) {
    data.boatAnalyses = [data.boatAnalyses]
  }

  // Fix each boat analysis entry
  if (Array.isArray(data.boatAnalyses)) {
    for (const ba of data.boatAnalyses) {
      if (ba.prosAndCons) {
        // Wrap bare string pros/cons in arrays
        if (typeof ba.prosAndCons.pros === 'string') {
          ba.prosAndCons.pros = [ba.prosAndCons.pros]
        }
        if (typeof ba.prosAndCons.cons === 'string') {
          ba.prosAndCons.cons = [ba.prosAndCons.cons]
        }
        // Ensure they're always arrays
        if (!Array.isArray(ba.prosAndCons.pros)) ba.prosAndCons.pros = []
        if (!Array.isArray(ba.prosAndCons.cons)) ba.prosAndCons.cons = []
      }
    }
  }

  // Ensure topMakes is an array
  if (data.marketSnapshot?.stats?.topMakes && !Array.isArray(data.marketSnapshot.stats.topMakes)) {
    data.marketSnapshot.stats.topMakes = [data.marketSnapshot.stats.topMakes]
  }

  return data
}

async function runAnalysis() {
  analysisLoading.value = true
  analysisData.value = null
  analysisError.value = null
  analysisRawFallback.value = null
  try {
    const result = await triggerAnalysis({
      category: analysisCategory.value,
      make: makeFilter.value || undefined,
      userContext: userContext.value || undefined,
    })
    analysisBoatMap.value = result.boatMap || {}

    // Always store raw text first so it's never lost
    let raw = result.analysis
    analysisRawFallback.value = raw

    // Strip markdown code fences if present
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    // Try parsing JSON — if truncated, try repair
    try {
      analysisData.value = sanitizeAnalysisResponse(JSON.parse(raw))
    } catch {
      // Attempt to repair truncated JSON
      const repaired = repairTruncatedJSON(raw)
      try {
        analysisData.value = sanitizeAnalysisResponse(JSON.parse(repaired))
      } catch {
        // JSON is too broken to repair — show raw text as fallback
        analysisData.value = null
      }
    }
  } catch (error) {
    analysisError.value = `Error: ${(error as Error).message}`
  } finally {
    analysisLoading.value = false
  }
}

type BadgeColor = 'error' | 'info' | 'primary' | 'secondary' | 'success' | 'warning' | 'neutral'
function getRatingColor(rating: string): BadgeColor {
  const colors: Record<string, BadgeColor> = {
    BUY: 'success',
    CONSIDER: 'info',
    CAUTION: 'warning',
    AVOID: 'error',
  }
  return colors[rating] || 'neutral'
}

function formatPrice(price: number | null) {
  if (!price) return 'Price N/A'
  return `$${price.toLocaleString()}`
}

function getSourceColor(source: string) {
  switch (source) {
    case 'boats.com':
      return 'info'
    case 'yachtworld.com':
      return 'primary'
    case 'boattrader.com':
      return 'success'
    case 'thehulltruth.com':
      return 'warning'
    default:
      return 'neutral'
  }
}

function getSourceLabel(source: string) {
  switch (source) {
    case 'boats.com':
      return 'Boats.com'
    case 'yachtworld.com':
      return 'YachtWorld'
    case 'boattrader.com':
      return 'BoatTrader'
    case 'thehulltruth.com':
      return 'Hull Truth'
    default:
      return source
  }
}
</script>

<template>
  <UPage>
    <!-- Hero -->
    <UPageHero
      title="Find Your Perfect Sportfishing Boat"
      description="Search 40-60ft convertible sportfishing boats across the US. AI-powered market analysis by xAI Grok."
      :ui="{
        title: 'text-4xl sm:text-5xl lg:text-6xl',
        description: 'text-lg sm:text-xl text-muted max-w-2xl',
      }"
    >
      <template #links>
        <div class="flex flex-wrap gap-2">
          <UBadge
            color="primary"
            variant="subtle"
            size="lg"
            label="Hatteras · Viking · Bertram"
            icon="i-lucide-anchor"
          />
          <UBadge
            color="neutral"
            variant="subtle"
            size="lg"
            label="AI-Powered Analysis"
            icon="i-lucide-sparkles"
          />
        </div>
      </template>
    </UPageHero>

    <!-- Stats Dashboard -->
    <UPageSection v-if="stats" :ui="{ wrapper: 'py-6' }">
      <UPageGrid>
        <UPageCard icon="i-lucide-ship" :title="totalBoatsLabel" description="Boats Listed" />
        <UPageCard icon="i-lucide-dollar-sign" :title="avgPriceLabel" description="Average Price" />
        <UPageCard icon="i-lucide-trending-up" :title="priceRangeLabel" description="Price Range" />
        <UPageCard icon="i-lucide-factory" :title="uniqueMakesLabel" description="Boat Makers" />
      </UPageGrid>
    </UPageSection>

    <!-- How It Works -->
    <UPageSection :ui="{ wrapper: 'py-4' }">
      <div class="card-base rounded-xl overflow-hidden">
        <div
          class="flex items-center justify-between p-4 cursor-pointer select-none"
          @click="showHowItWorks = !showHowItWorks"
        >
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-info" class="text-primary text-xl" />
            <h3 class="text-lg font-semibold text-default">How Boat Search Works</h3>
          </div>
          <UIcon
            :name="showHowItWorks ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="text-muted text-lg"
          />
        </div>

        <div v-if="showHowItWorks" class="px-4 pb-6 space-y-6">
          <USeparator />

          <div class="grid gap-6 sm:grid-cols-3">
            <!-- Step 1: Data Collection -->
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <div
                  class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm"
                >
                  1
                </div>
                <h4 class="font-semibold text-default">Data Collection</h4>
              </div>
              <p class="text-sm text-muted">
                Automated scrapers crawl <strong>boats.com</strong>, <strong>YachtWorld</strong>,
                <strong>BoatTrader</strong>, and <strong>The Hull Truth</strong> daily. We use
                Playwright-powered browsers to extract listings for 40-60ft sportfish and
                convertible boats under $1M across the entire US.
              </p>
            </div>

            <!-- Step 2: Filtering & Search -->
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <div
                  class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm"
                >
                  2
                </div>
                <h4 class="font-semibold text-default">Smart Filtering</h4>
              </div>
              <p class="text-sm text-muted">
                Filter by make (Hatteras, Viking, Bertram, Cabo), price range, and length. All
                listings are normalized and deduplicated across sources so you see each boat once
                with the best available data.
              </p>
            </div>

            <!-- Step 3: AI Analysis -->
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <div
                  class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm"
                >
                  3
                </div>
                <h4 class="font-semibold text-default">AI Market Analysis</h4>
              </div>
              <p class="text-sm text-muted">
                <strong>xAI Grok</strong> acts as "Captain's Market Intelligence" — an expert marine
                surveyor who analyzes the full inventory. It identifies top values, red flags,
                engine repower costs, and gives specific negotiation tactics for your target boats.
              </p>
            </div>
          </div>

          <div class="bg-elevated rounded-lg p-4 text-sm text-muted">
            <div class="flex items-start gap-2">
              <UIcon name="i-lucide-sparkles" class="text-primary mt-0.5 shrink-0" />
              <p>
                <strong class="text-default">About the AI:</strong> Grok analyzes real listing data
                with market expertise covering hull construction, engine configurations (CAT, MAN,
                Cummins), maintenance costs ($50K-$100K/year for a 50ft sportfish), repower
                considerations, and resale value trends. It gives bold, opinionated recommendations
                — not generic advice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </UPageSection>

    <!-- Filters -->
    <UPageSection :ui="{ wrapper: 'py-4' }">
      <div class="flex flex-col gap-4">
        <!-- Filter header -->
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-default flex items-center gap-2">
            <UIcon name="i-lucide-sliders-horizontal" class="text-primary" />
            Filters
          </h2>
          <UButton
            v-if="hasActiveFilters"
            label="Clear All"
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            color="neutral"
            @click="clearAllFilters"
          />
        </div>

        <!-- Make chips -->
        <div>
          <p class="text-xs font-medium text-muted mb-2 uppercase tracking-wider">Popular Makes</p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="make in makeChips"
              :key="make"
              :label="make"
              size="xs"
              :variant="makeFilter === make ? 'solid' : 'soft'"
              :color="makeFilter === make ? 'primary' : 'neutral'"
              @click="toggleMakeChip(make)"
            />
          </div>
        </div>

        <!-- Length chips -->
        <div>
          <p class="text-xs font-medium text-muted mb-2 uppercase tracking-wider">Length</p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="chip in lengthChips"
              :key="chip.label"
              :label="chip.label"
              size="xs"
              :variant="activeLength?.label === chip.label ? 'solid' : 'soft'"
              :color="activeLength?.label === chip.label ? 'primary' : 'neutral'"
              @click="toggleLengthChip(chip)"
            />
          </div>
        </div>

        <!-- Price chips -->
        <div>
          <p class="text-xs font-medium text-muted mb-2 uppercase tracking-wider">Price Range</p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="chip in priceChips"
              :key="chip.label"
              :label="chip.label"
              size="xs"
              :variant="activePrice?.label === chip.label ? 'solid' : 'soft'"
              :color="activePrice?.label === chip.label ? 'primary' : 'neutral'"
              @click="togglePriceChip(chip)"
            />
          </div>
        </div>

        <!-- Custom search row -->
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <UFormField label="Search Make">
            <UInput
              v-model="makeFilter"
              placeholder="Any make..."
              icon="i-lucide-search"
              class="w-full"
              @keyup.enter="applyFilters"
            />
          </UFormField>
          <UFormField label="Min Price">
            <UInput
              v-model.number="minPrice"
              type="number"
              placeholder="$0"
              class="w-full"
              @keyup.enter="applyFilters"
            />
          </UFormField>
          <UFormField label="Max Price">
            <UInput
              v-model.number="maxPrice"
              type="number"
              placeholder="$1,000,000"
              class="w-full"
              @keyup.enter="applyFilters"
            />
          </UFormField>
          <UButton
            label="Search"
            icon="i-lucide-search"
            class="w-full sm:w-auto"
            @click="applyFilters"
          />
        </div>
      </div>
    </UPageSection>

    <!-- AI Analysis -->
    <UPageSection :ui="{ wrapper: 'py-4' }">
      <div class="card-base rounded-xl p-6">
        <div class="flex items-center gap-4 mb-4 flex-wrap">
          <div class="flex items-center gap-3 flex-1 min-w-48">
            <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <UIcon name="i-lucide-sparkles" class="text-primary text-xl" />
            </div>
            <div>
              <h3 class="text-lg font-semibold text-default">Captain's Market Intelligence</h3>
              <p class="text-sm text-muted">Expert analysis by xAI Grok</p>
            </div>
          </div>
          <div class="w-full sm:w-48">
            <UInput
              v-model="analysisCategory"
              placeholder="Focus: Hatteras, Viking..."
              class="w-full"
              icon="i-lucide-target"
            />
          </div>
          <UButton
            :label="analysisLoading ? 'Analyzing...' : 'Analyze Market'"
            icon="i-lucide-sparkles"
            color="primary"
            :loading="analysisLoading"
            :disabled="analysisLoading"
            class="w-full sm:w-auto"
            @click="runAnalysis"
          />
        </div>

        <!-- Free-form context -->
        <div class="mt-2">
          <UFormField label="Tell the Captain your situation (optional)">
            <UTextarea
              v-model="userContext"
              placeholder="e.g. Me and my buddy want to go in together on a 45-50ft convertible. Our budget is around $400K combined. We want to fish the Gulf — offshore tournaments, tuna, wahoo. We're based in Galveston and need something we can run year-round without breaking the bank on maintenance..."
              :rows="3"
              class="w-full"
              autoresize
            />
          </UFormField>
        </div>

        <!-- Prompt Preview -->
        <div class="mt-3">
          <div
            class="flex items-center gap-2 cursor-pointer select-none text-sm text-muted hover:text-default transition-fast"
            @click="showPromptPreview = !showPromptPreview"
          >
            <UIcon
              :name="showPromptPreview ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="text-base"
            />
            <UIcon name="i-lucide-eye" class="text-base" />
            <span>Preview what Grok will receive</span>
          </div>
          <div
            v-if="showPromptPreview"
            class="mt-2 bg-muted rounded-lg p-4 text-xs font-mono text-muted whitespace-pre-wrap overflow-x-auto max-h-80 overflow-y-auto"
          >
            {{ promptPreview }}
          </div>
        </div>

        <!-- Analysis Error -->
        <div v-if="analysisError" class="bg-error/10 rounded-lg p-5 mt-4 text-error">
          {{ analysisError }}
        </div>

        <!-- Raw text fallback when JSON couldn't be parsed -->
        <div
          v-if="!analysisData && analysisRawFallback && !analysisLoading"
          class="bg-elevated rounded-lg p-5 mt-4"
        >
          <div class="flex items-center gap-2 mb-3">
            <UBadge label="Raw Response" color="warning" variant="subtle" size="sm" />
            <span class="text-xs text-dimmed"
              >Grok's response was too long to parse as structured data — showing raw text</span
            >
          </div>
          <div class="prose prose-sm max-w-none text-default whitespace-pre-wrap text-sm">
            {{ analysisRawFallback }}
          </div>
        </div>

        <!-- Structured Analysis Results -->
        <div v-if="analysisData" class="mt-6 space-y-6">
          <!-- Market Snapshot -->
          <div v-if="analysisData.marketSnapshot" class="card-base rounded-xl p-6">
            <h3 class="text-xl font-bold text-default flex items-center gap-2">
              <span>🏷️</span> {{ analysisData.marketSnapshot.title || 'Market Snapshot' }}
            </h3>
            <div
              v-if="analysisData.marketSnapshot.stats"
              class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4"
            >
              <div class="bg-muted rounded-lg p-3 text-center">
                <div class="text-xs text-dimmed">Avg Price</div>
                <div class="text-lg font-bold text-primary">
                  {{ analysisData.marketSnapshot.stats.avgPrice }}
                </div>
              </div>
              <div class="bg-muted rounded-lg p-3 text-center">
                <div class="text-xs text-dimmed">Median</div>
                <div class="text-lg font-bold text-primary">
                  {{ analysisData.marketSnapshot.stats.medianPrice }}
                </div>
              </div>
              <div class="bg-muted rounded-lg p-3 text-center">
                <div class="text-xs text-dimmed">Price Range</div>
                <div class="text-sm font-semibold text-default">
                  {{ analysisData.marketSnapshot.stats.priceRange }}
                </div>
              </div>
              <div class="bg-muted rounded-lg p-3 text-center">
                <div class="text-xs text-dimmed">Avg Age</div>
                <div class="text-lg font-bold text-default">
                  {{ analysisData.marketSnapshot.stats.avgAge }}
                </div>
              </div>
            </div>
            <p class="mt-4 text-sm text-muted whitespace-pre-line">
              {{ analysisData.marketSnapshot.summary }}
            </p>
          </div>

          <!-- Per-Boat Analyses -->
          <div v-if="analysisData.boatAnalyses?.length" class="space-y-4">
            <h3 class="text-xl font-bold text-default">⭐ Individual Boat Analysis</h3>
            <div
              v-for="ba in analysisData.boatAnalyses"
              :key="ba.boatId"
              class="card-base rounded-xl overflow-hidden"
            >
              <!-- Boat header with photos -->
              <div class="flex flex-col sm:flex-row">
                <!-- Photos -->
                <div v-if="analysisBoatMap[ba.boatId]?.images?.length" class="sm:w-64 shrink-0">
                  <div class="aspect-video sm:aspect-square overflow-hidden">
                    <img
                      :src="analysisBoatMap[ba.boatId].images[0]"
                      :alt="`${analysisBoatMap[ba.boatId]?.year || ''} ${analysisBoatMap[ba.boatId]?.make || ''}`"
                      class="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div v-if="analysisBoatMap[ba.boatId].images.length > 1" class="flex gap-1 p-1">
                    <img
                      v-for="(img, idx) in analysisBoatMap[ba.boatId].images.slice(1, 4)"
                      :key="idx"
                      :src="img"
                      class="w-1/3 aspect-square object-cover rounded"
                      loading="lazy"
                    />
                  </div>
                </div>
                <!-- Analysis content -->
                <div class="flex-1 p-5">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h4 class="text-lg font-bold text-default">
                        {{ analysisBoatMap[ba.boatId]?.year }}
                        {{ analysisBoatMap[ba.boatId]?.make }}
                        {{ analysisBoatMap[ba.boatId]?.model }}
                      </h4>
                      <p class="text-sm text-muted">
                        {{ analysisBoatMap[ba.boatId]?.length }}ft ·
                        {{ analysisBoatMap[ba.boatId]?.location || 'US' }}
                      </p>
                    </div>
                    <UBadge
                      :label="ba.rating"
                      :color="getRatingColor(ba.rating)"
                      variant="solid"
                      size="lg"
                    />
                  </div>
                  <p class="mt-1 text-sm font-semibold text-primary">{{ ba.headline }}</p>
                  <p class="mt-3 text-sm text-muted whitespace-pre-line">{{ ba.analysis }}</p>

                  <!-- Pros & Cons -->
                  <div v-if="ba.prosAndCons" class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <div class="bg-success/10 rounded-lg p-3">
                      <div class="text-xs font-bold text-success mb-1">✅ Pros</div>
                      <ul class="text-xs text-muted space-y-1">
                        <li v-for="pro in ba.prosAndCons.pros" :key="pro">• {{ pro }}</li>
                      </ul>
                    </div>
                    <div class="bg-error/10 rounded-lg p-3">
                      <div class="text-xs font-bold text-error mb-1">❌ Cons</div>
                      <ul class="text-xs text-muted space-y-1">
                        <li v-for="con in ba.prosAndCons.cons" :key="con">• {{ con }}</li>
                      </ul>
                    </div>
                  </div>

                  <!-- Value metrics -->
                  <div class="flex flex-wrap gap-4 mt-4 text-xs">
                    <div v-if="ba.fairMarketValue">
                      <span class="text-dimmed">Fair Value:</span>
                      <span class="font-bold text-default ml-1">{{ ba.fairMarketValue }}</span>
                    </div>
                    <div v-if="ba.negotiationTarget">
                      <span class="text-dimmed">Target Price:</span>
                      <span class="font-bold text-success ml-1">{{ ba.negotiationTarget }}</span>
                    </div>
                    <div v-if="ba.estimatedAnnualCost">
                      <span class="text-dimmed">Annual Cost:</span>
                      <span class="font-bold text-warning ml-1">{{ ba.estimatedAnnualCost }}</span>
                    </div>
                  </div>

                  <div v-if="analysisBoatMap[ba.boatId]?.url" class="mt-3">
                    <ULink
                      :to="analysisBoatMap[ba.boatId].url"
                      target="_blank"
                      class="text-xs text-primary hover:underline"
                    >
                      View original listing →
                    </ULink>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Buyer's Playbook -->
          <div v-if="analysisData.buyersPlaybook" class="card-base rounded-xl p-6">
            <h3 class="text-xl font-bold text-default flex items-center gap-2">
              <span>💡</span> {{ analysisData.buyersPlaybook.title || "Buyer's Playbook" }}
            </h3>
            <p class="mt-3 text-sm text-muted whitespace-pre-line">
              {{ analysisData.buyersPlaybook.content }}
            </p>
          </div>

          <!-- Bottom Line -->
          <div
            v-if="analysisData.bottomLine"
            class="card-base rounded-xl p-6 border-2 border-primary"
          >
            <h3 class="text-xl font-bold text-default flex items-center gap-2">
              <span>🎯</span> {{ analysisData.bottomLine.title || 'Bottom Line' }}
            </h3>
            <p class="mt-3 text-sm text-muted whitespace-pre-line">
              {{ analysisData.bottomLine.content }}
            </p>
            <!-- Highlight top pick photo -->
            <div
              v-if="
                analysisData.bottomLine.topPickBoatId &&
                analysisBoatMap[analysisData.bottomLine.topPickBoatId]?.images?.length
              "
              class="mt-4 flex items-center gap-4"
            >
              <img
                :src="analysisBoatMap[analysisData.bottomLine.topPickBoatId].images[0]"
                class="w-24 h-24 rounded-lg object-cover"
                loading="lazy"
              />
              <div>
                <p class="font-bold text-default">
                  {{ analysisBoatMap[analysisData.bottomLine.topPickBoatId]?.year }}
                  {{ analysisBoatMap[analysisData.bottomLine.topPickBoatId]?.make }}
                  {{ analysisBoatMap[analysisData.bottomLine.topPickBoatId]?.model }}
                </p>
                <NuxtLink
                  :to="`/boats/${analysisData.bottomLine.topPickBoatId}`"
                  class="text-sm text-primary hover:underline"
                >
                  View details →
                </NuxtLink>
              </div>
            </div>
          </div>

          <!-- Personal Advice -->
          <div v-if="analysisData.personalAdvice" class="card-base rounded-xl p-6">
            <h3 class="text-xl font-bold text-default flex items-center gap-2">
              <span>🎯</span> Tailored Advice for You
            </h3>
            <p class="mt-3 text-sm text-muted whitespace-pre-line">
              {{ analysisData.personalAdvice }}
            </p>
          </div>
        </div>
      </div>
    </UPageSection>

    <!-- Boat Listings -->
    <UPageSection :ui="{ wrapper: 'py-8' }">
      <div v-if="boatsStatus === 'pending'" class="text-center py-12">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
        <p class="text-muted mt-2">Loading boats...</p>
      </div>

      <div v-else-if="boats && boats.length > 0">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-bold text-default">{{ boats.length }} Boats Found</h2>
          <div class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="i-lucide-database" class="text-base" />
            Multi-source inventory
          </div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="boat in boats"
            :key="boat.id"
            :to="`/boats/${boat.id}`"
            class="card-base rounded-xl overflow-hidden transition-base hover:shadow-elevated group"
          >
            <!-- Image -->
            <div class="aspect-video bg-muted overflow-hidden relative">
              <img
                v-if="boat.images && boat.images.length > 0"
                :src="boat.images[0]"
                :alt="`${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`"
                class="w-full h-full object-cover group-hover:scale-105 transition-slow"
                loading="lazy"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-dimmed">
                <UIcon name="i-lucide-ship" class="text-4xl" />
              </div>
              <!-- Source badge -->
              <div class="absolute top-2 left-2">
                <UBadge
                  :label="getSourceLabel(boat.source)"
                  :color="getSourceColor(boat.source)"
                  variant="solid"
                  size="xs"
                />
              </div>
            </div>

            <!-- Info -->
            <div class="p-4">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h3 class="font-semibold text-default truncate">
                    {{ boat.year }} {{ boat.make }} {{ boat.model }}
                  </h3>
                  <p class="text-sm text-muted truncate">
                    {{ boat.length }}ft · {{ boat.city || boat.state || boat.location || 'US' }}
                  </p>
                </div>
                <span class="text-lg font-bold text-primary whitespace-nowrap">
                  {{ formatPrice(boat.price) }}
                </span>
              </div>
              <!-- Description excerpt -->
              <p v-if="boat.description" class="mt-2 text-xs text-dimmed line-clamp-2">
                {{ boat.description }}
              </p>
              <div v-if="boat.sellerType" class="mt-2 flex items-center gap-2">
                <UBadge :label="boat.sellerType" variant="subtle" size="sm" />
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>

      <div v-else class="text-center py-12">
        <UIcon name="i-lucide-ship" class="text-5xl text-dimmed" />
        <p class="text-lg text-muted mt-4">No boats found matching your criteria</p>
        <p class="text-sm text-dimmed">Try adjusting your filters or broadening your search.</p>
      </div>
    </UPageSection>

    <!-- Footer -->
    <UPageSection :ui="{ wrapper: 'py-4' }">
      <div class="text-center text-sm text-dimmed">
        <p>
          Data sourced from boats.com, YachtWorld, BoatTrader, and The Hull Truth · Analysis powered
          by xAI Grok
        </p>
      </div>
    </UPageSection>
  </UPage>
</template>

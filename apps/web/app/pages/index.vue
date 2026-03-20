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
  description:
    'Search fishing boats across the US with AI-powered market analysis.',
})

const { fetchBoats, fetchBoatStats, triggerAnalysis } = useBoats()

// Filters
const makeFilter = ref('')
const minPrice = ref<number | undefined>(undefined)
const maxPrice = ref<number | undefined>(undefined)
const minLength = ref<number | undefined>(undefined)
const maxLength = ref<number | undefined>(undefined)

// Preset chip options
const makeChips = ['Hatteras', 'Viking', 'Bertram', 'Grady-White', 'Boston Whaler', 'Yellowfin', 'Contender', 'Regulator', 'Sea Hunt', 'Pursuit']
const lengthChips = [
  { label: '20-30\'', min: 20, max: 30 },
  { label: '30-40\'', min: 30, max: 40 },
  { label: '40-50\'', min: 40, max: 50 },
  { label: '50-60\'', min: 50, max: 60 },
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
  return !!(makeFilter.value || minPrice.value || maxPrice.value || minLength.value || maxLength.value)
})

// Analysis
const analysisResult = ref<string | null>(null)
const analysisLoading = ref(false)
const analysisCategory = ref('Hatteras')
const userContext = ref('')
const showPromptPreview = ref(false)

// How it works toggle
const showHowItWorks = ref(false)

// Prompt preview — mirrors what the server will send to Grok
const promptPreview = computed(() => {
  const cat = analysisCategory.value || 'Hatteras'
  const boatCount = boats.value?.length || 0
  const makeFilter_ = makeFilter.value

  let systemSummary = `\ud83e\udd16 SYSTEM PROMPT (Captain's Market Intelligence)\n`
  systemSummary += `Expert offshore fishing boat analyst — 30+ years marine surveyor, yacht broker, tournament captain.\n`
  systemSummary += `Specialties: hull/structural analysis, engine/drivetrain (CAT, MAN, Cummins), market dynamics, fishing capability, cost of ownership.\n`
  systemSummary += `Focus category: ${cat}\n`
  systemSummary += `Response sections: Market Snapshot → Top Values → Red Flags → Maintenance Reality → Buyer's Playbook → Bottom Line\n`

  let userPrompt = `\n\ud83d\udcdd USER PROMPT\n`
  userPrompt += `Analyze sport fishing boats currently for sale across the US.\n\n`
  userPrompt += `Inventory: ~${boatCount} listings`
  if (makeFilter_) userPrompt += ` (filtered: ${makeFilter_})`
  userPrompt += `\n`
  userPrompt += `Focus: ${cat} and comparable offshore fishing vessels\n`

  if (userContext.value) {
    userPrompt += `\n\ud83c\udfaf BUYER'S PERSONAL SITUATION:\n${userContext.value}\n`
    userPrompt += `\n→ Grok will tailor analysis to your specific situation, budget, and plans.`
  } else {
    userPrompt += `\n\ud83d\udca1 Add your personal situation above for tailored recommendations.`
  }

  return systemSummary + userPrompt
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

async function runAnalysis() {
  analysisLoading.value = true
  analysisResult.value = null
  try {
    const result = await triggerAnalysis({
      category: analysisCategory.value,
      make: makeFilter.value || undefined,
      userContext: userContext.value || undefined,
    })
    analysisResult.value = result.analysis
  } catch (error) {
    analysisResult.value = `Error: ${(error as Error).message}`
  } finally {
    analysisLoading.value = false
  }
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

          <div
            v-if="analysisResult"
            class="bg-elevated rounded-lg p-5 mt-4 prose prose-sm max-w-none text-default whitespace-pre-wrap"
          >
            {{ analysisResult }}
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

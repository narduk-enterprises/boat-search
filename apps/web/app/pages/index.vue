<script setup lang="ts">
const config = useRuntimeConfig()
const appName = config.public.appName || 'Boat Search'

useSeo({
  title: `${appName} — 40-60ft Sport Fishing Boats in Texas`,
  description: 'Search and analyze 40-60 foot sport fishing boats for sale in Texas. AI-powered market analysis by xAI Grok.',
})
useWebPageSchema({
  name: `${appName} — Sport Fishing Boat Search`,
  description: 'Search and analyze 40-60 foot sport fishing boats for sale in Texas.',
})

const { fetchBoats, fetchBoatStats, triggerAnalysis } = useBoats()

// Filters
const makeFilter = ref('')
const minPrice = ref<number | undefined>(undefined)
const maxPrice = ref<number | undefined>(undefined)

// Data
const { data: boats, status: boatsStatus } = fetchBoats()
const { data: stats } = fetchBoatStats()

// Computed stat labels (avoid complex template expressions)
const avgPriceLabel = computed(() => stats.value?.avgPrice ? formatPrice(stats.value.avgPrice) : 'N/A')
const priceRangeLabel = computed(() => {
  if (!stats.value?.minPrice || !stats.value?.maxPrice) return 'N/A'
  return `${formatPrice(stats.value.minPrice)} - ${formatPrice(stats.value.maxPrice)}`
})
const totalBoatsLabel = computed(() => String(stats.value?.total || 0))
const uniqueMakesLabel = computed(() => String(stats.value?.uniqueMakes || 0))

// Analysis
const analysisResult = ref<string | null>(null)
const analysisLoading = ref(false)
const analysisCategory = ref('Hatteras')

async function applyFilters() {
  const { data } = await fetchBoats({
    make: makeFilter.value || undefined,
    minPrice: minPrice.value,
    maxPrice: maxPrice.value,
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
    })
    analysisResult.value = result.analysis
  }
  catch (error) {
    analysisResult.value = `Error: ${(error as Error).message}`
  }
  finally {
    analysisLoading.value = false
  }
}

function formatPrice(price: number | null) {
  if (!price) return 'Price N/A'
  return `$${price.toLocaleString()}`
}
</script>

<template>
  <UPage>
    <UPageHero
      title="Boat Search"
      description="40-60ft sport fishing boats for sale in Texas. AI-powered analysis by xAI Grok."
      :ui="{ title: 'text-5xl sm:text-6xl', description: 'text-xl text-muted' }"
    >
      <template #links>
        <UBadge
          color="primary"
          variant="subtle"
          size="lg"
          label="Sport Fishing"
          icon="i-lucide-anchor"
        />
      </template>
    </UPageHero>

    <!-- Stats -->
    <UPageSection
      v-if="stats"
      :ui="{ wrapper: 'py-8' }"
    >
      <UPageGrid>
        <UPageCard
          icon="i-lucide-ship"
          :title="totalBoatsLabel"
          description="Total Boats"
        />
        <UPageCard
          icon="i-lucide-tag"
          :title="avgPriceLabel"
          description="Average Price"
        />
        <UPageCard
          icon="i-lucide-trending-up"
          :title="priceRangeLabel"
          description="Price Range"
        />
        <UPageCard
          icon="i-lucide-factory"
          :title="uniqueMakesLabel"
          description="Unique Makes"
        />
      </UPageGrid>
    </UPageSection>

    <!-- Filters + AI Analysis -->
    <UPageSection :ui="{ wrapper: 'py-4' }">
      <div class="flex flex-col gap-6">
        <!-- Filters -->
        <div class="flex flex-wrap items-end gap-4">
          <div class="flex-1 min-w-48">
            <UFormField label="Make">
              <UInput
                v-model="makeFilter"
                placeholder="e.g. Hatteras, Viking..."
                icon="i-lucide-search"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="w-40">
            <UFormField label="Min Price">
              <UInput
                v-model.number="minPrice"
                type="number"
                placeholder="$0"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="w-40">
            <UFormField label="Max Price">
              <UInput
                v-model.number="maxPrice"
                type="number"
                placeholder="$10M"
                class="w-full"
              />
            </UFormField>
          </div>
          <UButton
            label="Filter"
            icon="i-lucide-filter"
            @click="applyFilters"
          />
        </div>

        <!-- AI Analysis -->
        <div class="card-base rounded-xl p-6">
          <div class="flex items-center gap-4 mb-4">
            <div class="flex-1">
              <h3 class="text-lg font-semibold">
                xAI Analysis
              </h3>
              <p class="text-sm text-muted">
                Ask Grok to analyze the current boat inventory
              </p>
            </div>
            <div class="w-48">
              <UInput
                v-model="analysisCategory"
                placeholder="Category (e.g. Hatteras)"
                class="w-full"
              />
            </div>
            <UButton
              :label="analysisLoading ? 'Analyzing...' : 'Ask AI'"
              icon="i-lucide-sparkles"
              color="primary"
              :loading="analysisLoading"
              :disabled="analysisLoading"
              @click="runAnalysis"
            />
          </div>

          <div
            v-if="analysisResult"
            class="bg-elevated rounded-lg p-4 mt-4 prose prose-sm max-w-none text-default whitespace-pre-wrap"
          >
            {{ analysisResult }}
          </div>
        </div>
      </div>
    </UPageSection>

    <!-- Boat Listings -->
    <UPageSection :ui="{ wrapper: 'py-8' }">
      <div v-if="boatsStatus === 'pending'" class="text-center py-12">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
        <p class="text-muted mt-2">
          Loading boats...
        </p>
      </div>

      <div v-else-if="boats && boats.length > 0">
        <h2 class="text-2xl font-bold mb-6">
          {{ boats.length }} Boats Found
        </h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="boat in boats"
            :key="boat.id"
            :to="`/boats/${boat.id}`"
            class="card-base rounded-xl overflow-hidden transition-base hover:shadow-elevated group"
          >
            <!-- Image -->
            <div class="aspect-video bg-muted overflow-hidden">
              <img
                v-if="boat.images && boat.images.length > 0"
                :src="boat.images[0]"
                :alt="`${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`"
                class="w-full h-full object-cover group-hover:scale-105 transition-slow"
                loading="lazy"
              >
              <div v-else class="w-full h-full flex items-center justify-center text-dimmed">
                <UIcon name="i-lucide-ship" class="text-4xl" />
              </div>
            </div>

            <!-- Info -->
            <div class="p-4">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <h3 class="font-semibold text-default truncate">
                    {{ boat.year }} {{ boat.make }} {{ boat.model }}
                  </h3>
                  <p class="text-sm text-muted">
                    {{ boat.length }}ft · {{ boat.location || boat.state || 'Texas' }}
                  </p>
                </div>
                <span class="text-lg font-bold text-primary whitespace-nowrap">
                  {{ formatPrice(boat.price) }}
                </span>
              </div>
              <div v-if="boat.sellerType" class="mt-2">
                <UBadge
                  :label="boat.sellerType"
                  variant="subtle"
                  size="sm"
                />
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>

      <div v-else class="text-center py-12">
        <UIcon name="i-lucide-ship" class="text-5xl text-dimmed" />
        <p class="text-lg text-muted mt-4">
          No boats found
        </p>
        <p class="text-sm text-dimmed">
          Run the crawler to populate boat listings.
        </p>
      </div>
    </UPageSection>
  </UPage>
</template>

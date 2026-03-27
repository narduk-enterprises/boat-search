<script setup lang="ts">
const route = useRoute()
const boatId = route.params.id as string
const { fetchBoat, triggerAnalysis } = useBoats()
const { data: boat, status } = await fetchBoat(boatId)

const pageTitle = computed(() => {
  if (!boat.value) return 'Boat details'
  return (
    `${boat.value.year || ''} ${boat.value.make || ''} ${boat.value.model || ''}`.trim() ||
    'Boat details'
  )
})

const b = boat.value
const seoTitle = pageTitle.value
const seoDesc = b
  ? `${seoTitle} — ${b.length || '?'}ft boat for sale${b.location ? ` in ${b.location}` : ''}. Source: ${b.source}.`
  : 'Boat listing details on Boat Search.'

useSeo({
  title: seoTitle,
  description: seoDesc,
  ogImage: { title: seoTitle, description: seoDesc, icon: '⛵' },
})
useWebPageSchema({
  name: seoTitle,
  description: seoDesc,
  type: 'ItemPage',
})

const session = useUserSession()
const numericBoatId = computed(() => boat.value?.id)
const { favorited, saving: favSaving, toggleFavorite } = useFavoriteBoat(numericBoatId)

function goLoginForFavorite() {
  navigateTo({ path: '/login', query: { redirect: route.fullPath } })
}

// Selected image index for gallery
const selectedImage = ref(0)

// AI Analysis for this specific boat
const analysisResult = ref<string | null>(null)
const analysisLoading = ref(false)

async function analyzeThisBoat() {
  if (!boat.value) return
  analysisLoading.value = true
  analysisResult.value = null
  try {
    const result = await triggerAnalysis({
      category: boat.value.make || 'Hatteras',
      make: boat.value.make || undefined,
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

function getSourceLabel(source: string) {
  switch (source) {
    case 'boats.com':
      return 'View on Boats.com'
    case 'yachtworld.com':
      return 'View on YachtWorld'
    case 'boattrader.com':
      return 'View on BoatTrader'
    case 'thehulltruth.com':
      return 'View on Hull Truth'
    default:
      return 'View Original Listing'
  }
}

function getSourceBadgeLabel(source: string) {
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
    <div v-if="status === 'pending'" class="flex items-center justify-center py-24">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
    </div>

    <template v-else-if="boat">
      <!-- Back nav -->
      <UPageSection :ui="{ wrapper: 'py-4' }">
        <NuxtLink
          to="/search"
          class="inline-flex items-center gap-1 text-sm text-muted hover:text-default transition-fast"
        >
          <UIcon name="i-lucide-arrow-left" />
          Back to search
        </NuxtLink>
      </UPageSection>

      <!-- Image Gallery -->
      <UPageSection :ui="{ wrapper: 'py-2' }">
        <div class="grid gap-4 lg:grid-cols-3">
          <!-- Main image -->
          <div class="lg:col-span-2 aspect-video bg-muted rounded-xl overflow-hidden">
            <img
              v-if="boat.images && boat.images.length > 0"
              :src="boat.images[selectedImage]"
              :alt="pageTitle"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-dimmed">
              <UIcon name="i-lucide-ship" class="text-6xl" />
            </div>
          </div>

          <!-- Thumbnails -->
          <div
            v-if="boat.images && boat.images.length > 1"
            class="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto lg:max-h-96"
          >
            <div
              v-for="(img, idx) in boat.images.slice(0, 8)"
              :key="idx"
              class="shrink-0 w-20 h-16 lg:w-full lg:h-20 rounded-lg overflow-hidden cursor-pointer ring-2 transition-fast"
              :class="
                idx === selectedImage ? 'ring-primary' : 'ring-transparent hover:ring-primary/50'
              "
              @click="selectedImage = idx"
            >
              <img
                :src="img"
                :alt="`${pageTitle} image ${idx + 1}`"
                class="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </UPageSection>

      <!-- Details -->
      <UPageSection :ui="{ wrapper: 'py-6' }">
        <div class="grid gap-8 lg:grid-cols-3">
          <!-- Main info -->
          <div class="lg:col-span-2 space-y-6">
            <div>
              <h1 class="text-3xl font-bold text-default">
                {{ pageTitle }}
              </h1>
              <p class="text-lg text-muted mt-1">
                {{ boat.length }}ft · {{ boat.city || boat.state || boat.location || 'US' }}
              </p>
            </div>

            <div class="text-3xl font-bold text-primary">
              {{ formatPrice(boat.price) }}
            </div>

            <!-- Specs grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div v-if="boat.year" class="card-base rounded-lg p-3 text-center">
                <p class="text-xs text-muted">Year</p>
                <p class="text-lg font-semibold text-default">
                  {{ boat.year }}
                </p>
              </div>
              <div v-if="boat.length" class="card-base rounded-lg p-3 text-center">
                <p class="text-xs text-muted">Length</p>
                <p class="text-lg font-semibold text-default">{{ boat.length }}ft</p>
              </div>
              <div v-if="boat.make" class="card-base rounded-lg p-3 text-center">
                <p class="text-xs text-muted">Make</p>
                <p class="text-lg font-semibold text-default">
                  {{ boat.make }}
                </p>
              </div>
              <div v-if="boat.sellerType" class="card-base rounded-lg p-3 text-center">
                <p class="text-xs text-muted">Seller</p>
                <p class="text-lg font-semibold text-default">
                  {{ boat.sellerType }}
                </p>
              </div>
            </div>

            <!-- Description -->
            <div v-if="boat.description">
              <h2 class="text-xl font-semibold mb-3 text-default">Description</h2>
              <div class="text-muted whitespace-pre-wrap">
                {{ boat.description }}
              </div>
            </div>
          </div>

          <!-- Sidebar -->
          <div class="space-y-4">
            <!-- View Original -->
            <UBadge
              v-if="boat.source"
              :label="getSourceBadgeLabel(boat.source)"
              color="primary"
              variant="subtle"
              size="lg"
              class="mb-3"
            />

            <UButton
              v-if="boat.url"
              :to="boat.url"
              external
              target="_blank"
              :label="getSourceLabel(boat.source)"
              icon="i-lucide-external-link"
              color="primary"
              variant="solid"
              block
            />

            <UButton
              v-if="session.loggedIn"
              :label="favorited ? 'Saved to favorites' : 'Save to favorites'"
              icon="i-lucide-heart"
              :color="favorited ? 'primary' : 'neutral'"
              variant="outline"
              :loading="favSaving"
              block
              @click="toggleFavorite"
            />
            <UButton
              v-else
              label="Sign in to save"
              icon="i-lucide-heart"
              color="neutral"
              variant="outline"
              block
              @click="goLoginForFavorite"
            />

            <!-- AI Analysis -->
            <div class="card-base rounded-xl p-4 space-y-3">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-sparkles" class="text-primary" />
                <h3 class="font-semibold text-default">Captain's Intelligence</h3>
              </div>
              <p class="text-sm text-muted">
                Expert analysis of {{ boat.make || 'this' }} and similar sportfish boats
              </p>
              <UButton
                :label="analysisLoading ? 'Analyzing...' : 'Analyze with AI'"
                icon="i-lucide-sparkles"
                color="primary"
                variant="subtle"
                :loading="analysisLoading"
                :disabled="analysisLoading"
                block
                @click="analyzeThisBoat"
              />
              <div
                v-if="analysisResult"
                class="bg-elevated rounded-lg p-3 text-sm text-default whitespace-pre-wrap max-h-96 overflow-y-auto"
              >
                {{ analysisResult }}
              </div>
            </div>

            <!-- Metadata -->
            <div class="card-base rounded-xl p-4 text-sm space-y-2">
              <div class="flex justify-between">
                <span class="text-muted">Source</span>
                <span class="text-default">{{ boat.source }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">Listing Type</span>
                <span class="text-default">{{ boat.listingType || 'N/A' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">Currency</span>
                <span class="text-default">{{ boat.currency || 'USD' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted">Last Scraped</span>
                <span class="text-default">{{
                  boat.scrapedAt ? new Date(boat.scrapedAt).toLocaleDateString() : 'N/A'
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </UPageSection>
    </template>

    <div v-else class="text-center py-24">
      <UIcon name="i-lucide-ship" class="text-5xl text-dimmed" />
      <p class="text-lg text-muted mt-4">Boat not found</p>
      <NuxtLink to="/search" class="text-primary hover:underline mt-2 inline-block">
        Back to search
      </NuxtLink>
    </div>
  </UPage>
</template>

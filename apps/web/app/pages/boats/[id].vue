<script setup lang="ts">
const route = useRoute()
const session = useUserSession()
const { fetchBoat } = useBoats()
const { formatPrice, getSourceLabel } = useBoatListingDisplay()

const boatId = route.params.id as string
const sessionId = computed(() => {
  const raw = route.query.sessionId
  if (typeof raw !== 'string') return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? null : parsed
})
const fitSummarySessionId = computed(() => sessionId.value ?? undefined)

const { data: boat, status } = await fetchBoat(boatId)
const numericBoatId = computed(() => boat.value?.id ?? null)
const { favorited, saving: favoriteSaving, toggleFavorite } = useFavoriteBoat(numericBoatId)
const {
  summary,
  status: fitStatus,
  error: fitError,
} = useBoatFitSummary(numericBoatId, fitSummarySessionId)

const pageTitle =
  `${boat.value?.year || ''} ${boat.value?.make || ''} ${boat.value?.model || ''}`.trim() ||
  'Boat details'
const seoDescription = boat.value
  ? `${pageTitle} — ${boat.value.length || '?'}ft fishing boat${boat.value.location ? ` in ${boat.value.location}` : ''}.`
  : 'Fishing boat listing details on Boat Search.'

useSeo({
  title: pageTitle,
  description: seoDescription,
  ogImage: { title: pageTitle, description: seoDescription, icon: '⛵' },
})
useWebPageSchema({
  name: pageTitle,
  description: seoDescription,
  type: 'ItemPage',
})

const selectedImage = shallowRef(0)
const backToSearch = computed(() => ({
  path: '/search',
  query: sessionId.value ? { sessionId: String(sessionId.value) } : undefined,
}))
const loginPath = computed(() => `/login?redirect=${encodeURIComponent(route.fullPath)}`)
const fitErrorMessage = computed(() => {
  const error = fitError.value as { data?: { statusMessage?: string }; message?: string } | null
  return error?.data?.statusMessage || error?.message || null
})

function sourceCta(source: string) {
  switch (source) {
    case 'boats.com':
      return 'Open on Boats.com'
    case 'yachtworld.com':
      return 'Open on YachtWorld'
    case 'boattrader.com':
      return 'Open on BoatTrader'
    case 'thehulltruth.com':
      return 'Open on Hull Truth'
    default:
      return 'Open source listing'
  }
}

function goLoginForFavorite() {
  navigateTo({ path: '/login', query: { redirect: route.fullPath } })
}
</script>

<template>
  <UPage>
    <div v-if="status === 'pending'" class="flex items-center justify-center py-24">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
    </div>

    <template v-else-if="boat">
      <UPageSection :ui="{ wrapper: 'py-4' }">
        <UButton
          :to="backToSearch"
          label="Back to shortlist"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
        />
      </UPageSection>

      <UPageSection :ui="{ wrapper: 'py-2' }">
        <div class="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <div class="space-y-4">
            <div class="aspect-video overflow-hidden rounded-2xl bg-muted">
              <img
                v-if="boat.images.length > 0"
                :src="boat.images[selectedImage]"
                :alt="pageTitle"
                class="h-full w-full object-cover"
              />
              <div v-else class="flex h-full items-center justify-center text-dimmed">
                <UIcon name="i-lucide-ship" class="text-6xl" />
              </div>
            </div>

            <div v-if="boat.images.length > 1" class="flex gap-2 overflow-x-auto pb-2">
              <UButton
                v-for="(image, index) in boat.images"
                :key="image"
                color="neutral"
                variant="ghost"
                class="h-20 w-28 shrink-0 overflow-hidden rounded-xl border border-default p-0"
                :class="index === selectedImage ? 'ring-2 ring-primary' : ''"
                @click="selectedImage = index"
              >
                <img
                  :src="image"
                  :alt="`${pageTitle} image ${index + 1}`"
                  class="h-full w-full object-cover"
                />
              </UButton>
            </div>
          </div>

          <div class="space-y-4">
            <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-4' }">
              <div class="space-y-2">
                <UBadge :label="boat.source" color="primary" variant="subtle" />
                <h1 class="text-3xl font-bold text-default">{{ pageTitle }}</h1>
                <p class="text-muted">
                  {{ boat.length || '?' }}ft ·
                  {{ boat.city || boat.state || boat.location || 'US' }}
                </p>
              </div>

              <p class="text-3xl font-semibold text-primary">{{ formatPrice(boat.price) }}</p>

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-xl bg-muted px-4 py-3">
                  <p class="text-xs text-dimmed">Seller</p>
                  <p class="mt-1 text-sm font-medium text-default">
                    {{ boat.sellerType || 'Unknown' }}
                  </p>
                </div>
                <div class="rounded-xl bg-muted px-4 py-3">
                  <p class="text-xs text-dimmed">Source</p>
                  <p class="mt-1 text-sm font-medium text-default">
                    {{ getSourceLabel(boat.source) }}
                  </p>
                </div>
              </div>

              <div class="flex flex-col gap-3">
                <UButton
                  v-if="boat.url"
                  :to="boat.url"
                  external
                  target="_blank"
                  :label="sourceCta(boat.source)"
                  icon="i-lucide-external-link"
                />
                <UButton
                  v-if="session.loggedIn"
                  :label="favorited ? 'Saved to favorites' : 'Save to favorites'"
                  icon="i-lucide-heart"
                  :color="favorited ? 'primary' : 'neutral'"
                  variant="soft"
                  :loading="favoriteSaving"
                  @click="toggleFavorite"
                />
                <UButton
                  v-else
                  label="Sign in to save"
                  icon="i-lucide-heart"
                  color="neutral"
                  variant="soft"
                  @click="goLoginForFavorite"
                />
              </div>
            </UCard>
          </div>
        </div>
      </UPageSection>

      <UPageSection :ui="{ wrapper: 'py-6' }">
        <div class="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div class="space-y-6">
            <UCard
              v-if="boat.description"
              class="card-base border-default"
              :ui="{ body: 'p-5 space-y-3' }"
            >
              <h2 class="text-xl font-semibold text-default">Listing description</h2>
              <p class="whitespace-pre-wrap text-sm text-muted">
                {{ boat.description }}
              </p>
            </UCard>
          </div>

          <BoatFitSummaryCard
            :summary="summary"
            :loading="fitStatus === 'pending'"
            :error-message="fitErrorMessage"
            :logged-in="session.loggedIn.value"
            :login-to="loginPath"
          />
        </div>
      </UPageSection>
    </template>
  </UPage>
</template>

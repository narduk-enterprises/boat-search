<script setup lang="ts">
import BoatFitSummaryCard from '~~/app/components/boat-finder/BoatFitSummaryCard.vue'
import BoatMediaImage from '~~/app/components/boats/BoatMediaImage.vue'
import {
  BOAT_INVENTORY_RESULTS_HASH,
  makeInventoryResultsRoute,
  makeInventorySearchLink,
} from '~~/app/utils/boatBrowse'

const route = useRoute()
const session = useUserSession()
const { fetchBoat } = useBoats()
const {
  formatPrice,
  formatLength,
  formatLocation,
  formatListingTitle,
  getSourceLabel,
  getSourceCta,
  getSourceNote,
} = useBoatListingDisplay()

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

const pageTitle = boat.value ? formatListingTitle(boat.value) : 'Boat details'
const seoDescription = boat.value
  ? `${pageTitle} — ${formatLength(boat.value.length)} fishing boat${boat.value.location ? ` in ${boat.value.location}` : ''}.`
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
const galleryImages = computed(() => boat.value?.images?.filter(Boolean) ?? [])
const headlineLocation = computed(() =>
  boat.value ? formatLocation(boat.value) : 'Location unlisted',
)
const backToSearch = computed(() => ({
  path: sessionId.value ? '/search' : '/boats-for-sale',
  query: sessionId.value ? { sessionId: String(sessionId.value) } : undefined,
  hash: sessionId.value ? undefined : BOAT_INVENTORY_RESULTS_HASH,
}))
const backLabel = computed(() => (sessionId.value ? 'Back to shortlist' : 'Back to search'))
const loginPath = computed(() => `/login?redirect=${encodeURIComponent(route.fullPath)}`)
const fitErrorMessage = computed(() => {
  const error = fitError.value as { data?: { statusMessage?: string }; message?: string } | null
  return error?.data?.statusMessage || error?.message || null
})

const boatSummary = computed(() => {
  if (!boat.value) return null
  return (
    boat.value.description?.trim() ||
    `${pageTitle} is tracked in Boat Search so you can review pricing, provenance, and buyer fit notes before you open the original listing.`
  )
})

const overviewFacts = computed(() => {
  if (!boat.value) return []

  return [
    {
      label: 'Year',
      value: boat.value.year ? String(boat.value.year) : 'Year unlisted',
      detail: 'Original model year reported by the source listing.',
    },
    {
      label: 'Length',
      value: formatLength(boat.value.length),
      detail: 'Hull length pulled directly from the marketplace source.',
    },
    {
      label: 'Seller',
      value: boat.value.sellerType || 'Seller type unlisted',
      detail: 'Useful when deciding how much diligence to do before contacting them.',
    },
    {
      label: 'Location',
      value: headlineLocation.value,
      detail: 'Helps you gauge logistics, survey travel, and delivery options.',
    },
  ]
})

const marketLinks = computed(() => {
  if (!boat.value) return []

  const links: {
    label: string
    to: string | { path: string; query?: Record<string, string> }
    icon: string
  }[] = []

  if (boat.value.make) {
    const link = makeInventorySearchLink(boat.value.make)
    links.push({
      label: `More ${boat.value.make}`,
      to: link.to as string | { path: string; query?: Record<string, string> },
      icon: link.icon || 'i-lucide-anchor',
    })
  }

  if (boat.value.location || boat.value.state || boat.value.city) {
    links.push({
      label: 'Nearby inventory',
      to: makeInventoryResultsRoute({
        location: boat.value.state || boat.value.city || boat.value.location || '',
      }),
      icon: 'i-lucide-map-pinned',
    })
  }

  links.push({
    label: 'Browse curated paths',
    to: '/browse',
    icon: 'i-lucide-compass',
  })

  return links
})

watch(
  galleryImages,
  (images) => {
    if (!images.length || selectedImage.value > images.length - 1) {
      selectedImage.value = 0
    }
  },
  { immediate: true },
)

function goLoginForFavorite() {
  navigateTo({ path: '/login', query: { redirect: route.fullPath } })
}
</script>

<template>
  <UPage class="space-y-2">
    <div v-if="status === 'pending'" class="flex items-center justify-center py-24">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
    </div>

    <template v-else-if="boat">
      <UPageSection :ui="{ wrapper: 'py-2' }">
        <UCard
          class="brand-surface brand-grid-panel brand-orbit"
          :ui="{ body: 'relative p-6 sm:p-8 space-y-6' }"
        >
          <div class="space-y-5">
            <UButton
              :to="backToSearch"
              :label="backLabel"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="ghost"
              class="self-start"
            />

            <div class="space-y-4">
              <div class="flex flex-wrap gap-2">
                <UBadge :label="getSourceLabel(boat.source)" color="primary" variant="subtle" />
                <UBadge
                  :label="boat.sellerType || 'Seller type unlisted'"
                  color="neutral"
                  variant="soft"
                />
                <UBadge :label="formatLength(boat.length)" color="neutral" variant="soft" />
              </div>
              <div class="space-y-2">
                <h1 class="max-w-4xl text-3xl font-bold text-highlighted sm:text-5xl">
                  {{ pageTitle }}
                </h1>
                <p class="text-sm text-muted sm:text-base">
                  {{ headlineLocation }}
                </p>
              </div>
            </div>
          </div>

          <div
            class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start"
          >
            <div class="order-2 min-w-0 space-y-5 lg:order-1">
              <div class="brand-surface-soft rounded-[1.25rem] p-4 sm:p-5">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                  Listing snapshot
                </p>
                <p class="mt-2 line-clamp-4 text-sm text-muted sm:line-clamp-none sm:text-base">
                  {{ boatSummary }}
                </p>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div
                  v-for="item in overviewFacts"
                  :key="item.label"
                  class="brand-surface-soft rounded-[1.25rem] p-4"
                >
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                    {{ item.label }}
                  </p>
                  <p class="mt-2 text-base font-semibold text-highlighted">{{ item.value }}</p>
                  <p class="mt-1 hidden text-sm text-muted sm:block">{{ item.detail }}</p>
                </div>
              </div>
            </div>

            <div class="order-1 min-w-0 space-y-4 lg:order-2">
              <BoatMediaImage
                :src="galleryImages[selectedImage]"
                :alt="pageTitle"
                :width="1440"
                :height="1080"
                sizes="(min-width: 1024px) 45vw, 100vw"
                :quality="74"
                class="aspect-[4/3] w-full max-w-full rounded-[1.4rem] border border-default bg-muted"
                img-class="h-full w-full max-w-full object-cover"
                loading="eager"
              >
                <div class="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
                  <div class="rounded-2xl bg-black/35 px-3 py-2 text-white backdrop-blur-md">
                    <p
                      class="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-white/70"
                    >
                      Asking
                    </p>
                    <p class="mt-1 text-xl font-semibold text-white sm:text-2xl">
                      {{ formatPrice(boat.price) }}
                    </p>
                  </div>
                  <UBadge
                    :label="`${galleryImages.length || 0} photo${galleryImages.length === 1 ? '' : 's'}`"
                    color="neutral"
                    variant="solid"
                  />
                </div>
              </BoatMediaImage>

              <div v-if="galleryImages.length > 1" class="flex gap-2 overflow-x-auto pb-1">
                <UButton
                  v-for="(image, index) in galleryImages"
                  :key="image"
                  color="neutral"
                  variant="ghost"
                  class="h-20 w-28 shrink-0 overflow-hidden rounded-2xl border border-default p-0"
                  :class="index === selectedImage ? 'ring-2 ring-primary' : ''"
                  @click="selectedImage = index"
                >
                  <BoatMediaImage
                    :src="image"
                    :alt="`${pageTitle} image ${index + 1}`"
                    :width="224"
                    :height="160"
                    sizes="112px sm:160px"
                    :quality="56"
                    class="h-full w-full"
                    img-class="h-full w-full object-cover"
                  />
                </UButton>
              </div>
            </div>
          </div>
        </UCard>
      </UPageSection>

      <UPageSection :ui="{ wrapper: 'py-0' }">
        <div class="grid gap-8 xl:grid-cols-[0.98fr_1.02fr]">
          <div class="order-2 grid gap-6 xl:order-1">
            <UCard class="brand-surface" :ui="{ body: 'p-6 space-y-4' }">
              <div class="space-y-2">
                <h2 class="text-2xl font-semibold text-highlighted">Market context</h2>
                <p class="text-sm text-muted">
                  Use these next steps to compare this listing against the surrounding market before
                  you schedule calls, surveys, or travel.
                </p>
              </div>

              <div class="brand-surface-soft rounded-[1.25rem] p-4 text-sm text-muted">
                {{ getSourceNote(boat.source) }}
              </div>

              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="link in marketLinks"
                  :key="link.label"
                  :to="link.to"
                  :label="link.label"
                  :icon="link.icon"
                  color="neutral"
                  variant="soft"
                />
              </div>
            </UCard>

            <UCard v-if="boat.description" class="brand-surface" :ui="{ body: 'p-6 space-y-4' }">
              <div class="space-y-2">
                <h2 class="text-2xl font-semibold text-highlighted">Listing brief</h2>
                <p class="text-sm text-muted">
                  Source-marketplace copy pulled into Boat Search so you can review context before
                  jumping out to the broker page.
                </p>
              </div>
              <p class="whitespace-pre-wrap text-sm text-muted">
                {{ boat.description }}
              </p>
            </UCard>
          </div>

          <div class="order-1 space-y-6 xl:order-2 xl:sticky xl:top-28">
            <UCard class="brand-surface" :ui="{ body: 'p-6 space-y-5' }">
              <div class="space-y-2">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                  Listing action board
                </p>
                <p class="text-3xl font-semibold text-primary">{{ formatPrice(boat.price) }}</p>
                <p class="text-sm text-muted">
                  {{ getSourceLabel(boat.source) }} · {{ headlineLocation }}
                </p>
              </div>

              <div class="flex flex-col gap-3">
                <UButton
                  v-if="boat.url"
                  :to="boat.url"
                  external
                  target="_blank"
                  :label="getSourceCta(boat.source)"
                  icon="i-lucide-external-link"
                  class="brand-button-shadow"
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

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="brand-surface-soft rounded-[1.15rem] p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                    Listing ID
                  </p>
                  <p class="mt-2 text-sm font-semibold text-default">
                    {{ boat.listingId || 'Not supplied' }}
                  </p>
                </div>
                <div class="brand-surface-soft rounded-[1.15rem] p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                    Listing type
                  </p>
                  <p class="mt-2 text-sm font-semibold text-default">
                    {{ boat.listingType || 'Standard listing' }}
                  </p>
                </div>
              </div>
            </UCard>

            <BoatFitSummaryCard
              :summary="summary"
              :loading="fitStatus === 'pending'"
              :error-message="fitErrorMessage"
              :logged-in="session.loggedIn.value"
              :login-to="loginPath"
            />
          </div>
        </div>
      </UPageSection>
    </template>
  </UPage>
</template>

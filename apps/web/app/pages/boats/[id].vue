<script setup lang="ts">
import BoatFitSummaryCard from '~~/app/components/boat-finder/BoatFitSummaryCard.vue'
import BoatMediaImage from '~~/app/components/boats/BoatMediaImage.vue'
import {
  BOAT_INVENTORY_RESULTS_HASH,
  makeInventoryResultsRoute,
  makeInventorySearchLink,
} from '~~/app/utils/boatBrowse'

const LISTING_BRIEF_ID = 'listing-brief'

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

const snapshotTeaser = computed(() => {
  const full = boatSummary.value?.trim() || ''
  if (!full) return { text: '', hasMore: false }
  const max = 320
  if (full.length <= max) return { text: full, hasMore: false }
  const slice = full.slice(0, max)
  const lastSpace = slice.lastIndexOf(' ')
  const end = lastSpace > 160 ? lastSpace : max
  return { text: `${full.slice(0, end).trim()}…`, hasMore: true }
})

const overviewFacts = computed(() => {
  if (!boat.value) return []

  return [
    {
      label: 'Year',
      value: boat.value.year ? String(boat.value.year) : 'Year unlisted',
      detail: 'Original model year reported by the source listing.',
      icon: 'i-lucide-calendar',
    },
    {
      label: 'Length',
      value: formatLength(boat.value.length),
      detail: 'Hull length pulled directly from the marketplace source.',
      icon: 'i-lucide-ruler',
    },
    {
      label: 'Seller',
      value: boat.value.sellerType || 'Seller type unlisted',
      detail: 'Useful when deciding how much diligence to do before contacting them.',
      icon: 'i-lucide-store',
    },
    {
      label: 'Location',
      value: headlineLocation.value,
      detail: 'Helps you gauge logistics, survey travel, and delivery options.',
      icon: 'i-lucide-map-pin',
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

function scrollToListingBrief() {
  if (!import.meta.client) return
  document.getElementById(LISTING_BRIEF_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
          class="brand-surface brand-grid-panel brand-orbit overflow-hidden"
          :ui="{ body: 'relative p-6 sm:p-8 lg:p-10 space-y-8 lg:space-y-10' }"
        >
          <div class="space-y-6">
            <UButton
              :to="backToSearch"
              :label="backLabel"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="ghost"
              class="self-start"
            />

            <div class="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
              <div class="min-w-0 max-w-3xl space-y-4">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge
                    :label="getSourceLabel(boat.source)"
                    color="primary"
                    variant="subtle"
                    size="md"
                  />
                  <UBadge
                    :label="boat.sellerType || 'Seller type unlisted'"
                    color="neutral"
                    variant="soft"
                    size="md"
                  />
                  <UBadge :label="formatLength(boat.length)" color="neutral" variant="soft" size="md" />
                </div>
                <div class="space-y-3">
                  <h1 class="text-balance text-3xl font-bold tracking-tight text-highlighted sm:text-4xl lg:text-5xl">
                    {{ pageTitle }}
                  </h1>
                  <p
                    class="flex items-start gap-2 text-base text-muted sm:items-center sm:text-lg"
                  >
                    <UIcon
                      name="i-lucide-map-pin"
                      class="mt-0.5 shrink-0 text-primary sm:mt-0"
                      aria-hidden="true"
                    />
                    <span>{{ headlineLocation }}</span>
                  </p>
                </div>
              </div>

              <div
                class="shrink-0 rounded-[1.35rem] border border-default bg-elevated p-5 shadow-card sm:min-w-[16rem] lg:max-w-sm lg:text-right"
              >
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                  Asking price
                </p>
                <p class="mt-2 text-3xl font-bold tabular-nums text-primary sm:text-4xl">
                  {{ formatPrice(boat.price) }}
                </p>
                <div class="mt-4 flex flex-col gap-2 lg:items-end">
                  <UButton
                    v-if="boat.url"
                    :to="boat.url"
                    external
                    target="_blank"
                    :label="getSourceCta(boat.source)"
                    icon="i-lucide-external-link"
                    size="lg"
                    class="brand-button-shadow w-full justify-center lg:w-auto"
                  />
                  <p class="text-xs text-muted">
                    {{ galleryImages.length || 0 }} cached photo{{
                      galleryImages.length === 1 ? '' : 's'
                    }}
                    · verify on source
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            class="grid min-w-0 gap-8 lg:gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start"
          >
            <div class="order-2 min-w-0 space-y-6 lg:order-1">
              <div class="space-y-4 rounded-[1.35rem] border border-default bg-muted/40 p-5 sm:p-6">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-sparkles" class="text-lg text-primary" aria-hidden="true" />
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                    Listing snapshot
                  </p>
                </div>
                <p class="text-pretty text-base leading-relaxed text-default">
                  {{ snapshotTeaser.text }}
                </p>
                <div v-if="snapshotTeaser.hasMore || boat.description" class="flex flex-wrap gap-2">
                  <UButton
                    v-if="snapshotTeaser.hasMore && boat.description"
                    label="Read full description"
                    icon="i-lucide-arrow-down"
                    color="primary"
                    variant="soft"
                    size="md"
                    @click="scrollToListingBrief"
                  />
                  <UButton
                    v-else-if="boat.description"
                    label="Jump to full brief"
                    icon="i-lucide-file-text"
                    color="neutral"
                    variant="ghost"
                    size="md"
                    @click="scrollToListingBrief"
                  />
                </div>
              </div>

              <div>
                <p class="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                  At a glance
                </p>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div
                    v-for="item in overviewFacts"
                    :key="item.label"
                    class="flex gap-3 rounded-[1.25rem] border border-default bg-elevated p-4 transition-base hover:border-primary/25"
                  >
                    <UIcon
                      :name="item.icon"
                      class="mt-0.5 size-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <div class="min-w-0">
                      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-dimmed">
                        {{ item.label }}
                      </p>
                      <p class="mt-1 text-base font-semibold text-highlighted">{{ item.value }}</p>
                      <p class="mt-1 hidden text-sm leading-snug text-muted sm:block">
                        {{ item.detail }}
                      </p>
                    </div>
                  </div>
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
                class="aspect-[4/3] w-full max-w-full overflow-hidden rounded-[1.35rem] border border-default bg-muted shadow-card"
                img-class="h-full w-full max-w-full object-cover"
                loading="eager"
              >
                <div
                  class="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-default/80 to-transparent px-4 pb-4 pt-16"
                />
                <div class="absolute inset-x-0 bottom-0 flex items-end justify-end gap-3 p-4">
                  <UBadge
                    :label="`${galleryImages.length || 0} in gallery`"
                    color="neutral"
                    variant="solid"
                    size="md"
                    class="pointer-events-auto shadow-elevated"
                  />
                </div>
              </BoatMediaImage>

              <div
                v-if="galleryImages.length > 1"
                class="flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]"
                aria-label="Listing photo thumbnails"
              >
                <UButton
                  v-for="(image, index) in galleryImages"
                  :key="`${image}-${index}`"
                  color="neutral"
                  variant="ghost"
                  class="h-24 min-h-11 w-32 min-w-11 shrink-0 overflow-hidden rounded-2xl border border-default p-0"
                  :class="index === selectedImage ? 'ring-2 ring-primary ring-offset-2 ring-offset-default' : ''"
                  :aria-label="`Show photo ${index + 1} of ${galleryImages.length}`"
                  :aria-pressed="index === selectedImage"
                  @click="selectedImage = index"
                >
                  <BoatMediaImage
                    :src="image"
                    :alt="`${pageTitle} image ${index + 1}`"
                    :width="224"
                    :height="160"
                    sizes="128px"
                    :quality="56"
                    compact-fallback
                    class="h-full w-full"
                    img-class="h-full w-full object-cover"
                  />
                </UButton>
              </div>
            </div>
          </div>
        </UCard>
      </UPageSection>

      <UPageSection :ui="{ wrapper: 'py-2' }">
        <div
          class="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:items-start"
        >
          <div class="order-2 min-w-0 space-y-8 xl:order-1">
            <UCard class="brand-surface" :ui="{ body: 'p-6 sm:p-8 space-y-5' }">
              <div class="flex items-start gap-3">
                <UIcon
                  name="i-lucide-compass"
                  class="mt-1 size-6 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div class="min-w-0 space-y-2">
                  <h2 class="text-2xl font-semibold text-highlighted">Market context</h2>
                  <p class="text-sm leading-relaxed text-muted sm:text-base">
                    Compare this listing against the surrounding market before you schedule calls,
                    surveys, or travel.
                  </p>
                </div>
              </div>

              <USeparator />

              <div class="rounded-[1.25rem] border border-default bg-muted/30 p-4 text-sm leading-relaxed text-muted">
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
                  size="md"
                />
              </div>
            </UCard>

            <div v-if="boat.description" :id="LISTING_BRIEF_ID" class="scroll-mt-28">
              <UCard class="brand-surface" :ui="{ body: 'p-6 sm:p-8 space-y-5' }">
                <div class="flex items-start gap-3">
                  <UIcon
                    name="i-lucide-scroll-text"
                    class="mt-1 size-6 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div class="min-w-0 space-y-2">
                    <h2 class="text-2xl font-semibold text-highlighted">Listing brief</h2>
                    <p class="text-sm leading-relaxed text-muted sm:text-base">
                      Full source copy is below. Use it for context, then confirm details on the
                      broker page.
                    </p>
                  </div>
                </div>
                <USeparator />
                <p class="max-w-prose whitespace-pre-wrap text-base leading-relaxed text-default">
                  {{ boat.description }}
                </p>
              </UCard>
            </div>
          </div>

          <div class="order-1 min-w-0 space-y-6 xl:order-2 xl:sticky xl:top-28">
            <UCard
              class="brand-surface border-primary/15 shadow-elevated"
              :ui="{ body: 'p-6 sm:p-7 space-y-5' }"
            >
              <div class="space-y-1">
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                  Next steps
                </p>
                <p class="text-3xl font-bold tabular-nums text-primary">{{ formatPrice(boat.price) }}</p>
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
                  size="lg"
                  class="brand-button-shadow"
                />
                <UButton
                  v-if="session.loggedIn"
                  :label="favorited ? 'Saved to favorites' : 'Save to favorites'"
                  icon="i-lucide-heart"
                  :color="favorited ? 'primary' : 'neutral'"
                  variant="soft"
                  size="lg"
                  :loading="favoriteSaving"
                  @click="toggleFavorite"
                />
                <UButton
                  v-else
                  label="Sign in to save"
                  icon="i-lucide-heart"
                  color="neutral"
                  variant="soft"
                  size="lg"
                  @click="goLoginForFavorite"
                />
              </div>

              <USeparator />

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="rounded-[1.15rem] border border-default bg-muted/25 p-4">
                  <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                    Listing ID
                  </p>
                  <p class="mt-2 text-sm font-semibold text-default">
                    {{ boat.listingId || 'Not supplied' }}
                  </p>
                </div>
                <div class="rounded-[1.15rem] border border-default bg-muted/25 p-4">
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

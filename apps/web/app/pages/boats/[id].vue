<script setup lang="ts">
import BoatFitSummaryCard from '~~/app/components/boat-finder/BoatFitSummaryCard.vue'
import BoatMediaImage from '~~/app/components/boats/BoatMediaImage.vue'
import {
  BOAT_INVENTORY_RESULTS_HASH,
  makeInventoryResultsRoute,
  makeInventorySearchLink,
} from '~~/app/utils/boatBrowse'
import { parseListingBrief } from '~~/app/utils/listingBrief'

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
      icon: 'i-lucide-calendar',
    },
    {
      label: 'Length',
      value: formatLength(boat.value.length),
      icon: 'i-lucide-ruler',
    },
    {
      label: 'Seller',
      value: boat.value.sellerType || 'Seller type unlisted',
      icon: 'i-lucide-store',
    },
    {
      label: 'Location',
      value: headlineLocation.value,
      icon: 'i-lucide-map-pin',
    },
  ]
})

const listingBriefBlocks = computed(() => {
  const d = boat.value?.description?.trim()
  if (!d) return []
  return parseListingBrief(d)
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
  <UPage class="pt-0">
    <div v-if="status === 'pending'" class="flex items-center justify-center py-24">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
    </div>

    <template v-else-if="boat">
      <!-- UPageSection padding lives on `container`, not `wrapper` (Nuxt UI defaults: py-16/24/32). -->
      <UPageSection
        :ui="{
          container: 'flex flex-col lg:grid gap-6 sm:gap-8 pt-1 pb-6 sm:pt-2 sm:pb-8 lg:pb-10',
        }"
      >
        <div class="mx-auto w-full max-w-5xl px-4 sm:px-6">
          <UButton
            :to="backToSearch"
            :label="backLabel"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="sm"
            class="mb-4"
          />

          <div class="flex flex-col items-center text-center">
            <div class="flex flex-wrap justify-center gap-2">
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

            <h1
              class="mt-4 max-w-4xl text-balance text-3xl font-bold tracking-tight text-highlighted sm:text-4xl lg:text-5xl"
            >
              {{ pageTitle }}
            </h1>

            <p class="mt-3 flex items-center justify-center gap-2 text-base text-muted sm:text-lg">
              <UIcon
                name="i-lucide-map-pin"
                class="size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span>{{ headlineLocation }}</span>
            </p>

            <p class="mt-4 text-4xl font-bold tabular-nums text-primary sm:text-5xl">
              {{ formatPrice(boat.price) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ galleryImages.length || 0 }} cached photo{{
                galleryImages.length === 1 ? '' : 's'
              }}
              · verify on source
            </p>

            <div v-if="boat.url" class="mt-5 flex flex-wrap justify-center gap-2">
              <UButton
                :to="boat.url"
                external
                target="_blank"
                :label="getSourceCta(boat.source)"
                icon="i-lucide-external-link"
                size="lg"
                class="brand-button-shadow"
              />
            </div>
          </div>

          <div class="mx-auto mt-8 w-full max-w-4xl min-w-0 space-y-3">
            <BoatMediaImage
              :src="galleryImages[selectedImage]"
              :alt="pageTitle"
              :width="1440"
              :height="1080"
              sizes="(min-width: 896px) 896px, 100vw"
              :quality="74"
              class="aspect-[16/10] max-h-[min(52vh,28rem)] w-full overflow-hidden rounded-2xl border border-default bg-muted shadow-card sm:max-h-[min(48vh,32rem)]"
              img-class="h-full w-full max-w-full object-cover"
              loading="eager"
            >
              <div
                class="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-default/80 to-transparent px-4 pb-4 pt-12"
              />
              <div class="absolute inset-x-0 bottom-0 flex items-end justify-end gap-3 p-3 sm:p-4">
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
              class="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] sm:gap-3"
              aria-label="Listing photo thumbnails"
            >
              <UButton
                v-for="(image, index) in galleryImages"
                :key="`${image}-${index}`"
                color="neutral"
                variant="ghost"
                class="h-20 min-h-11 w-28 min-w-11 shrink-0 overflow-hidden rounded-xl border border-default p-0 sm:h-24 sm:w-32"
                :class="
                  index === selectedImage
                    ? 'ring-2 ring-primary ring-offset-2 ring-offset-default'
                    : ''
                "
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
      </UPageSection>

      <UPageSection
        :ui="{
          container: 'flex flex-col lg:grid gap-6 py-4 pb-10 sm:gap-8 sm:py-6 sm:pb-12 lg:pb-14',
        }"
      >
        <div
          class="mx-auto grid min-w-0 max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start lg:gap-8"
        >
          <UCard
            class="brand-surface brand-grid-panel min-w-0 lg:col-start-1"
            :ui="{ body: 'p-4 sm:p-6 space-y-5' }"
          >
            <div class="rounded-xl border border-default bg-muted/30 p-4 sm:p-5">
              <div class="flex items-center justify-center gap-2 sm:justify-start">
                <UIcon name="i-lucide-sparkles" class="text-lg text-primary" aria-hidden="true" />
                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                  Listing snapshot
                </p>
              </div>
              <p
                class="mt-3 text-center text-pretty text-sm leading-relaxed text-default sm:text-left sm:text-base"
              >
                {{ snapshotTeaser.text }}
              </p>
              <div
                v-if="snapshotTeaser.hasMore || boat.description"
                class="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start"
              >
                <UButton
                  v-if="snapshotTeaser.hasMore && boat.description"
                  label="Jump to full brief"
                  icon="i-lucide-arrow-down"
                  color="primary"
                  variant="soft"
                  size="sm"
                  @click="scrollToListingBrief"
                />
                <UButton
                  v-else-if="boat.description"
                  label="Full brief"
                  icon="i-lucide-file-text"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @click="scrollToListingBrief"
                />
              </div>
            </div>

            <div>
              <p
                class="mb-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-dimmed sm:text-left"
              >
                At a glance
              </p>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                <div
                  v-for="item in overviewFacts"
                  :key="item.label"
                  class="flex flex-col justify-center gap-1 rounded-xl border border-default bg-elevated px-3 py-2.5"
                >
                  <div class="flex items-center gap-1.5 text-dimmed">
                    <UIcon
                      :name="item.icon"
                      class="size-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span class="text-xs font-semibold uppercase tracking-[0.1em]">
                      {{ item.label }}
                    </span>
                  </div>
                  <p
                    class="text-sm font-semibold leading-snug text-highlighted"
                    :class="item.label === 'Seller' ? 'capitalize' : ''"
                  >
                    {{ item.value }}
                  </p>
                </div>
              </div>
            </div>

            <USeparator />

            <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div class="flex items-center gap-2 text-dimmed">
                <UIcon
                  name="i-lucide-compass"
                  class="size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span class="text-sm font-semibold text-highlighted">Market</span>
              </div>
              <div class="flex flex-wrap justify-center gap-2 sm:ms-auto sm:justify-end">
                <UButton
                  v-for="link in marketLinks"
                  :key="link.label"
                  :to="link.to"
                  :label="link.label"
                  :icon="link.icon"
                  color="neutral"
                  variant="soft"
                  size="sm"
                />
              </div>
            </div>
            <p class="text-center text-xs leading-relaxed text-muted sm:text-left">
              {{ getSourceNote(boat.source) }}
            </p>

            <USeparator v-if="boat.description" />

            <div v-if="boat.description" :id="LISTING_BRIEF_ID" class="scroll-mt-24">
              <div class="flex items-start gap-2 sm:gap-3">
                <UIcon
                  name="i-lucide-scroll-text"
                  class="mt-0.5 size-5 shrink-0 text-primary sm:size-6"
                  aria-hidden="true"
                />
                <div class="min-w-0 flex-1 space-y-1">
                  <h2 class="text-lg font-semibold text-highlighted sm:text-xl">Listing brief</h2>
                  <p class="text-xs text-muted sm:text-sm">
                    Source copy — confirm on the broker site.
                  </p>
                </div>
              </div>
              <div
                class="mt-4 max-h-[min(50vh,22rem)] overflow-y-auto overscroll-y-contain rounded-xl border border-default bg-elevated/40 p-4 sm:max-h-[min(55vh,26rem)] sm:p-5"
              >
                <div v-if="listingBriefBlocks.length" class="space-y-6">
                  <template v-for="(block, bi) in listingBriefBlocks" :key="bi">
                    <div
                      v-if="block.kind === 'specs'"
                      class="rounded-lg border border-default bg-muted/20 p-3 sm:p-4"
                    >
                      <div
                        class="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]"
                      >
                        <template
                          v-for="(row, ri) in block.items"
                          :key="`${bi}-${ri}-${row.label}`"
                        >
                          <div
                            class="border-b border-default pb-1 text-xs font-medium text-dimmed sm:border-0 sm:pb-0 sm:text-sm"
                          >
                            {{ row.label }}
                          </div>
                          <div class="pb-2 text-xs leading-relaxed text-default sm:pb-0 sm:text-sm">
                            {{ row.value }}
                          </div>
                        </template>
                      </div>
                    </div>
                    <div v-else class="max-w-prose space-y-3">
                      <p class="text-sm leading-relaxed text-default sm:text-base">
                        {{ block.text }}
                      </p>
                    </div>
                  </template>
                </div>
                <p
                  v-else
                  class="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-default sm:text-base"
                >
                  {{ boat.description }}
                </p>
              </div>
            </div>
          </UCard>

          <div class="min-w-0 space-y-4 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
            <UCard
              class="brand-surface border-primary/15 shadow-elevated"
              :ui="{ body: 'p-4 sm:p-5 space-y-4' }"
            >
              <p class="text-center text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                Actions
              </p>
              <p class="text-center text-xl font-bold tabular-nums text-primary sm:text-2xl">
                {{ formatPrice(boat.price) }}
              </p>
              <div class="flex flex-col gap-2">
                <UButton
                  v-if="boat.url"
                  :to="boat.url"
                  external
                  target="_blank"
                  :label="getSourceCta(boat.source)"
                  icon="i-lucide-external-link"
                  size="md"
                  block
                  class="brand-button-shadow"
                />
                <UButton
                  v-if="session.loggedIn"
                  :label="favorited ? 'Saved' : 'Save'"
                  icon="i-lucide-heart"
                  :color="favorited ? 'primary' : 'neutral'"
                  variant="soft"
                  size="md"
                  block
                  :loading="favoriteSaving"
                  @click="toggleFavorite"
                />
                <UButton
                  v-else
                  label="Sign in to save"
                  icon="i-lucide-heart"
                  color="neutral"
                  variant="soft"
                  size="md"
                  block
                  @click="goLoginForFavorite"
                />
              </div>
              <USeparator />
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="rounded-lg border border-default bg-muted/25 p-3">
                  <p class="font-semibold uppercase tracking-wide text-dimmed">Listing ID</p>
                  <p class="mt-1 font-medium text-default">
                    {{ boat.listingId || '—' }}
                  </p>
                </div>
                <div class="rounded-lg border border-default bg-muted/25 p-3">
                  <p class="font-semibold uppercase tracking-wide text-dimmed">Type</p>
                  <p class="mt-1 font-medium text-default">
                    {{ boat.listingType || '—' }}
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

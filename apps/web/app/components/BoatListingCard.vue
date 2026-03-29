<script setup lang="ts">
import BoatMediaImage from '~~/app/components/boats/BoatMediaImage.vue'
import type { RecommendationAvoidEntry, RecommendationEntry } from '~~/lib/boatFinder'

interface Boat {
  id: number
  year: number | null
  make: string | null
  model: string | null
  length: string | null
  city: string | null
  state: string | null
  location: string | null
  price: number | null
  description: string | null
  sellerType: string | null
  source: string
  url?: string | null
  images: string[]
}

const props = withDefaults(
  defineProps<{
    boat: Boat
    recommendation?: RecommendationEntry | null
    avoidReason?: RecommendationAvoidEntry | null
    sessionId?: number | null
    presentation?: 'default' | 'recommendation'
  }>(),
  {
    recommendation: null,
    avoidReason: null,
    sessionId: null,
    presentation: 'default',
  },
)

const {
  formatPrice,
  formatLength,
  formatLocation,
  formatListingTitle,
  getSourceColor,
  getSourceLabel,
} = useBoatListingDisplay()

const detailTo = computed(() => ({
  path: `/boats/${props.boat.id}`,
  query: props.sessionId ? { sessionId: String(props.sessionId) } : undefined,
}))
const externalListingUrl = computed(() => props.boat.url?.trim() || null)
const titleText = computed(() => formatListingTitle(props.boat))
const locationText = computed(() => formatLocation(props.boat))
const lengthText = computed(() => formatLength(props.boat.length))
const yearText = computed(() => (props.boat.year ? String(props.boat.year) : 'Year unlisted'))
const priceText = computed(() => formatPrice(props.boat.price))
const boatDescription = computed(
  () =>
    props.boat.description?.trim() ||
    'Source-attributed marketplace listing ready for a closer inspection and broker follow-up.',
)
const isRecommendationPresentation = computed(
  () =>
    props.presentation === 'recommendation' || Boolean(props.recommendation || props.avoidReason),
)
const cardAccentColor = computed(() => (props.avoidReason ? 'error' : 'primary'))
const scoreLabel = computed(() => {
  if (props.avoidReason) return `${props.avoidReason.score}/100 fit`
  if (props.recommendation) return `${props.recommendation.score}/100 fit`
  return null
})

const recommendationToneLabel = computed(() => {
  if (props.avoidReason) return 'Avoid first'
  if (!props.recommendation) return ''

  switch (props.recommendation.rating) {
    case 'best-fit':
      return 'Best fit'
    case 'strong-fit':
      return 'Strong fit'
    default:
      return 'Stretch'
  }
})

const narrativeTitle = computed(() => {
  if (props.avoidReason) return props.avoidReason.headline
  return props.recommendation?.headline || 'Inspect the listing details'
})

const narrativeBody = computed(() => {
  if (props.avoidReason) return props.avoidReason.whyToAvoid
  return props.recommendation?.whyItFits || boatDescription.value
})

const secondaryNarrative = computed(() => {
  if (props.avoidReason) {
    return props.avoidReason.watchouts.join(' ')
  }

  return (
    props.recommendation?.tradeoffs ||
    'Verify engine hours, maintenance history, and survey findings before advancing this listing.'
  )
})
</script>

<template>
  <UCard
    class="brand-surface overflow-hidden border-default transition-base hover:-translate-y-1 hover:shadow-elevated"
    :class="isRecommendationPresentation ? 'rounded-[1.8rem]' : ''"
    :ui="{ body: isRecommendationPresentation ? 'p-0' : 'p-0' }"
  >
    <div v-if="isRecommendationPresentation" class="grid gap-0 xl:grid-cols-[20rem_minmax(0,1fr)]">
      <div class="relative">
        <BoatMediaImage
          :src="props.boat.images?.[0]"
          :alt="titleText"
          :width="900"
          :height="700"
          sizes="100vw xl:20rem"
          :quality="70"
          class="aspect-[4/3] border-b border-default bg-muted xl:h-full xl:border-b-0 xl:border-r"
          img-class="h-full w-full object-cover"
        >
          <div class="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
            <UBadge
              :label="getSourceLabel(props.boat.source)"
              :color="getSourceColor(props.boat.source)"
              variant="solid"
              size="xs"
            />
            <div class="flex flex-wrap justify-end gap-2">
              <UBadge
                v-if="recommendationToneLabel"
                :label="recommendationToneLabel"
                :color="cardAccentColor"
                variant="solid"
                size="xs"
              />
              <UBadge
                v-if="scoreLabel"
                :label="scoreLabel"
                color="neutral"
                variant="solid"
                size="xs"
              />
            </div>
          </div>

          <div class="absolute inset-x-0 bottom-0 p-3">
            <div class="rounded-2xl bg-black/40 px-3 py-2 text-white backdrop-blur-md">
              <p class="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-white/70">
                Market snapshot
              </p>
              <div class="mt-1 flex items-end justify-between gap-3">
                <p class="text-base font-semibold text-white">{{ priceText }}</p>
                <p class="text-xs font-medium text-white/80">{{ lengthText }}</p>
              </div>
            </div>
          </div>
        </BoatMediaImage>
      </div>

      <div class="space-y-5 p-4 sm:p-5 xl:p-6">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :label="yearText" color="neutral" variant="soft" size="sm" />
            <UBadge :label="lengthText" color="neutral" variant="soft" size="sm" />
            <UBadge
              v-if="props.boat.sellerType"
              :label="props.boat.sellerType"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>

          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
              {{ locationText }}
            </p>
            <h3 class="text-2xl font-semibold text-highlighted">
              {{ titleText }}
            </h3>
            <p class="text-lg font-semibold text-primary">
              {{ priceText }}
            </p>
          </div>

          <p class="text-sm leading-6 text-muted">
            {{ boatDescription }}
          </p>
        </div>

        <div
          class="space-y-3 rounded-[1.4rem] border px-4 py-4"
          :class="
            props.avoidReason ? 'border-error/25 bg-error/8' : 'border-primary/15 bg-primary/6'
          "
        >
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              :label="props.avoidReason ? 'Pass first' : 'Why this made the shortlist'"
              :color="cardAccentColor"
              variant="soft"
              size="sm"
            />
            <UBadge
              v-if="recommendationToneLabel"
              :label="recommendationToneLabel"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>
          <h4 class="text-lg font-semibold text-default">{{ narrativeTitle }}</h4>
          <p class="text-sm leading-6 text-default">{{ narrativeBody }}</p>
          <p class="text-sm leading-6 text-muted">{{ secondaryNarrative }}</p>
        </div>

        <div class="flex flex-wrap gap-3">
          <UButton
            :to="detailTo"
            label="Open boat detail"
            :color="cardAccentColor"
            icon="i-lucide-ship-wheel"
          />
          <UButton
            v-if="externalListingUrl"
            :to="externalListingUrl"
            label="Open source listing"
            color="neutral"
            variant="soft"
            icon="i-lucide-arrow-up-right"
            target="_blank"
          />
        </div>
      </div>
    </div>

    <div v-else>
      <BoatMediaImage
        :src="props.boat.images?.[0]"
        :alt="titleText"
        :width="720"
        :height="540"
        sizes="100vw md:50vw 2xl:33vw"
        :quality="68"
        class="aspect-[4/3] border-b border-default bg-muted"
        img-class="h-full w-full object-cover"
      >
        <div class="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
          <UBadge
            :label="getSourceLabel(props.boat.source)"
            :color="getSourceColor(props.boat.source)"
            variant="solid"
            size="xs"
          />
        </div>

        <div class="absolute inset-x-0 bottom-0 p-3">
          <div class="rounded-2xl bg-black/35 px-3 py-2 text-white backdrop-blur-md">
            <p class="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-white/70">
              Market snapshot
            </p>
            <div class="mt-1 flex items-end justify-between gap-3">
              <p class="text-base font-semibold text-white">{{ priceText }}</p>
              <p class="text-xs font-medium text-white/80">{{ lengthText }}</p>
            </div>
          </div>
        </div>
      </BoatMediaImage>

      <div class="space-y-4 p-4 sm:p-5">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :label="yearText" color="neutral" variant="soft" size="sm" />
            <UBadge :label="lengthText" color="neutral" variant="soft" size="sm" />
            <UBadge
              v-if="props.boat.sellerType"
              :label="props.boat.sellerType"
              variant="soft"
              size="sm"
            />
          </div>

          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
              {{ locationText }}
            </p>
            <h3 class="line-clamp-2 text-xl font-semibold text-highlighted">
              {{ titleText }}
            </h3>
            <p class="text-lg font-semibold text-primary">
              {{ priceText }}
            </p>
          </div>
        </div>

        <p class="line-clamp-3 text-sm text-muted">
          {{ boatDescription }}
        </p>

        <div class="flex flex-wrap gap-3">
          <UButton :to="detailTo" label="Open boat" color="primary" icon="i-lucide-ship-wheel" />
          <UButton
            v-if="externalListingUrl"
            :to="externalListingUrl"
            label="Source listing"
            color="neutral"
            variant="soft"
            icon="i-lucide-arrow-up-right"
            target="_blank"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>

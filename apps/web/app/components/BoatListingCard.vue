<script setup lang="ts">
import BoatMediaImage from '~~/app/components/boats/BoatMediaImage.vue'
import type { RecommendationEntry } from '~~/lib/boatFinder'

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
  images: string[]
}

const props = defineProps<{
  boat: Boat
  recommendation?: RecommendationEntry | null
  sessionId?: number | null
}>()

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

const ratingLabel = computed(() => {
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
</script>

<template>
  <NuxtLink
    :to="detailTo"
    class="brand-surface group cursor-pointer overflow-hidden transition-base hover:-translate-y-1 hover:shadow-elevated"
  >
    <BoatMediaImage
      :src="props.boat.images?.[0]"
      :alt="titleText"
      :width="720"
      :height="540"
      sizes="100vw md:50vw 2xl:33vw"
      :quality="68"
      class="aspect-[4/3] border-b border-default bg-muted"
      img-class="h-full w-full object-cover transition-slow group-hover:scale-[1.03]"
    >
      <div class="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <UBadge
          :label="getSourceLabel(props.boat.source)"
          :color="getSourceColor(props.boat.source)"
          variant="solid"
          size="xs"
        />
        <UBadge
          v-if="props.recommendation"
          :label="ratingLabel"
          color="primary"
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

    <div class="relative space-y-4 p-4 sm:p-5">
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
          <UBadge
            v-if="props.recommendation"
            :label="`${props.recommendation.score}/100 fit`"
            color="neutral"
            variant="subtle"
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

      <div v-if="props.recommendation" class="brand-surface-soft space-y-2 rounded-3xl p-3">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-default">{{ props.recommendation.headline }}</p>
          <span class="text-xs font-semibold uppercase tracking-wide text-dimmed">{{
            ratingLabel
          }}</span>
        </div>
        <p class="line-clamp-2 text-sm text-default">{{ props.recommendation.whyItFits }}</p>
        <p class="line-clamp-1 text-xs text-muted">
          Trade-off: {{ props.recommendation.tradeoffs }}
        </p>
      </div>

      <div class="flex items-center justify-between gap-3 pt-1 text-sm font-semibold text-default">
        <span>{{ props.recommendation ? 'Inspect fit summary' : 'Inspect listing details' }}</span>
        <UIcon
          name="i-lucide-arrow-up-right"
          class="transition-fast group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        />
      </div>
    </div>
  </NuxtLink>
</template>

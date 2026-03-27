<script setup lang="ts">
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

const { formatPrice, getSourceColor, getSourceLabel } = useBoatListingDisplay()
const detailTo = computed(() => ({
  path: `/boats/${props.boat.id}`,
  query: props.sessionId ? { sessionId: String(props.sessionId) } : undefined,
}))
const titleText = computed(
  () =>
    `${props.boat.year || ''} ${props.boat.make || ''} ${props.boat.model || ''}`.trim() ||
    'Fishing boat listing',
)
const locationText = computed(
  () =>
    `${props.boat.length || '?'}ft · ${props.boat.city || props.boat.state || props.boat.location || 'US'}`,
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
    class="card-base rounded-xl overflow-hidden transition-base hover:shadow-elevated group"
  >
    <div class="aspect-video bg-muted overflow-hidden relative">
      <img
        v-if="props.boat.images && props.boat.images.length > 0"
        :src="props.boat.images[0]"
        :alt="titleText"
        class="w-full h-full object-cover group-hover:scale-105 transition-slow"
        loading="lazy"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-dimmed">
        <UIcon name="i-lucide-ship" class="text-4xl" />
      </div>
      <div class="absolute top-2 left-2">
        <UBadge
          :label="getSourceLabel(props.boat.source)"
          :color="getSourceColor(props.boat.source)"
          variant="solid"
          size="xs"
        />
      </div>
      <div v-if="props.recommendation" class="absolute top-2 right-2">
        <UBadge :label="ratingLabel" color="primary" variant="solid" size="xs" />
      </div>
    </div>

    <div class="p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="font-semibold text-default truncate">
            {{ titleText }}
          </h3>
          <p class="text-sm text-muted truncate">
            {{ locationText }}
          </p>
        </div>
        <span class="text-lg font-bold text-primary whitespace-nowrap">
          {{ formatPrice(props.boat.price) }}
        </span>
      </div>
      <p v-if="props.boat.description" class="mt-2 text-xs text-dimmed line-clamp-2">
        {{ props.boat.description }}
      </p>
      <div v-if="props.boat.sellerType" class="mt-2 flex items-center gap-2">
        <UBadge :label="props.boat.sellerType" variant="subtle" size="sm" />
      </div>
      <div v-if="props.recommendation" class="mt-3 rounded-lg bg-elevated px-3 py-2 space-y-1">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium text-default">{{ props.recommendation.headline }}</p>
          <UBadge
            :label="`${props.recommendation.score}/100`"
            color="neutral"
            variant="subtle"
            size="xs"
          />
        </div>
        <p class="text-sm text-default">{{ props.recommendation.whyItFits }}</p>
        <p class="text-xs text-muted">Trade-off: {{ props.recommendation.tradeoffs }}</p>
      </div>
    </div>
  </NuxtLink>
</template>

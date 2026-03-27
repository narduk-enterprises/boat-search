<script setup lang="ts">
import type { RecommendationSession } from '~~/lib/boatFinder'

interface RecommendationBoat {
  id: number
  listingId: string | null
  source: string
  url: string
  make: string | null
  model: string | null
  year: number | null
  length: string | null
  price: number | null
  currency: string | null
  location: string | null
  city: string | null
  state: string | null
  country: string | null
  description: string | null
  sellerType: string | null
  listingType: string | null
  images: string[]
  scrapedAt: string
  updatedAt: string
}

const props = defineProps<{
  session: RecommendationSession | null
  boats: RecommendationBoat[]
}>()

const recommendationMap = computed(() => {
  const entries = props.session?.resultSummary.recommendations ?? []
  return new Map(entries.map((entry) => [entry.boatId, entry]))
})

const orderedBoats = computed(() =>
  props.boats.filter((boat) => recommendationMap.value.has(boat.id)),
)

const topPickLabel = computed(() => {
  const topPickBoatId = props.session?.resultSummary.topPickBoatId
  if (!topPickBoatId) return null
  const boat = props.boats.find((candidate) => candidate.id === topPickBoatId)
  if (!boat) return null
  return `${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`.trim() || 'Top pick'
})
</script>

<template>
  <div class="space-y-6">
    <UCard
      v-if="props.session"
      class="card-base border-default"
      :ui="{ body: 'p-5 sm:p-6 space-y-4' }"
    >
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-2">
          <UBadge
            label="Latest AI shortlist"
            color="primary"
            variant="subtle"
            icon="i-lucide-sparkles"
          />
          <h2 class="text-2xl font-semibold text-default">
            {{ props.session.resultSummary.querySummary }}
          </h2>
          <p class="text-muted max-w-3xl">
            {{ props.session.resultSummary.overallAdvice }}
          </p>
        </div>
        <div class="rounded-xl bg-muted px-4 py-3 text-sm text-default">
          <p class="text-dimmed">Top pick</p>
          <p class="mt-1 font-semibold">{{ topPickLabel || 'No top pick yet' }}</p>
        </div>
      </div>
    </UCard>

    <div
      v-if="props.session && orderedBoats.length === 0"
      class="card-base rounded-2xl border-default px-6 py-12 text-center"
    >
      <UIcon name="i-lucide-ship-wheel" class="mx-auto text-4xl text-dimmed" />
      <h3 class="mt-4 text-xl font-semibold text-default">No strong matches yet</h3>
      <p class="mt-2 text-muted max-w-2xl mx-auto">
        The current fishing inventory does not cleanly satisfy this brief. Adjust the region,
        budget, or size range and rerun the finder.
      </p>
      <UButton
        class="mt-6"
        to="/ai-boat-finder"
        label="Refine questionnaire"
        icon="i-lucide-sliders-horizontal"
      />
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <BoatListingCard
        v-for="boat in orderedBoats"
        :key="boat.id"
        :boat="boat"
        :recommendation="recommendationMap.get(boat.id)"
        :session-id="props.session?.id ?? null"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ratingFromScore,
  type RecommendationEntry,
  type RecommendationSession,
} from '~~/lib/boatFinder'

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

function syntheticEntriesForRankedIds(session: RecommendationSession): RecommendationEntry[] {
  return session.rankedBoatIds.map((boatId, index) => {
    const score = Math.max(50, 72 - index * 2)
    const rating = ratingFromScore(score)
    return {
      boatId,
      rating,
      headline:
        rating === 'best-fit'
          ? 'Top of this shortlist run'
          : rating === 'strong-fit'
            ? 'Shortlist match'
            : 'Ranked option — review trade-offs',
      whyItFits:
        session.resultSummary.overallAdvice.slice(0, 300).trim() ||
        'This listing appeared in your latest shortlist run.',
      tradeoffs: 'Verify engine hours, maintenance, and survey details on the source listing.',
      score,
    }
  })
}

const recommendationMap = computed(() => {
  const session = props.session
  if (!session) return new Map<number, RecommendationEntry>()

  let entries = session.resultSummary.recommendations
  if (!entries.length && session.rankedBoatIds.length > 0) {
    entries = syntheticEntriesForRankedIds(session)
  }

  return new Map(entries.map((entry) => [entry.boatId, entry]))
})

const orderedBoats = computed(() => {
  const session = props.session
  if (!session) return []

  const byId = new Map(props.boats.map((boat) => [boat.id, boat]))
  const orderIds =
    session.resultSummary.recommendations.length > 0
      ? session.resultSummary.recommendations.map((e) => e.boatId)
      : session.rankedBoatIds

  return orderIds
    .map((id) => byId.get(id))
    .filter((boat): boat is RecommendationBoat => Boolean(boat))
})

const topPickLabel = computed(() => {
  const topPickBoatId = props.session?.resultSummary.topPickBoatId
  if (!topPickBoatId) return null
  const boat = props.boats.find((candidate) => candidate.id === topPickBoatId)
  if (!boat) return null
  return `${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`.trim() || 'Top pick'
})

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

function formatMoney(value: number | undefined) {
  if (value == null) return null
  return currencyFormatter.format(value)
}

const activeFilters = computed(() => {
  const filters = props.session?.generatedFilters
  if (!filters) return []

  const filterTags = [
    filters.location || null,
    formatMoney(filters.budgetMax) ? `Budget to ${formatMoney(filters.budgetMax)}` : null,
    filters.lengthMin != null || filters.lengthMax != null
      ? `${filters.lengthMin ?? 0}-${filters.lengthMax ?? 120} ft`
      : null,
    ...filters.keywords,
  ]

  return filterTags.filter((value): value is string => Boolean(value)).slice(0, 6)
})
</script>

<template>
  <div class="space-y-4">
    <UCard
      v-if="props.session"
      class="brand-surface border-default/80 shadow-card"
      :ui="{ body: 'p-4 sm:p-5' }"
    >
      <div class="grid gap-4 lg:grid-cols-[1.25fr_0.75fr] lg:items-start">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              label="Latest AI shortlist"
              color="primary"
              variant="subtle"
              icon="i-lucide-sparkles"
            />
            <UBadge
              :label="`${orderedBoats.length} ranked boat${orderedBoats.length === 1 ? '' : 's'}`"
              color="neutral"
              variant="subtle"
            />
          </div>
          <h2 class="text-xl font-semibold text-default">
            {{ props.session.resultSummary.querySummary }}
          </h2>
          <p class="max-w-3xl text-sm text-muted line-clamp-3">
            {{ props.session.resultSummary.overallAdvice }}
          </p>

          <div v-if="activeFilters.length" class="flex flex-wrap gap-2">
            <UBadge
              v-for="filterTag in activeFilters"
              :key="filterTag"
              :label="filterTag"
              color="neutral"
              variant="soft"
            />
          </div>
        </div>

        <div class="brand-surface-soft rounded-[1.4rem] px-4 py-4 text-sm text-default">
          <p class="brand-caption">Top pick</p>
          <p class="mt-2 text-lg font-semibold text-highlighted">
            {{ topPickLabel || 'No top pick yet' }}
          </p>
          <p class="mt-2 text-xs text-muted">
            Review the card notes below for fit score, trade-offs, and source details.
          </p>
        </div>
      </div>
    </UCard>

    <div
      v-if="props.session && orderedBoats.length === 0"
      class="brand-surface rounded-[1.8rem] px-6 py-12 text-center"
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

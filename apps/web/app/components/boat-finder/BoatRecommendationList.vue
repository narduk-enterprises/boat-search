<script setup lang="ts">
import {
  ratingFromScore,
  type RecommendationAvoidEntry,
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
            : 'Ranked option with visible trade-offs',
      whyItFits:
        session.resultSummary.overallAdvice.slice(0, 600).trim() ||
        'This listing appeared in your latest shortlist run and held up better than the rest of the active candidate pool.',
      tradeoffs:
        'Verify engine hours, maintenance history, survey details, and exact equipment on the source listing before you treat it as a finalist.',
      score,
    }
  })
}

const boatMap = computed(() => new Map(props.boats.map((boat) => [boat.id, boat])))

const recommendationMap = computed(() => {
  const session = props.session
  if (!session) return new Map<number, RecommendationEntry>()

  let entries = session.resultSummary.recommendations
  if (!entries.length && session.rankedBoatIds.length > 0) {
    entries = syntheticEntriesForRankedIds(session)
  }

  return new Map(entries.map((entry) => [entry.boatId, entry]))
})

const avoidanceMap = computed(() => {
  const session = props.session
  if (!session) return new Map<number, RecommendationAvoidEntry>()
  return new Map(session.resultSummary.boatsToAvoid.map((entry) => [entry.boatId, entry]))
})

const orderedBoats = computed(() => {
  const session = props.session
  if (!session) return []

  const orderIds =
    session.resultSummary.recommendations.length > 0
      ? session.resultSummary.recommendations.map((entry) => entry.boatId)
      : session.rankedBoatIds

  return orderIds
    .map((id) => boatMap.value.get(id))
    .filter((boat): boat is RecommendationBoat => Boolean(boat))
})

const avoidBoats = computed(() => {
  const session = props.session
  if (!session) return []

  return session.resultSummary.boatsToAvoid
    .map((entry) => boatMap.value.get(entry.boatId))
    .filter((boat): boat is RecommendationBoat => Boolean(boat))
})

const topPickLabel = computed(() => {
  const topPickBoatId = props.session?.resultSummary.topPickBoatId
  if (!topPickBoatId) return null
  const boat = props.boats.find((candidate) => candidate.id === topPickBoatId)
  if (!boat) return null
  return `${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`.trim() || 'Top pick'
})

const topPickRoute = computed(() => {
  const topPickBoatId = props.session?.resultSummary.topPickBoatId
  if (!topPickBoatId) return null
  return {
    path: `/boats/${topPickBoatId}`,
    query: props.session?.id ? { sessionId: String(props.session.id) } : undefined,
  }
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

  return filterTags.filter((value): value is string => Boolean(value)).slice(0, 8)
})
</script>

<template>
  <div class="space-y-6">
    <UCard
      v-if="props.session"
      class="brand-surface border-default/80 shadow-card"
      :ui="{ body: 'p-4 sm:p-5 space-y-5' }"
    >
      <div class="grid gap-5 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
        <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              label="Latest AI shortlist"
              color="primary"
              variant="subtle"
              icon="i-lucide-sparkles"
            />
            <UBadge
              :label="`${orderedBoats.length} pursue / ${avoidBoats.length} pass`"
              color="neutral"
              variant="subtle"
            />
          </div>

          <div class="space-y-3">
            <h2 class="text-xl font-semibold text-default sm:text-2xl">
              {{ props.session.resultSummary.querySummary }}
            </h2>
            <p class="text-sm leading-7 text-default sm:text-base">
              {{ props.session.resultSummary.overallAdvice }}
            </p>
            <p v-if="props.session.resultSummary.lifeFitNote" class="text-sm leading-7 text-muted">
              {{ props.session.resultSummary.lifeFitNote }}
            </p>
          </div>

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

        <div class="space-y-4">
          <div class="brand-surface-soft rounded-[1.4rem] px-4 py-4 text-sm text-default">
            <p class="brand-caption">Top pick</p>
            <p class="mt-2 text-lg font-semibold text-highlighted">
              {{ topPickLabel || 'No top pick yet' }}
            </p>
            <p class="mt-2 text-xs leading-6 text-muted">
              Start here, then work down the pursue list before giving time to the weaker or avoid
              listings.
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <UButton
                v-if="topPickRoute"
                :to="topPickRoute"
                label="Open top pick"
                color="primary"
                icon="i-lucide-ship-wheel"
              />
            </div>
            <p
              v-if="props.session.resultSummary.meta.resolvedModel"
              class="mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-dimmed"
            >
              {{ props.session.resultSummary.meta.resolvedModel }}
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div class="brand-surface-soft rounded-[1.4rem] p-4">
              <p class="brand-caption">Pursue first</p>
              <p class="mt-2 text-lg font-semibold text-default">{{ orderedBoats.length }}</p>
            </div>
            <div class="brand-surface-soft rounded-[1.4rem] p-4">
              <p class="brand-caption">Pass first</p>
              <p class="mt-2 text-lg font-semibold text-default">{{ avoidBoats.length }}</p>
            </div>
            <div class="brand-surface-soft rounded-[1.4rem] p-4">
              <p class="brand-caption">Ranking mode</p>
              <p class="mt-2 text-lg font-semibold text-primary">
                {{ props.session.resultSummary.generatedBy === 'ai' ? 'AI-ranked' : 'Fallback' }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <div
      v-if="props.session && orderedBoats.length === 0"
      class="brand-surface rounded-[1.8rem] px-6 py-12 text-center"
    >
      <UIcon name="i-lucide-ship-wheel" class="mx-auto text-4xl text-dimmed" />
      <h3 class="mt-4 text-xl font-semibold text-default">No strong matches yet</h3>
      <p class="mx-auto mt-2 max-w-2xl text-muted">
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

    <div v-else class="space-y-8">
      <section class="space-y-4">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge label="Pursue first" color="primary" variant="subtle" />
            <UBadge
              :label="`${orderedBoats.length} shortlist boat${orderedBoats.length === 1 ? '' : 's'}`"
              color="neutral"
              variant="soft"
            />
          </div>
          <p class="text-sm text-muted">
            These are the listings worth opening first. Each card links to the internal boat page
            and the original source listing so you can move directly into diligence.
          </p>
        </div>

        <div class="space-y-4">
          <BoatListingCard
            v-for="boat in orderedBoats"
            :key="boat.id"
            :boat="boat"
            :recommendation="recommendationMap.get(boat.id)"
            :session-id="props.session?.id ?? null"
            presentation="recommendation"
          />
        </div>
      </section>

      <section v-if="avoidBoats.length" class="space-y-4">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge label="Boats to avoid first" color="error" variant="subtle" />
            <UBadge
              :label="`${avoidBoats.length} weak-fit boat${avoidBoats.length === 1 ? '' : 's'}`"
              color="neutral"
              variant="soft"
            />
          </div>
          <p class="text-sm text-muted">
            These are the boats the current brief says to skip or deprioritize. They are still
            linked so you can inspect them, but the point is to save your time, not create more
            tabs.
          </p>
        </div>

        <div class="space-y-4">
          <BoatListingCard
            v-for="boat in avoidBoats"
            :key="boat.id"
            :boat="boat"
            :avoid-reason="avoidanceMap.get(boat.id)"
            :session-id="props.session?.id ?? null"
            presentation="recommendation"
          />
        </div>
      </section>
    </div>
  </div>
</template>

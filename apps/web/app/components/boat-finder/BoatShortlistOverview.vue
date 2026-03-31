<script setup lang="ts">
import type { RecommendationSession } from '~~/lib/boatFinder'

interface RecommendationBoat {
  id: number
  url: string
  make: string | null
  model: string | null
  year: number | null
  location: string | null
}

const props = defineProps<{
  session: RecommendationSession | null
  boats: RecommendationBoat[]
  profileSignals: string[]
  loading?: boolean
}>()

function formatBoatLabel(boat: RecommendationBoat) {
  return `${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`.trim() || 'Unnamed boat'
}

const topPickBoat = computed(() => {
  const boatId = props.session?.resultSummary.topPickBoatId
  if (!boatId) return null
  return props.boats.find((boat) => boat.id === boatId) ?? null
})

const topPickDetailTo = computed(() => {
  const boat = topPickBoat.value
  if (!boat) return null

  return {
    path: `/boats/${boat.id}`,
    query: props.session?.id ? { sessionId: String(props.session.id) } : undefined,
  }
})

const sessionSummaryPreview = computed(() => {
  const advice = props.session?.resultSummary.overallAdvice?.trim()
  if (!advice) return ''
  return advice.length > 320 ? `${advice.slice(0, 317).trimEnd()}...` : advice
})

const overviewMetrics = computed(() => {
  const session = props.session
  if (!session) return []

  return [
    {
      label: 'Ranked boats',
      value: String(session.rankedBoatIds.length),
      tone: 'text-highlighted',
    },
    {
      label: 'Finder mode',
      value: session.resultSummary.generatedBy === 'ai' ? 'AI-ranked' : 'Fallback ranked',
      tone: 'text-primary',
    },
    {
      label: 'Top pick',
      value: topPickBoat.value ? formatBoatLabel(topPickBoat.value) : 'Review shortlist below',
      tone: 'text-default',
    },
    {
      label: 'Last run',
      value: session.createdAt,
      tone: 'text-default',
      isTime: true,
    },
  ]
})
</script>

<template>
  <div class="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
    <div class="brand-grid-panel space-y-5 p-6 sm:p-8">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            label="Saved buyer intelligence"
            color="primary"
            variant="subtle"
            icon="i-lucide-sparkles"
          />
          <UBadge
            v-if="props.session"
            :label="
              props.session.resultSummary.generatedBy === 'ai'
                ? 'AI reranked'
                : 'Fallback ranking'
            "
            color="neutral"
            variant="soft"
          />
        </div>

        <h1 class="max-w-4xl text-4xl font-semibold text-highlighted sm:text-5xl">
          Your working shortlist, not another pile of tabs.
        </h1>

        <p class="max-w-3xl text-base text-muted sm:text-lg">
          Boat Search keeps your saved fishing brief, ranking logic, and live-market candidates in
          one board so you can inspect the right listings faster, reopen prior runs, and stop
          wasting time on weak fits.
        </p>
      </div>

      <div class="flex flex-wrap gap-3">
        <UButton
          to="/ai-boat-finder"
          label="Run finder again"
          icon="i-lucide-sparkles"
          size="lg"
          class="brand-button-shadow"
        />
        <UButton
          to="/account/recommendations"
          label="View run history"
          color="neutral"
          variant="soft"
          icon="i-lucide-history"
          size="lg"
        />
      </div>

      <div v-if="props.profileSignals.length" class="flex flex-wrap gap-2">
        <UBadge
          v-for="signal in props.profileSignals"
          :key="signal"
          :label="signal"
          color="neutral"
          variant="soft"
          size="lg"
        />
      </div>
    </div>

    <div class="brand-surface space-y-5 p-5 sm:p-6">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-2">
          <p class="brand-caption">Active shortlist</p>
          <h2 class="text-xl font-semibold text-default sm:text-2xl">
            {{
              props.loading
                ? 'Loading your saved shortlist...'
                : props.session?.resultSummary.querySummary ||
              'No shortlist loaded yet. Run the finder to generate one.'
            }}
          </h2>
        </div>

        <UBadge
          :label="
            props.loading
              ? 'Loading shortlist'
              : props.session
                ? 'Ready to review'
                : 'Waiting on first run'
          "
          :color="props.loading || props.session ? 'primary' : 'neutral'"
          variant="soft"
        />
      </div>

      <div
        v-if="props.session"
        class="grid gap-3 sm:grid-cols-2"
      >
        <div
          v-for="metric in overviewMetrics"
          :key="metric.label"
          class="brand-surface-soft rounded-[1.4rem] p-4"
        >
          <p class="brand-caption">{{ metric.label }}</p>
          <p :class="['mt-2 text-base font-semibold sm:text-lg', metric.tone]">
            <NuxtTime
              v-if="metric.isTime"
              :datetime="metric.value"
              date-style="medium"
              time-style="short"
            />
            <template v-else>{{ metric.value }}</template>
          </p>
        </div>
      </div>

      <p v-if="sessionSummaryPreview" class="text-sm leading-7 text-muted">
        {{ sessionSummaryPreview }}
      </p>

      <div
        v-else-if="props.loading"
        class="rounded-[1.4rem] border border-default/80 bg-default/80 p-4 text-sm text-muted"
      >
        We are loading the latest saved run, boats, and AI ranking notes for this board.
      </div>

      <div
        v-if="topPickBoat"
        class="rounded-[1.4rem] border border-primary/15 bg-primary/5 p-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <p class="brand-caption">Start here</p>
            <p class="text-lg font-semibold text-highlighted">
              {{ formatBoatLabel(topPickBoat) }}
            </p>
            <p class="text-sm text-muted">
              {{ topPickBoat.location || 'Location not listed' }}
            </p>
          </div>

          <UBadge label="Top pick" color="primary" variant="soft" />
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            v-if="topPickDetailTo"
            :to="topPickDetailTo"
            label="Open top pick"
            color="primary"
            icon="i-lucide-ship-wheel"
          />
          <UButton
            v-if="topPickBoat.url"
            :to="topPickBoat.url"
            label="Source listing"
            color="neutral"
            variant="soft"
            icon="i-lucide-arrow-up-right"
            target="_blank"
          />
          <UButton
            to="#full-shortlist"
            label="Jump to shortlist"
            color="neutral"
            variant="ghost"
            icon="i-lucide-move-down"
          />
        </div>
      </div>

      <div
        v-else
        class="rounded-[1.4rem] border border-default/80 bg-default/80 p-4 text-sm text-muted"
      >
        The detailed pursue and avoid breakdown lives in the shortlist board below.
      </div>

      <p
        v-if="props.session?.resultSummary.meta.resolvedModel"
        class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed"
      >
        Model: {{ props.session.resultSummary.meta.resolvedModel }}
      </p>
    </div>
  </div>
</template>

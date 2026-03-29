<script setup lang="ts">
import { buildBuyerContext, getEffectiveBuyerAnswers } from '~~/lib/boatFinder'

definePageMeta({ middleware: ['auth'] })

useSeo({
  title: 'Your Fishing Boat Shortlist',
  description:
    'AI-ranked fishing boat matches generated from your saved buyer brief and the current inventory.',
  ogImage: {
    title: 'Your Fishing Boat Shortlist',
    description: 'Ranked fishing boat matches with fit commentary and source links.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Your Fishing Boat Shortlist',
  description: 'Authenticated shortlist page for AI-ranked fishing boat recommendations.',
})

const route = useRoute()
const sessionId = computed(() => {
  const value = route.query.sessionId
  if (typeof value !== 'string') return null
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
})

const { currentSession, currentBoats, detailStatus, detailError, latestSessionId } =
  useRecommendationSessions(sessionId)

const errorMessage = computed(() => {
  const error = detailError.value as { data?: { statusMessage?: string }; message?: string } | null
  return error?.data?.statusMessage || error?.message || null
})

const profileSignals = computed(() => {
  const session = currentSession.value
  if (!session) return []

  const context =
    session.profileSnapshot.normalizedContext ??
    buildBuyerContext(getEffectiveBuyerAnswers(session.profileSnapshot))

  return [
    ...context.filterSummary.hardConstraintSummary.slice(0, 3),
    ...context.filterSummary.softPreferenceSummary.slice(0, 3),
  ]
})

const topPickBoat = computed(() => {
  const boatId = currentSession.value?.resultSummary.topPickBoatId
  if (!boatId) return null
  return currentBoats.value.find((boat) => boat.id === boatId) ?? null
})

function formatBoatLabel(boat: { year: number | null; make: string | null; model: string | null }) {
  return `${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`.trim() || 'Unnamed boat'
}

function boatDetailTo(boatId: number) {
  return {
    path: `/boats/${boatId}`,
    query: currentSession.value?.id ? { sessionId: String(currentSession.value.id) } : undefined,
  }
}

const topPickDetailTo = computed(() => {
  const boat = topPickBoat.value
  return boat ? boatDetailTo(boat.id) : null
})

const quickPursueBoats = computed(() => {
  const session = currentSession.value
  if (!session) return []

  const orderedIds =
    session.resultSummary.recommendations.length > 0
      ? session.resultSummary.recommendations.map((item) => item.boatId)
      : session.rankedBoatIds
  const byId = new Map(currentBoats.value.map((boat) => [boat.id, boat]))

  return orderedIds
    .map((boatId) => byId.get(boatId))
    .filter((boat): boat is (typeof currentBoats.value)[number] => Boolean(boat))
    .slice(0, 3)
})

const quickAvoidBoats = computed(() => {
  const session = currentSession.value
  if (!session) return []

  const byId = new Map(currentBoats.value.map((boat) => [boat.id, boat]))

  return session.resultSummary.boatsToAvoid
    .map((item) => byId.get(item.boatId))
    .filter((boat): boat is (typeof currentBoats.value)[number] => Boolean(boat))
    .slice(0, 2)
})

const shortlistMetrics = computed(() => {
  const session = currentSession.value
  if (!session) return []

  return [
    {
      label: 'Ranked boats',
      value: String(session.rankedBoatIds.length),
      tone: 'text-highlighted',
    },
    {
      label: 'Top pick',
      value:
        topPickBoat.value?.make || topPickBoat.value?.model
          ? [topPickBoat.value?.make, topPickBoat.value?.model].filter(Boolean).join(' ')
          : 'Awaiting review',
      tone: 'text-default',
    },
    {
      label: 'Finder mode',
      value: session.resultSummary.generatedBy === 'ai' ? 'AI-ranked' : 'Fallback ranked',
      tone: 'text-primary',
    },
  ]
})
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
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
                v-if="currentSession"
                :label="
                  currentSession.resultSummary.generatedBy === 'ai'
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
              Boat Search keeps your saved fishing brief, ranking logic, and live-market candidates
              in one board so you can inspect the right listings faster, open the source boats
              directly, and skip the ones that are not worth your time.
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

          <div v-if="profileSignals.length" class="flex flex-wrap gap-2">
            <UBadge
              v-for="signal in profileSignals"
              :key="signal"
              :label="signal"
              color="neutral"
              variant="soft"
              size="lg"
            />
          </div>
        </div>

        <div class="brand-surface space-y-5 p-5 sm:p-6">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="brand-caption">Session state</p>
              <h2 class="mt-2 text-xl font-semibold text-default">
                {{ currentSession?.resultSummary.querySummary || 'No shortlist loaded yet' }}
              </h2>
            </div>
            <UBadge
              :label="currentSession ? 'Ready to review' : 'Waiting on first run'"
              :color="currentSession ? 'primary' : 'neutral'"
              variant="soft"
            />
          </div>

          <div v-if="currentSession" class="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div
              v-for="metric in shortlistMetrics"
              :key="metric.label"
              class="brand-surface-soft rounded-[1.4rem] p-4"
            >
              <p class="brand-caption">{{ metric.label }}</p>
              <p :class="['mt-2 text-lg font-semibold sm:text-xl', metric.tone]">
                {{ metric.value }}
              </p>
            </div>
          </div>

          <div
            v-if="currentSession"
            class="rounded-[1.4rem] border border-default/80 bg-default/80 p-4"
          >
            <p class="brand-caption">Last run</p>
            <p class="mt-2 text-sm text-default">
              <NuxtTime
                :datetime="currentSession.createdAt"
                date-style="medium"
                time-style="short"
              />
            </p>
            <p class="mt-2 text-sm text-muted">
              {{ currentSession.resultSummary.overallAdvice }}
            </p>
            <p v-if="currentSession.resultSummary.lifeFitNote" class="mt-2 text-sm text-default">
              {{ currentSession.resultSummary.lifeFitNote }}
            </p>
            <p
              v-if="currentSession.resultSummary.meta.resolvedModel"
              class="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-dimmed"
            >
              Model: {{ currentSession.resultSummary.meta.resolvedModel }}
            </p>
          </div>

          <div
            v-if="topPickBoat"
            class="rounded-[1.4rem] border border-primary/15 bg-primary/5 p-4 space-y-4"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="brand-caption">Open a boat now</p>
                <h3 class="mt-2 text-lg font-semibold text-default">Top pick with direct links</h3>
              </div>
              <UBadge label="Top pick" color="primary" variant="soft" />
            </div>

            <div class="overflow-hidden rounded-[1.2rem] border border-default">
              <BoatMediaImage
                :src="topPickBoat.images?.[0]"
                :alt="formatBoatLabel(topPickBoat)"
                :width="900"
                :height="640"
                sizes="100vw"
                class="aspect-[16/10] bg-muted"
                img-class="h-full w-full object-cover"
              />
            </div>

            <div class="space-y-2">
              <p class="text-lg font-semibold text-highlighted">
                {{ formatBoatLabel(topPickBoat) }}
              </p>
              <p class="text-sm text-muted">
                {{ topPickBoat.location || 'Location not listed' }}
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="topPickDetailTo"
                :to="topPickDetailTo"
                label="Open boat detail"
                color="primary"
                icon="i-lucide-ship-wheel"
              />
              <UButton
                v-if="topPickBoat.url"
                :to="topPickBoat.url"
                label="Open source listing"
                color="neutral"
                variant="soft"
                icon="i-lucide-arrow-up-right"
                target="_blank"
              />
              <UButton
                to="#full-shortlist"
                label="Jump to full shortlist"
                color="neutral"
                variant="ghost"
                icon="i-lucide-move-down"
              />
            </div>
          </div>

          <div
            v-if="quickPursueBoats.length"
            class="rounded-[1.4rem] border border-default/80 bg-default/80 p-4 space-y-3"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="brand-caption">Quick pursue links</p>
                <p class="mt-1 text-sm text-muted">These are the first boats to click into.</p>
              </div>
              <UBadge
                :label="`${quickPursueBoats.length} boats`"
                color="primary"
                variant="subtle"
              />
            </div>

            <div class="space-y-3">
              <div
                v-for="boat in quickPursueBoats"
                :key="boat.id"
                class="rounded-[1.2rem] border border-default bg-muted/35 p-3"
              >
                <div class="flex gap-3">
                  <div class="w-24 shrink-0 overflow-hidden rounded-xl border border-default">
                    <BoatMediaImage
                      :src="boat.images?.[0]"
                      :alt="formatBoatLabel(boat)"
                      :width="320"
                      :height="240"
                      sizes="96px"
                      class="aspect-[4/3] bg-muted"
                      img-class="h-full w-full object-cover"
                    />
                  </div>

                  <div class="min-w-0 flex-1 space-y-2">
                    <p class="truncate text-sm font-semibold text-default">
                      {{ formatBoatLabel(boat) }}
                    </p>
                    <p class="text-xs text-muted">{{ boat.location || 'Location not listed' }}</p>
                    <div class="flex flex-wrap gap-2">
                      <UButton
                        :to="boatDetailTo(boat.id)"
                        label="Boat detail"
                        color="primary"
                        size="sm"
                        icon="i-lucide-ship-wheel"
                      />
                      <UButton
                        v-if="boat.url"
                        :to="boat.url"
                        label="Source"
                        color="neutral"
                        variant="soft"
                        size="sm"
                        icon="i-lucide-arrow-up-right"
                        target="_blank"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="quickAvoidBoats.length"
            class="rounded-[1.4rem] border border-error/20 bg-error/8 p-4 space-y-3"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="brand-caption">Boats to avoid first</p>
                <p class="mt-1 text-sm text-muted">
                  Weak fits you should skip before opening a pile of tabs.
                </p>
              </div>
              <UBadge label="Avoid first" color="error" variant="soft" />
            </div>

            <div class="space-y-3">
              <div
                v-for="boat in quickAvoidBoats"
                :key="boat.id"
                class="rounded-[1.2rem] border border-error/15 bg-default/80 p-3"
              >
                <div class="flex gap-3">
                  <div class="w-24 shrink-0 overflow-hidden rounded-xl border border-default">
                    <BoatMediaImage
                      :src="boat.images?.[0]"
                      :alt="formatBoatLabel(boat)"
                      :width="320"
                      :height="240"
                      sizes="96px"
                      class="aspect-[4/3] bg-muted"
                      img-class="h-full w-full object-cover"
                    />
                  </div>

                  <div class="min-w-0 flex-1 space-y-2">
                    <p class="truncate text-sm font-semibold text-default">
                      {{ formatBoatLabel(boat) }}
                    </p>
                    <p class="text-xs text-muted">{{ boat.location || 'Location not listed' }}</p>
                    <div class="flex flex-wrap gap-2">
                      <UButton
                        :to="boatDetailTo(boat.id)"
                        label="Why avoid"
                        color="error"
                        variant="soft"
                        size="sm"
                        icon="i-lucide-circle-x"
                      />
                      <UButton
                        v-if="boat.url"
                        :to="boat.url"
                        label="Source"
                        color="neutral"
                        variant="ghost"
                        size="sm"
                        icon="i-lucide-arrow-up-right"
                        target="_blank"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="brand-surface-soft rounded-[1.4rem] p-4">
            <p class="text-sm text-muted">
              Complete the finder once and this area will show the active run, current top pick, and
              review-ready market summary.
            </p>
          </div>
        </div>
      </div>
    </UPageSection>

    <UPageSection id="full-shortlist">
      <div v-if="detailStatus === 'pending'" class="flex items-center justify-center py-24">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
      </div>

      <div v-else-if="errorMessage" class="brand-surface rounded-[1.8rem] px-6 py-12 text-center">
        <UIcon name="i-lucide-alert-circle" class="mx-auto text-4xl text-warning" />
        <h2 class="mt-4 text-xl font-semibold text-default">Could not load this shortlist</h2>
        <p class="mt-2 text-muted max-w-2xl mx-auto">
          {{ errorMessage }}
        </p>
        <div class="mt-6 flex flex-wrap justify-center gap-2">
          <UButton to="/ai-boat-finder" label="Open finder" icon="i-lucide-sparkles" />
          <UButton
            v-if="latestSessionId"
            :to="{ path: '/search', query: { sessionId: String(latestSessionId) } }"
            label="Load latest shortlist"
            color="neutral"
            variant="soft"
          />
        </div>
      </div>

      <div
        v-else-if="!currentSession"
        class="brand-surface rounded-[1.8rem] px-6 py-12 text-center"
      >
        <UIcon name="i-lucide-ship-wheel" class="mx-auto text-4xl text-dimmed" />
        <h2 class="mt-4 text-xl font-semibold text-default">No saved shortlist yet</h2>
        <p class="mt-2 text-muted max-w-2xl mx-auto">
          Complete the fishing brief once and this page will become your working recommendation
          board.
        </p>
        <UButton
          class="mt-6"
          to="/ai-boat-finder"
          label="Start the finder"
          icon="i-lucide-sparkles"
        />
      </div>

      <BoatRecommendationList v-else :session="currentSession" :boats="currentBoats" />
    </UPageSection>
  </UPage>
</template>

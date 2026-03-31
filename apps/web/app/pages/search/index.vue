<script setup lang="ts">
import BoatRecommendationList from '~~/app/components/boat-finder/BoatRecommendationList.vue'
import BoatShortlistOverview from '~~/app/components/boat-finder/BoatShortlistOverview.vue'
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

const {
  currentSession,
  currentBoats,
  detailStatus,
  detailError,
  latestSessionId,
  resolvedSessionId,
  sessionsStatus,
} = useRecommendationSessions(sessionId)

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

const isLoadingShortlist = computed(
  () =>
    sessionsStatus.value === 'pending' ||
    detailStatus.value === 'pending' ||
    (Boolean(resolvedSessionId.value) && !currentSession.value && !errorMessage.value),
)
</script>

<template>
  <UPage>
    <UPageSection>
      <BoatShortlistOverview
        :session="currentSession"
        :boats="currentBoats"
        :profile-signals="profileSignals"
        :loading="isLoadingShortlist"
      />
    </UPageSection>

    <UPageSection id="full-shortlist">
      <div v-if="isLoadingShortlist" class="flex items-center justify-center py-24">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
      </div>

      <div v-else-if="errorMessage" class="brand-surface rounded-[1.8rem] px-6 py-12 text-center">
        <UIcon name="i-lucide-alert-circle" class="mx-auto text-4xl text-warning" />
        <h2 class="mt-4 text-xl font-semibold text-default">Could not load this shortlist</h2>
        <p class="mt-2 text-muted max-w-2xl mx-auto">
          {{ errorMessage }}
        </p>
        <div class="mt-6 flex flex-wrap justify-center gap-2">
          <UButton to="/account/profile" label="AI Boat Profiles" icon="i-lucide-sparkles" />
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
          to="/account/profile"
          label="AI Boat Profiles"
          icon="i-lucide-sparkles"
        />
      </div>

      <BoatRecommendationList v-else :session="currentSession" :boats="currentBoats" />
    </UPageSection>
  </UPage>
</template>

<script setup lang="ts">
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
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 class="text-3xl font-bold text-default">Your AI-ranked shortlist</h1>
          <p class="mt-2 max-w-3xl text-muted">
            These recommendations come from your saved fishing brief, structured inventory filters,
            and AI reranking over the current candidate set.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton to="/ai-boat-finder" label="Run finder again" icon="i-lucide-sparkles" />
          <UButton
            to="/account/recommendations"
            label="View run history"
            color="neutral"
            variant="soft"
            icon="i-lucide-history"
          />
        </div>
      </div>
    </UPageSection>

    <UPageSection>
      <div v-if="detailStatus === 'pending'" class="flex items-center justify-center py-24">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
      </div>

      <div
        v-else-if="errorMessage"
        class="card-base rounded-2xl border-default px-6 py-12 text-center"
      >
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
        class="card-base rounded-2xl border-default px-6 py-12 text-center"
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

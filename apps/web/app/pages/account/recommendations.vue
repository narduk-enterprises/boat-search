<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

useSeo({
  title: 'Recommendation History',
  description: 'Replay previous AI finder runs and reopen saved fishing boat shortlists.',
  ogImage: {
    title: 'Recommendation History',
    description: 'Saved AI shortlist runs for Boat Search.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Recommendation History',
  description: 'Saved AI shortlist runs for Boat Search.',
})

const toast = useToast()
const { sessionsData, sessionsStatus, createSession } = useRecommendationSessions()
const rerunningSessionId = shallowRef<number | null>(null)

async function handleRerunProfile(profileId: number | null | undefined, sessionId: number) {
  rerunningSessionId.value = sessionId
  try {
    const response = await createSession({
      profileId: profileId ?? undefined,
    })
    toast.add({
      title: 'Finder rerun complete',
      description: 'A new shortlist has been generated from the saved brief.',
      color: 'success',
    })
    await navigateTo({
      path: '/search',
      query: { sessionId: String(response.session.id) },
    })
  } catch (error: unknown) {
    const err = error as {
      data?: { statusMessage?: string; nextRunAvailableAt?: string }
      statusCode?: number
      message?: string
    }
    if (err.statusCode === 429) {
      toast.add({
        title: 'Cooldown active',
        description: err.data?.nextRunAvailableAt
          ? `This profile can be rerun after ${new Date(err.data.nextRunAvailableAt).toLocaleString()}.`
          : 'This profile was run recently. Please wait.',
        color: 'warning',
      })
    } else {
      toast.add({
        title: 'Could not rerun finder',
        description: err.data?.statusMessage || err.message || 'Try again.',
        color: 'error',
      })
    }
  } finally {
    rerunningSessionId.value = null
  }
}
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 class="text-3xl font-bold text-default">Recommendation history</h1>
          <p class="mt-2 max-w-3xl text-muted">
            Every finder run stores the buyer brief, generated filters, ranked shortlist, and the
            underlying AI prompt and response so you can reopen sessions and audit how the ranking
            was produced later.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            to="/account/profile"
            label="AI Boat Profiles"
            color="neutral"
            variant="soft"
            icon="i-lucide-user-round"
          />
        </div>
      </div>
    </UPageSection>

    <UPageSection>
      <div v-if="sessionsStatus === 'pending'" class="flex items-center justify-center py-24">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
      </div>

      <div
        v-else-if="!sessionsData?.sessions?.length"
        class="card-base rounded-2xl border-default px-6 py-12 text-center"
      >
        <UIcon name="i-lucide-history" class="mx-auto text-4xl text-dimmed" />
        <h2 class="mt-4 text-xl font-semibold text-default">No finder runs yet</h2>
        <p class="mt-2 text-muted max-w-2xl mx-auto">
          Run the AI from a buyer profile and this page becomes your history view for saved shortlists.
        </p>
        <UButton
          class="mt-6"
          to="/account/profile"
          label="AI Boat Profiles"
          icon="i-lucide-sparkles"
        />
      </div>

      <div v-else class="space-y-4">
        <UCard
          v-for="session in sessionsData.sessions"
          :key="session.id"
          class="card-base border-default"
          :ui="{ body: 'p-5 space-y-4' }"
        >
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :label="
                    session.resultSummary.generatedBy === 'ai' ? 'AI ranked' : 'Fallback ranked'
                  "
                  color="primary"
                  variant="subtle"
                />
                <UBadge
                  v-if="session.buyerProfileNameSnapshot"
                  :label="session.buyerProfileNameSnapshot"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-user-round"
                />
                <span class="text-sm text-dimmed">
                  {{ new Date(session.createdAt).toLocaleString() }}
                </span>
              </div>
              <h2 class="text-xl font-semibold text-default">
                {{ session.resultSummary.querySummary }}
              </h2>
              <p class="text-sm text-muted max-w-3xl">
                {{ session.resultSummary.overallAdvice }}
              </p>
              <p class="text-sm text-default">
                Top pick:
                <span class="font-medium">{{ session.topPickLabel || 'None selected' }}</span>
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                :to="{ path: '/search', query: { sessionId: String(session.id) } }"
                label="Open shortlist"
                icon="i-lucide-arrow-right"
              />
              <UButton
                label="Rerun profile"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="soft"
                size="sm"
                :loading="rerunningSessionId === session.id"
                @click="handleRerunProfile(session.buyerProfileId, session.id)"
              />
            </div>
          </div>
        </UCard>
      </div>
    </UPageSection>
  </UPage>
</template>

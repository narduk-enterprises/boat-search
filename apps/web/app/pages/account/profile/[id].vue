<script setup lang="ts">
import BuyerAiPromptPreviewCard from '~~/app/components/boat-finder/BuyerAiPromptPreviewCard.vue'
import { normalizeBuyerAnswersDraft, type BuyerAnswersDraft } from '~~/lib/boatFinder'

definePageMeta({ middleware: ['auth'], ssr: false })

const route = useRoute()
const profileId = computed(() => {
  const raw = route.params.id
  const num = Number.parseInt(
    typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] || '' : '',
    10,
  )
  return Number.isNaN(num) ? null : num
})

const {
  coreAnswers,
  profileName,
  isActive,
  status,
  canRunNow,
  nextRunAvailableAt,
  runsRemaining,
  dailyRunLimit,
  refresh: refreshProfile,
} = useBuyerProfile(profileId)
const { createSession } = useRecommendationSessions()
const { profileSessions, refresh: refreshRunHistory } = useProfileRunHistory(profileId)

const seoTitle = computed(() =>
  profileName.value ? `${profileName.value} — Buyer Profile` : 'Buyer Profile',
)

useSeo({
  title: seoTitle.value,
  description: 'View your buyer profile, run history, and launch the AI boat finder wizard.',
  ogImage: {
    title: 'Buyer Profile',
    description: 'Profile dashboard with run history and brief preview.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Buyer Profile',
  description: 'View buyer profile details, run history, and AI brief preview.',
})

const toast = useToast()
const rerunning = shallowRef(false)

/** Read-only answers derived from the fetched profile. */
const displayAnswers = computed<BuyerAnswersDraft>(() =>
  normalizeBuyerAnswersDraft(coreAnswers.value),
)

async function handleRerun() {
  rerunning.value = true
  try {
    await createSession({ profileId: profileId.value ?? undefined })
    toast.add({
      title: 'AI assessment complete',
      description: 'Your buyer brief has been matched against current inventory.',
      color: 'success',
    })
    await Promise.all([refreshProfile(), refreshRunHistory()])
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
          ? `Rerun available after ${new Date(err.data.nextRunAvailableAt).toLocaleString()}.`
          : 'This profile was run recently. Please wait.',
        color: 'warning',
      })
    } else {
      toast.add({
        title: 'Could not run AI assessment',
        description: err.data?.statusMessage || err.message || 'Try again.',
        color: 'error',
      })
    }
  } finally {
    rerunning.value = false
  }
}

const cooldownLabel = computed(() => {
  if (!nextRunAvailableAt.value) return null
  const next = new Date(nextRunAvailableAt.value)
  const delta = next.getTime() - Date.now()
  if (delta <= 0) return null
  const hours = Math.floor(delta / (1000 * 60 * 60))
  const mins = Math.ceil((delta % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
})
</script>

<template>
  <UPage>
    <UPageSection class="pb-10 sm:pb-12">
      <div class="mx-auto max-w-3xl space-y-5">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-2">
              <UButton
                to="/account/profile"
                icon="i-lucide-arrow-left"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Back to profiles"
              />
              <h1 class="text-xl font-bold tracking-tight text-default sm:text-2xl">
                {{ profileName || 'Buyer profile' }}
              </h1>
              <UBadge v-if="isActive" label="Active" color="primary" variant="subtle" size="xs" />
            </div>
            <p class="text-sm text-muted">
              Review your brief, view past AI runs, or open the wizard to update answers.
            </p>
            <ClientOnly>
              <div class="flex flex-wrap items-center gap-3">
                <div
                  class="flex items-center gap-1.5 text-xs text-muted"
                  data-testid="daily-run-usage"
                >
                  <UIcon name="i-lucide-zap" class="size-3.5" />
                  <span>
                    <strong class="text-default">{{ runsRemaining }}</strong>
                    / {{ dailyRunLimit }} runs left today
                  </span>
                </div>
                <div v-if="cooldownLabel" class="flex items-center gap-1.5 text-xs text-warning">
                  <UIcon name="i-lucide-clock" class="size-3.5" />
                  Rerun available in {{ cooldownLabel }}
                </div>
              </div>
            </ClientOnly>
          </div>
          <div class="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
            <BuyerAiPromptPreviewCard :answers="displayAnswers" />
            <UButton
              label="Edit in Wizard"
              icon="i-lucide-pencil"
              color="neutral"
              variant="soft"
              size="sm"
              class="w-full justify-center sm:w-auto"
              :to="{ path: '/ai-boat-finder', query: { profileId: String(profileId) } }"
            />
            <UButton
              label="Run AI assessment"
              icon="i-lucide-sparkles"
              size="sm"
              :loading="rerunning"
              :disabled="!canRunNow"
              class="w-full justify-center sm:w-auto"
              @click="handleRerun"
            />
          </div>
        </div>

        <div v-if="status === 'pending'" class="flex justify-center py-16">
          <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
        </div>

        <template v-else>
          <!-- Run History -->
          <div v-if="profileSessions.length > 0" class="space-y-3">
            <h2 class="text-sm font-semibold uppercase tracking-wider text-dimmed">
              AI Run History
            </h2>
            <div class="space-y-2">
              <UCard
                v-for="session in profileSessions.slice(0, 5)"
                :key="session.id"
                class="card-base border-default"
                :ui="{ body: 'px-4 py-3' }"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div class="min-w-0 space-y-0.5">
                    <div class="flex flex-wrap items-center gap-2">
                      <UBadge
                        :label="
                          session.resultSummary.generatedBy === 'ai' ? 'AI ranked' : 'Fallback'
                        "
                        :color="session.resultSummary.generatedBy === 'ai' ? 'primary' : 'neutral'"
                        variant="subtle"
                        size="xs"
                      />
                      <ClientOnly>
                        <span class="text-xs text-dimmed">
                          {{ new Date(session.createdAt).toLocaleString() }}
                        </span>
                      </ClientOnly>
                    </div>
                    <p class="truncate text-sm text-default">
                      {{ session.resultSummary.querySummary }}
                    </p>
                    <p v-if="session.topPickLabel" class="text-xs text-muted">
                      Top pick: {{ session.topPickLabel }}
                    </p>
                  </div>
                  <UButton
                    :to="{ path: '/search', query: { sessionId: String(session.id) } }"
                    label="View"
                    icon="i-lucide-arrow-right"
                    color="neutral"
                    variant="soft"
                    size="xs"
                    class="w-full justify-center sm:w-auto"
                  />
                </div>
              </UCard>
            </div>
            <UButton
              v-if="profileSessions.length > 5"
              to="/account/recommendations"
              label="View all run history"
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-history"
            />
          </div>
        </template>
      </div>
    </UPageSection>
  </UPage>
</template>

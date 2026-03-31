<script setup lang="ts">
import BuyerAiPromptPreviewCard from '~~/app/components/boat-finder/BuyerAiPromptPreviewCard.vue'
import {
  buyerAnswersSchema,
  createEmptyBuyerAnswers,
  normalizeBuyerAnswersDraft,
  type BuyerAnswersDraft,
} from '~~/lib/boatFinder'

definePageMeta({ middleware: ['auth'] })

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
  saveProfile,
  refresh: refreshProfile,
} = useBuyerProfile(profileId)
const { createSession } = useRecommendationSessions()
const { profileSessions, refresh: refreshRunHistory } = useProfileRunHistory(profileId)

const seoTitle = computed(() =>
  profileName.value ? `${profileName.value} — Edit Profile` : 'Edit Buyer Profile',
)

useSeo({
  title: seoTitle.value,
  description: 'Edit the questionnaire for this buyer profile.',
  ogImage: {
    title: 'Edit Buyer Profile',
    description: 'Questionnaire editor for a named buyer profile.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Edit Buyer Profile',
  description: 'Edit the questionnaire for a named buyer profile.',
})

const toast = useToast()
const showFullEditor = shallowRef(false)

const draftAnswers = ref<BuyerAnswersDraft>(createEmptyBuyerAnswers())
const saving = shallowRef(false)
const rerunning = shallowRef(false)
const autosaveState = shallowRef<'idle' | 'saving' | 'saved' | 'error'>('idle')
const autosaveError = shallowRef<string | null>(null)
const profileHydrated = shallowRef(false)
const suppressAutosave = shallowRef(true)
const persistedSignature = shallowRef(JSON.stringify(createEmptyBuyerAnswers()))
const activeSaveSignature = shallowRef<string | null>(null)

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<boolean> | null = null

function currentDraftSignature() {
  return JSON.stringify(normalizeBuyerAnswersDraft(draftAnswers.value))
}

function syncDraftFromProfile(nextAnswers: BuyerAnswersDraft) {
  suppressAutosave.value = true
  draftAnswers.value = normalizeBuyerAnswersDraft(nextAnswers)
  persistedSignature.value = currentDraftSignature()
  profileHydrated.value = true

  queueMicrotask(() => {
    suppressAutosave.value = false
  })
}

watch(
  coreAnswers,
  (nextAnswers) => {
    const normalized = normalizeBuyerAnswersDraft(nextAnswers)
    const nextSignature = JSON.stringify(normalized)
    const localSignature = currentDraftSignature()

    if (
      !profileHydrated.value ||
      localSignature === persistedSignature.value ||
      localSignature === nextSignature
    ) {
      syncDraftFromProfile(normalized)
      return
    }

    persistedSignature.value = nextSignature
  },
  { immediate: true },
)

async function persistDraft(options: { force?: boolean } = {}) {
  const normalized = normalizeBuyerAnswersDraft(draftAnswers.value)
  const signature = JSON.stringify(normalized)

  if (!options.force && signature === persistedSignature.value) {
    autosaveState.value = profileHydrated.value ? 'saved' : 'idle'
    autosaveError.value = null
    return true
  }

  if (pendingSave && activeSaveSignature.value === signature) {
    return pendingSave
  }

  autosaveState.value = 'saving'
  autosaveError.value = null
  activeSaveSignature.value = signature

  pendingSave = saveProfile(normalized)
    .then(() => {
      persistedSignature.value = signature
      autosaveState.value = 'saved'
      return true
    })
    .catch((error: unknown) => {
      const err = error as { data?: { statusMessage?: string }; message?: string }
      autosaveState.value = 'error'
      autosaveError.value =
        err.data?.statusMessage || err.message || 'Could not save your buyer brief.'
      return false
    })
    .finally(() => {
      pendingSave = null
      activeSaveSignature.value = null
    })

  return pendingSave
}

/* vue-official allow-deep-watch -- Autosave needs to observe nested draft answer changes. */
watch(
  draftAnswers,
  () => {
    if (import.meta.server || !profileHydrated.value || suppressAutosave.value) {
      return
    }

    const signature = currentDraftSignature()
    if (signature === persistedSignature.value) {
      if (autosaveState.value !== 'saving') {
        autosaveState.value = 'saved'
      }
      autosaveError.value = null
      return
    }

    autosaveState.value = 'idle'

    if (autosaveTimer) {
      clearTimeout(autosaveTimer)
    }

    autosaveTimer = setTimeout(() => {
      void persistDraft()
    }, 900)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
  }
})

function parseDraftAnswers() {
  return buyerAnswersSchema.parse(draftAnswers.value)
}

async function handleSave() {
  saving.value = true
  try {
    await saveProfile(parseDraftAnswers())
    toast.add({ title: 'Profile saved', color: 'success' })
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    toast.add({
      title: 'Could not save',
      description: err.data?.statusMessage || err.message || 'Try again.',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

async function handleSaveAndRerun() {
  rerunning.value = true
  try {
    await saveProfile(parseDraftAnswers())
    await createSession({ profileId: profileId.value ?? undefined })
    toast.add({
      title: 'AI assessment complete',
      description: 'Your updated buyer brief has been matched against current inventory.',
      color: 'success',
    })
    // Stay on this page — refresh profile and run history to show new run
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
                {{ profileName || 'Edit profile' }}
              </h1>
              <UBadge v-if="isActive" label="Active" color="primary" variant="subtle" size="xs" />
            </div>
            <p class="text-sm text-muted">
              Fill out the questionnaire below, then run the AI to get a ranked shortlist matched
              against live inventory.
            </p>
            <div v-if="cooldownLabel" class="flex items-center gap-1.5 text-xs text-warning">
              <UIcon name="i-lucide-clock" class="size-3.5" />
              Rerun available in {{ cooldownLabel }}
            </div>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <UButton
              label="Update Questionnaire"
              icon="i-lucide-pencil"
              color="neutral"
              variant="soft"
              size="sm"
              :to="{ path: '/ai-boat-finder', query: { profileId: String(profileId) } }"
            />
            <UButton
              label="Save"
              icon="i-lucide-save"
              color="neutral"
              variant="soft"
              size="sm"
              :loading="saving"
              @click="handleSave"
            />
            <UButton
              label="Run AI assessment"
              icon="i-lucide-sparkles"
              size="sm"
              :loading="rerunning"
              :disabled="!canRunNow"
              @click="handleSaveAndRerun"
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
                <div class="flex items-center justify-between gap-3">
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
                      <span class="text-xs text-dimmed">
                        {{ new Date(session.createdAt).toLocaleString() }}
                      </span>
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

          <!-- Prompt Preview -->
          <BuyerAiPromptPreviewCard :answers="draftAnswers" />

          <UCard
            v-show="showFullEditor"
            class="card-base border-default"
            :ui="{ body: 'p-4 sm:p-5' }"
          >
            <BoatFinderProfileFields v-model="draftAnswers" />
          </UCard>
        </template>
      </div>
    </UPageSection>
  </UPage>
</template>

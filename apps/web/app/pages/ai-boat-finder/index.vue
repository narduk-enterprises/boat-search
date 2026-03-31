<script setup lang="ts">
import {
  buyerAnswersSchema,
  createEmptyBuyerAnswers,
  normalizeBuyerAnswersDraft,
  type BuyerAnswersDraft,
} from '~~/lib/boatFinder'
import {
  firstIncompleteQuestionIndex,
  getVisibleBoatFinderQuestions,
  parseBoatFinderQuestionIndexQuery,
  parseBoatFinderWizardStepQuery,
  summarizeOptionalIncomplete,
  type BoatFinderStepSectionId,
} from '~~/app/utils/boatFinderQuestions'

definePageMeta({
  middleware: ['auth'],
})

useSeo({
  title: 'AI Fishing Boat Finder',
  description:
    'Answer a richer fishing questionnaire and get an AI-ranked shortlist grounded in the current offshore inventory.',
  ogImage: {
    title: 'AI Fishing Boat Finder',
    description: 'Adaptive buyer questionnaire plus AI-ranked fishing boat matches.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'AI Fishing Boat Finder',
  description: 'Adaptive questionnaire that turns a fishing brief into an AI-ranked shortlist.',
})

const route = useRoute()
const { coreAnswers, updatedAt, saveProfile, status } = useBuyerProfile()

const draftAnswers = ref<BuyerAnswersDraft>(createEmptyBuyerAnswers())
const submitting = shallowRef(false)
const submitError = shallowRef<string | null>(null)
const autosaveState = shallowRef<'idle' | 'saving' | 'saved' | 'error'>('idle')
const autosaveError = shallowRef<string | null>(null)
const hasMounted = shallowRef(false)
const profileHydrated = shallowRef(false)
const routeSyncPaused = shallowRef(false)
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

onMounted(() => {
  hasMounted.value = true
})

/** Avoid locale/time in SSR output to prevent hydration mismatches with client. */
const autosaveMessage = computed(() => {
  if (autosaveState.value === 'saving') {
    return 'Saving your buyer brief...'
  }

  if (autosaveState.value === 'error') {
    return autosaveError.value ?? 'Could not save your buyer brief.'
  }

  if (autosaveState.value === 'saved' && updatedAt.value) {
    return 'Saved to your buyer profile.'
  }

  return 'Changes save into your buyer profile automatically as you answer.'
})

const canGenerateShortlist = computed(() => {
  const a = draftAnswers.value.facts
  return (
    a.primaryUses.length > 0 &&
    a.budgetMax != null &&
    (Boolean(a.targetWatersOrRegion.trim()) || Boolean(a.travelRadius))
  )
})

const optionalIncomplete = computed(() => summarizeOptionalIncomplete(draftAnswers.value))

const pageReady = computed(
  () => hasMounted.value && profileHydrated.value && status.value !== 'pending',
)

const showOptionalResume = computed(
  () =>
    pageReady.value &&
    optionalIncomplete.value.count > 0 &&
    canGenerateShortlist.value,
)

const activeFinderStep = ref<BoatFinderStepSectionId>('mission')
const activeFinderQuestionIndex = ref(0)

function routeQueryString(key: string): string | undefined {
  const v = route.query[key]
  if (v === undefined || v === null) return undefined
  if (Array.isArray(v)) return typeof v[0] === 'string' ? v[0] : undefined
  return typeof v === 'string' ? v : String(v)
}

function applyRouteToFinderState() {
  const step = parseBoatFinderWizardStepQuery(route.query.step) ?? 'mission'
  const qs = getVisibleBoatFinderQuestions(draftAnswers.value, step)
  const parsed = parseBoatFinderQuestionIndexQuery(route.query.q, qs.length)
  let qIdx: number
  if (parsed === null) {
    qIdx = firstIncompleteQuestionIndex(qs, draftAnswers.value)
  } else {
    qIdx = parsed
  }
  const maxI = Math.max(0, qs.length - 1)
  qIdx = Math.min(Math.max(0, qIdx), maxI)

  if (activeFinderStep.value !== step) {
    activeFinderStep.value = step
  }
  if (activeFinderQuestionIndex.value !== qIdx) {
    activeFinderQuestionIndex.value = qIdx
  }
}

function pushFinderQueryToRouter() {
  if (import.meta.server || routeSyncPaused.value) return
  const step = activeFinderStep.value
  const qs = getVisibleBoatFinderQuestions(draftAnswers.value, step)
  const maxI = Math.max(0, qs.length - 1)
  const qZero = Math.min(Math.max(0, activeFinderQuestionIndex.value), maxI)
  if (qZero !== activeFinderQuestionIndex.value) {
    activeFinderQuestionIndex.value = qZero
    return
  }
  const oneBased = qZero + 1
  const stepStr = String(step)
  const qStr = String(oneBased)
  if (routeQueryString('step') === stepStr && routeQueryString('q') === qStr) {
    return
  }
  void navigateTo({
    path: route.path,
    query: { ...route.query, step: stepStr, q: qStr },
    replace: true,
  })
}

watch(
  () => [route.query.step, route.query.q] as const,
  () => {
    applyRouteToFinderState()
  },
  { immediate: true },
)

watch([activeFinderStep, activeFinderQuestionIndex], () => pushFinderQueryToRouter(), {
  flush: 'post',
  immediate: true,
})

const finderQuestionClampKey = computed(() => {
  const step = activeFinderStep.value
  const qs = getVisibleBoatFinderQuestions(draftAnswers.value, step)
  return {
    maxI: Math.max(0, qs.length - 1),
    visibleIds: qs.map((q) => q.id).join(','),
  }
})

watch(finderQuestionClampKey, ({ maxI }) => {
  if (activeFinderQuestionIndex.value > maxI) {
    activeFinderQuestionIndex.value = maxI
  }
})

function continueOptionalQuestions() {
  const id = optionalIncomplete.value.firstSectionId
  if (id) {
    activeFinderStep.value = id
    const qs = getVisibleBoatFinderQuestions(draftAnswers.value, id)
    activeFinderQuestionIndex.value = firstIncompleteQuestionIndex(qs, draftAnswers.value)
  }
}

async function handleSubmit() {
  submitError.value = null

  try {
    buyerAnswersSchema.parse(draftAnswers.value)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Complete the required answers before continuing.'
    submitError.value = message
    return
  }

  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }

  submitting.value = true
  let navigatedToSummary = false
  try {
    const saved = await persistDraft({ force: true })
    if (!saved) {
      submitError.value = autosaveError.value ?? 'Could not save the latest buyer brief.'
      return
    }

    routeSyncPaused.value = true
    await navigateTo('/ai-boat-finder/summary')
    navigatedToSummary = true
  } finally {
    if (!navigatedToSummary) {
      routeSyncPaused.value = false
    }
    submitting.value = false
  }
}

const backPath = computed(() => {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/')) {
    return redirect
  }
  return '/'
})
</script>

<template>
  <UPage class="min-w-0" :ui="{ root: 'min-w-0', center: 'min-w-0' }">
    <UPageSection
      class="pb-20"
      :ui="{
        root: 'relative isolate min-w-0',
        container:
          'min-w-0 w-full flex flex-col lg:grid gap-6 py-8 sm:gap-10 sm:py-10 lg:gap-12 lg:py-12',
      }"
    >
      <div
        class="mx-auto w-full min-w-0 max-w-6xl space-y-8"
        data-testid="boat-finder-page-shell"
      >
        <div
          class="flex flex-col gap-6 border-b border-default pb-6 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="max-w-2xl space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                label="AI boat finder"
                color="primary"
                variant="subtle"
                icon="i-lucide-sparkles"
              />
              <UBadge
                v-if="pageReady"
                :label="
                  autosaveState === 'saving'
                    ? 'Saving…'
                    : autosaveState === 'error'
                      ? 'Save issue'
                      : 'Draft synced'
                "
                :color="autosaveState === 'error' ? 'warning' : autosaveState === 'saving' ? 'neutral' : 'success'"
                variant="soft"
                :icon="
                  autosaveState === 'saving'
                    ? 'i-lucide-loader-2'
                    : autosaveState === 'error'
                      ? 'i-lucide-triangle-alert'
                      : 'i-lucide-cloud-check'
                "
                :class="autosaveState === 'saving' ? 'animate-pulse' : ''"
              />
            </div>
            <h1 class="text-2xl font-bold tracking-tight text-default sm:text-3xl">
              Turn how you fish into a ranked shortlist
            </h1>
            <p class="text-base leading-relaxed text-muted">
              Answer in short steps. We save as you go. When mission, budget, and geography are set,
              generate matches against live inventory — then refine optional details anytime.
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <UButton
              :to="backPath"
              label="Exit"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-left"
            />
            <UButton
              to="/account/profile"
              label="Buyer profile"
              color="neutral"
              variant="soft"
              icon="i-lucide-user-round"
            />
          </div>
        </div>

        <div
          v-if="!pageReady"
          class="flex items-center gap-3 rounded-2xl border border-default bg-elevated px-5 py-8"
          data-testid="boat-finder-loading"
        >
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
          <span class="text-sm text-muted">Loading your saved buyer brief…</span>
        </div>

        <template v-else>
          <div
            v-if="showOptionalResume"
            class="space-y-3"
            data-testid="boat-finder-optional-resume"
          >
            <UAlert
              color="info"
              variant="subtle"
              title="Optional details still open"
              :description="`You can generate a shortlist now and still fill in ${optionalIncomplete.count} optional question${optionalIncomplete.count === 1 ? '' : 's'} later to sharpen results.`"
              class="border-default"
            />
            <UButton
              v-if="optionalIncomplete.firstSectionId"
              label="Jump to next optional section"
              color="primary"
              variant="soft"
              size="sm"
              data-testid="boat-finder-continue-optional"
              @click="continueOptionalQuestions"
            />
          </div>

          <BoatFinderWizard
            v-model:answers="draftAnswers"
            v-model:active-section-id="activeFinderStep"
            v-model:active-question-index="activeFinderQuestionIndex"
            :submitting="submitting"
            :error="submitError"
            :autosave-state="autosaveState"
            :autosave-message="autosaveMessage"
            submit-label="Finish up & show summary"
            @submit="handleSubmit"
          />
        </template>
      </div>
    </UPageSection>
  </UPage>
</template>

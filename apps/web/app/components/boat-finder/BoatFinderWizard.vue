<script setup lang="ts">
import type { BuyerAnswersDraft } from '~~/lib/boatFinder'
import {
  BOAT_FINDER_SECTIONS,
  BOAT_FINDER_STEP_SECTION_IDS,
  boatFinderQuestionHasValue,
  firstIncompleteQuestionIndex,
  getVisibleBoatFinderQuestions,
  type BoatFinderQuestion,
  type BoatFinderStepSectionId,
} from '~~/app/utils/boatFinderQuestions'

const props = withDefaults(
  defineProps<{
    submitting?: boolean
    error?: string | null
    submitLabel?: string
    autosaveState?: 'idle' | 'saving' | 'saved' | 'error'
    autosaveMessage?: string | null
  }>(),
  {
    submitting: false,
    error: null,
    submitLabel: 'Finish up now & generate shortlist',
    autosaveState: 'idle',
    autosaveMessage: null,
  },
)

const emit = defineEmits<{
  submit: []
}>()

const activeSectionId = defineModel<BoatFinderStepSectionId>('activeSectionId', { required: true })

const answers = defineModel<BuyerAnswersDraft>('answers', { required: true })

const activeQuestionIndex = defineModel<number>('activeQuestionIndex', { default: 0 })

const sections = BOAT_FINDER_SECTIONS.filter(
  (
    section,
  ): section is (typeof BOAT_FINDER_SECTIONS)[number] & {
    id: BoatFinderStepSectionId
  } => section.id !== 'review',
)

const sectionSummaries = computed(() =>
  sections.map((section) => {
    const questions = getVisibleBoatFinderQuestions(answers.value, section.id)
    return {
      ...section,
      questions,
      answeredCount: questions.filter((q) => boatFinderQuestionHasValue(answers.value, q)).length,
      requiredRemaining: questions.filter(
        (q) => q.required && !boatFinderQuestionHasValue(answers.value, q),
      ),
    }
  }),
)

const activeSectionSummary = computed(() => {
  const list = sectionSummaries.value
  const found = list.find((s) => s.id === activeSectionId.value)
  return found ?? list[0]!
})

const activeStepIndex = computed(() => BOAT_FINDER_STEP_SECTION_IDS.indexOf(activeSectionId.value))

/** When changing section, optionally land on a specific index (e.g. last question when going Back). */
const pendingQuestionIndex = ref<number | null>(null)
const lastStepBlockerConfirmation = ref(false)

/** Keep `q` / parent-driven index; only clamp, clear empty section, or apply `pendingQuestionIndex`. */
watch(
  () => activeSectionId.value,
  (id) => {
    const qs = getVisibleBoatFinderQuestions(answers.value, id)
    if (qs.length === 0) {
      activeQuestionIndex.value = 0
      pendingQuestionIndex.value = null
      return
    }
    if (pendingQuestionIndex.value != null) {
      activeQuestionIndex.value = Math.min(Math.max(0, pendingQuestionIndex.value), qs.length - 1)
      pendingQuestionIndex.value = null
      return
    }
    if (activeQuestionIndex.value >= qs.length) {
      activeQuestionIndex.value = Math.max(0, qs.length - 1)
    }
  },
  { immediate: true },
)

watch(
  () => activeSectionSummary.value.questions.length,
  (len) => {
    if (activeQuestionIndex.value >= len) {
      activeQuestionIndex.value = Math.max(0, len - 1)
    }
  },
)

const activeQuestion = computed(() => {
  const qs = activeSectionSummary.value.questions
  if (qs.length === 0) return null
  return qs[Math.min(activeQuestionIndex.value, qs.length - 1)]
})

const questionPositionLabel = computed(() => {
  const n = activeSectionSummary.value.questions.length
  if (n <= 1) return '1 question in this section'
  return `Question ${activeQuestionIndex.value + 1} of ${n}`
})

const totalVisibleQuestions = computed(() =>
  sectionSummaries.value.reduce((total, section) => total + section.questions.length, 0),
)

const answeredQuestions = computed(() =>
  sectionSummaries.value.reduce((total, section) => total + section.answeredCount, 0),
)

const blockerMessages = computed(() => {
  const blockers: string[] = []

  if (answers.value.facts.primaryUses.length === 0) {
    blockers.push('Choose at least one mission.')
  }

  if (answers.value.facts.budgetMax == null) {
    blockers.push('Set a budget ceiling.')
  }

  if (!answers.value.facts.targetWatersOrRegion.trim() && !answers.value.facts.travelRadius) {
    blockers.push('Add a target region or travel radius.')
  }

  return blockers
})

const canSubmit = computed(() => blockerMessages.value.length === 0)

const autosaveBadge = computed(() => {
  if (props.autosaveState === 'saving') {
    return { label: 'Autosaving', color: 'neutral' as const, icon: 'i-lucide-loader-2' }
  }

  if (props.autosaveState === 'saved') {
    return { label: 'Saved', color: 'success' as const, icon: 'i-lucide-check' }
  }

  if (props.autosaveState === 'error') {
    return { label: 'Save issue', color: 'warning' as const, icon: 'i-lucide-triangle-alert' }
  }

  return { label: 'Draft ready', color: 'neutral' as const, icon: 'i-lucide-file-text' }
})

function goToSection(id: BoatFinderStepSectionId) {
  pendingQuestionIndex.value = null
  activeSectionId.value = id
  const qs = getVisibleBoatFinderQuestions(answers.value, id)
  activeQuestionIndex.value = firstIncompleteQuestionIndex(qs, answers.value)
}

function goBackInFlow() {
  if (activeQuestionIndex.value > 0) {
    activeQuestionIndex.value--
    return
  }
  const i = activeStepIndex.value
  if (i <= 0) return
  const prevId = BOAT_FINDER_STEP_SECTION_IDS[i - 1]!
  const prevQs = getVisibleBoatFinderQuestions(answers.value, prevId)
  pendingQuestionIndex.value = Math.max(0, prevQs.length - 1)
  activeSectionId.value = prevId
}

/** When shortlist prerequisites fail, jump to the first section/question that fixes them. */
function goToFirstShortlistBlocker() {
  const facts = answers.value.facts
  if (facts.primaryUses.length === 0) {
    goToSection('mission')
    const qs = getVisibleBoatFinderQuestions(answers.value, 'mission')
    activeQuestionIndex.value = firstIncompleteQuestionIndex(qs, answers.value)
    return
  }
  if (facts.budgetMax == null || (!facts.targetWatersOrRegion.trim() && !facts.travelRadius)) {
    goToSection('guardrails')
    const qs = getVisibleBoatFinderQuestions(answers.value, 'guardrails')
    activeQuestionIndex.value = firstIncompleteQuestionIndex(qs, answers.value)
  }
}

function goNextInFlow() {
  const qs = activeSectionSummary.value.questions
  if (activeQuestionIndex.value < qs.length - 1) {
    activeQuestionIndex.value++
    return
  }
  if (!isLastStep.value) {
    const nextId = BOAT_FINDER_STEP_SECTION_IDS[activeStepIndex.value + 1]!
    pendingQuestionIndex.value = null
    activeSectionId.value = nextId
    const nQs = getVisibleBoatFinderQuestions(answers.value, nextId)
    activeQuestionIndex.value = firstIncompleteQuestionIndex(nQs, answers.value)
    return
  }
  if (canSubmit.value) {
    emit('submit')
  } else {
    if (!lastStepBlockerConfirmation.value) {
      lastStepBlockerConfirmation.value = true
      return
    }
    goToFirstShortlistBlocker()
  }
}

const isLastStep = computed(() => activeStepIndex.value === BOAT_FINDER_STEP_SECTION_IDS.length - 1)

function isTextEntryQuestionKind(q: BoatFinderQuestion) {
  return q.kind === 'short_text_optional' || q.kind === 'long_text_optional'
}

const isSkipForwardAction = computed(() => {
  const qs = activeSectionSummary.value.questions
  const atEndOfSection = activeQuestionIndex.value >= qs.length - 1
  const q = activeQuestion.value
  if (atEndOfSection || !q || !isTextEntryQuestionKind(q)) return false
  return !boatFinderQuestionHasValue(answers.value, q)
})

const atEndOfLastSection = computed(() => {
  const qs = activeSectionSummary.value.questions
  if (qs.length === 0) return false
  return isLastStep.value && activeQuestionIndex.value >= qs.length - 1
})

/** Show generate CTA in the footer when ready but not on the last step (Continue already submits there). */
const showStandaloneFinish = computed(() => canSubmit.value && !atEndOfLastSection.value)

const continueButtonLabel = computed(() => {
  const qs = activeSectionSummary.value.questions
  const atEndOfSection = activeQuestionIndex.value >= qs.length - 1
  if (!atEndOfSection) {
    return isSkipForwardAction.value ? 'Skip' : 'Continue'
  }
  if (!isLastStep.value) return 'Next section'
  if (canSubmit.value) return props.submitLabel
  return lastStepBlockerConfirmation.value ? 'Complete required fields' : 'Continue'
})

const continueTrailingIcon = computed(() =>
  isSkipForwardAction.value ? 'i-lucide-forward' : 'i-lucide-arrow-right',
)

const isFirstScreen = computed(() => activeStepIndex.value === 0 && activeQuestionIndex.value === 0)

watch([activeSectionId, activeQuestionIndex, canSubmit], () => {
  if (canSubmit.value || !isLastStep.value) {
    lastStepBlockerConfirmation.value = false
  }
})

const sectionQuestionProgress = computed(() => {
  const n = activeSectionSummary.value.questions.length
  if (n <= 0) return 0
  return Math.round(((activeQuestionIndex.value + 1) / n) * 100)
})

const sectionTabItems = computed(() =>
  sectionSummaries.value.map((s) => {
    const onThisSection = activeSectionId.value === s.id
    return {
      label: s.label,
      value: s.id,
      badge:
        s.questions.length > 0
          ? onThisSection
            ? `${activeQuestionIndex.value + 1}/${s.questions.length}`
            : `${s.answeredCount}/${s.questions.length}`
          : undefined,
    }
  }),
)

const tabsModelValue = computed<BoatFinderStepSectionId>({
  get: () => activeSectionId.value,
  set: (value) => {
    goToSection(value)
  },
})

const showAutosaveBanner = computed(
  () =>
    Boolean(props.autosaveMessage) &&
    (props.autosaveState === 'saving' || props.autosaveState === 'error'),
)
</script>

<template>
  <div class="w-full min-w-0 space-y-6" data-testid="boat-finder-wizard">
    <!-- Status strip: one row, no extra card -->
    <div
      class="flex flex-col gap-3 rounded-2xl border border-default bg-elevated px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-circle-check" class="size-4 shrink-0 text-dimmed" />
          <span class="text-muted"
            >Answered
            <span class="font-semibold text-default">{{ answeredQuestions }}</span>
            /
            <span class="text-default">{{ totalVisibleQuestions }}</span></span
          >
        </div>
        <span class="hidden text-dimmed sm:inline" aria-hidden="true">·</span>
        <UBadge
          :label="autosaveBadge.label"
          :color="autosaveBadge.color"
          variant="soft"
          :icon="autosaveBadge.icon"
          :class="props.autosaveState === 'saving' ? 'animate-pulse' : ''"
        />
      </div>
      <p v-if="!showAutosaveBanner" class="text-xs text-dimmed sm:max-w-md sm:text-right">
        One question per screen · Continue advances · Tabs jump sections · Generate shortlist when
        mission, budget, and region are set
      </p>
    </div>

    <div
      v-if="showAutosaveBanner && props.autosaveMessage"
      class="rounded-xl border border-default bg-default px-4 py-3 text-sm text-default"
      data-testid="boat-finder-autosave-message"
    >
      {{ props.autosaveMessage }}
    </div>

    <div
      v-if="props.error"
      class="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error"
      data-testid="boat-finder-submit-error"
    >
      {{ props.error }}
    </div>

    <div class="w-full min-w-0 overflow-x-auto pb-1" data-testid="boat-finder-step-nav">
      <UTabs
        v-model="tabsModelValue"
        :items="sectionTabItems"
        variant="pill"
        color="primary"
        :content="false"
        class="min-w-max sm:min-w-0"
        :ui="{ root: 'w-full min-w-0', list: 'flex-wrap sm:flex-nowrap' }"
      />
    </div>

    <UCard
      class="card-base min-w-0 shadow-card border-default scroll-mt-28 overflow-hidden lg:scroll-mt-24"
      :ui="{
        body: 'flex h-[min(32rem,72vh)] min-h-0 flex-col gap-6 overflow-hidden p-5 sm:h-[min(36rem,75vh)] sm:p-6',
      }"
      data-testid="boat-finder-active-step"
    >
      <div class="shrink-0 space-y-4">
        <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div class="min-h-[3.25rem] min-w-0 sm:min-h-0">
            <h2 class="text-xs font-semibold uppercase tracking-[0.16em] text-dimmed">
              {{ activeSectionSummary.label }}
            </h2>
            <p class="mt-1 line-clamp-2 text-sm text-muted sm:line-clamp-none">
              {{ activeSectionSummary.description }}
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <UBadge :label="questionPositionLabel" color="neutral" variant="subtle" size="sm" />
            <UBadge
              v-if="activeSectionSummary.requiredRemaining.length === 0"
              label="Section complete"
              color="success"
              variant="soft"
              size="sm"
            />
            <UBadge
              v-else
              :label="`${activeSectionSummary.requiredRemaining.length} required`"
              color="warning"
              variant="soft"
              size="sm"
            />
          </div>
        </div>

        <div
          class="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          :aria-valuenow="activeQuestionIndex + 1"
          :aria-valuemin="1"
          :aria-valuemax="Math.max(1, activeSectionSummary.questions.length)"
          aria-label="Progress within this section"
        >
          <div
            class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
            :style="{ width: `${sectionQuestionProgress}%` }"
          />
        </div>
      </div>

      <div
        class="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-xl bg-muted/60 p-4 sm:p-5"
      >
        <BoatFinderQuestionField
          v-if="activeQuestion"
          :key="activeQuestion.id"
          v-model="answers"
          :question="activeQuestion"
          :section="activeSectionSummary.id"
          embedded
        />
      </div>

      <div class="mt-auto shrink-0 space-y-3 border-t border-default pt-5">
        <p v-if="!canSubmit" class="text-xs text-muted">
          Shortlist needs mission, budget ceiling, and region or travel radius — use Fix required,
          the Buyer profile shortcut, or Continue on the last step to jump there.
        </p>
        <div
          class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        >
          <UButton
            label="Back"
            color="neutral"
            variant="ghost"
            size="lg"
            icon="i-lucide-arrow-left"
            :disabled="isFirstScreen"
            class="sm:order-1"
            data-testid="boat-finder-step-prev"
            @click="goBackInFlow"
          />
          <div
            class="flex flex-col gap-2 sm:order-2 sm:max-w-full sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
          >
            <UButton
              v-if="!canSubmit"
              label="Fix required fields"
              color="neutral"
              variant="soft"
              size="lg"
              icon="i-lucide-list-checks"
              data-testid="boat-finder-jump-blockers"
              @click="goToFirstShortlistBlocker"
            />
            <UButton
              v-if="showStandaloneFinish"
              :label="props.submitLabel"
              color="primary"
              variant="soft"
              size="lg"
              icon="i-lucide-sparkles"
              :loading="props.submitting"
              :disabled="props.submitting"
              data-testid="boat-finder-finish-submit"
              @click="emit('submit')"
            />
            <UButton
              :label="continueButtonLabel"
              color="primary"
              size="lg"
              :trailing-icon="continueTrailingIcon"
              :loading="props.submitting && atEndOfLastSection"
              :disabled="atEndOfLastSection && props.submitting"
              data-testid="boat-finder-step-next"
              @click="goNextInFlow"
            />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

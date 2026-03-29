<script setup lang="ts">
import { buildBuyerContext, type BuyerAnswersDraft } from '~~/lib/boatFinder'
import {
  BOAT_FINDER_SECTIONS,
  getVisibleBoatFinderQuestions,
  type BoatFinderQuestion,
  type BoatFinderSectionId,
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
    submitLabel: 'Find matching boats',
    autosaveState: 'idle',
    autosaveMessage: null,
  },
)

const emit = defineEmits<{
  submit: []
}>()

const answers = defineModel<BuyerAnswersDraft>({ required: true })
const sections = BOAT_FINDER_SECTIONS.filter(
  (
    section,
  ): section is (typeof BOAT_FINDER_SECTIONS)[number] & {
    id: Exclude<BoatFinderSectionId, 'review'>
  } => section.id !== 'review',
)

const reviewContext = computed(() => buildBuyerContext(answers.value))

function getValueFromGroup(group: 'facts' | 'preferences' | 'reflectiveAnswers', key: string) {
  if (group === 'facts') {
    return answers.value.facts[key as keyof BuyerAnswersDraft['facts']]
  }

  if (group === 'preferences') {
    return answers.value.preferences[key as keyof BuyerAnswersDraft['preferences']]
  }

  return answers.value.reflectiveAnswers[key as keyof BuyerAnswersDraft['reflectiveAnswers']]
}

function hasValue(question: BoatFinderQuestion) {
  if (question.kind === 'number_range') {
    const [minGroup, minKey] = question.minPath.split('.')
    const [maxGroup, maxKey] = question.maxPath.split('.')
    if (!minKey || !maxKey) return false
    if (
      (minGroup !== 'facts' && minGroup !== 'preferences' && minGroup !== 'reflectiveAnswers') ||
      (maxGroup !== 'facts' && maxGroup !== 'preferences' && maxGroup !== 'reflectiveAnswers')
    ) {
      return false
    }

    return Boolean(getValueFromGroup(minGroup, minKey) ?? getValueFromGroup(maxGroup, maxKey))
  }

  if (question.path === 'openContextNote') {
    return Boolean(answers.value.openContextNote.trim())
  }

  const [group, key] = question.path.split('.')
  if (!key) return false
  if (group !== 'facts' && group !== 'preferences' && group !== 'reflectiveAnswers') {
    return false
  }

  const value = getValueFromGroup(group, key)
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return value != null
}

const sectionSummaries = computed(() =>
  sections.map((section) => {
    const questions = getVisibleBoatFinderQuestions(answers.value, section.id)
    return {
      ...section,
      questions,
      answeredCount: questions.filter(hasValue).length,
      requiredRemaining: questions.filter((question) => question.required && !hasValue(question)),
    }
  }),
)

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
</script>

<template>
  <div class="space-y-5">
    <UCard class="card-base border-default" :ui="{ body: 'p-4 sm:p-5 space-y-4' }">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              label="One-page intake"
              color="primary"
              variant="subtle"
              icon="i-lucide-layout-dashboard"
            />
            <UBadge
              :label="autosaveBadge.label"
              :color="autosaveBadge.color"
              variant="soft"
              :icon="autosaveBadge.icon"
              :class="props.autosaveState === 'saving' ? 'animate-pulse' : ''"
            />
          </div>
          <h2 class="text-xl font-semibold text-default sm:text-2xl">
            Answer everything in one pass. We save the draft as you go.
          </h2>
          <p class="max-w-3xl text-sm text-muted sm:text-base">
            Every section stays on the page. The sidebar keeps a live summary of the hard
            guardrails, softer signals, and reflective context that will shape the shortlist.
          </p>
        </div>

        <div class="grid min-w-[16rem] gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div class="rounded-2xl bg-muted px-4 py-3">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Progress</p>
            <p class="mt-2 text-xl font-semibold text-default">
              {{ answeredQuestions }} / {{ totalVisibleQuestions }}
            </p>
            <p class="mt-1 text-sm text-muted">Visible questions with an answer.</p>
          </div>
          <div class="rounded-2xl bg-muted px-4 py-3">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
              Blocking items
            </p>
            <p class="mt-2 text-xl font-semibold text-default">
              {{ blockerMessages.length === 0 ? 'Ready' : blockerMessages.length }}
            </p>
            <p class="mt-1 text-sm text-muted">
              Mission, budget ceiling, and geography are the only required shortlist gates.
            </p>
          </div>
        </div>
      </div>

      <div
        v-if="props.autosaveMessage"
        class="rounded-xl border border-default bg-default px-4 py-3 text-sm text-default"
      >
        {{ props.autosaveMessage }}
      </div>

      <div
        v-if="props.error"
        class="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error"
      >
        {{ props.error }}
      </div>
    </UCard>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="space-y-4">
        <UCard
          v-for="section in sectionSummaries"
          :key="section.id"
          class="card-base border-default"
          :ui="{ body: 'p-4 sm:p-5 space-y-4' }"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :label="section.label"
                  color="primary"
                  variant="subtle"
                  icon="i-lucide-list-checks"
                />
                <UBadge
                  :label="`${section.answeredCount}/${section.questions.length} answered`"
                  color="neutral"
                  variant="soft"
                />
              </div>
              <h3 class="text-lg font-semibold text-default">{{ section.label }}</h3>
              <p class="text-sm text-muted">{{ section.description }}</p>
            </div>

            <p
              class="text-sm"
              :class="section.requiredRemaining.length === 0 ? 'text-success' : 'text-muted'"
            >
              {{
                section.requiredRemaining.length === 0
                  ? 'Section ready'
                  : `${section.requiredRemaining.length} required follow-up`
              }}
            </p>
          </div>

          <BoatFinderQuestionField
            v-for="question in section.questions"
            :key="question.id"
            v-model="answers"
            :question="question"
            :section="section.id"
          />
        </UCard>
      </div>

      <div class="space-y-4 xl:sticky xl:top-24">
        <BoatFinderReviewCard :context="reviewContext" :allow-save-toggle="false" />

        <UCard class="card-base border-default" :ui="{ body: 'p-4 sm:p-5 space-y-4' }">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                label="Ready to rank"
                color="primary"
                variant="subtle"
                icon="i-lucide-sparkles"
              />
              <UBadge
                :label="canSubmit ? 'Can generate now' : 'Needs a few answers'"
                :color="canSubmit ? 'success' : 'neutral'"
                variant="soft"
              />
            </div>
            <p class="text-sm text-muted">
              Generate a shortlist once the core guardrails are present. Everything else sharpens
              the ranking and the advice.
            </p>
          </div>

          <div v-if="blockerMessages.length" class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
              Finish these first
            </p>
            <div class="space-y-2">
              <div
                v-for="message in blockerMessages"
                :key="message"
                class="rounded-xl bg-muted px-3 py-2 text-sm text-default"
              >
                {{ message }}
              </div>
            </div>
          </div>

          <UButton
            block
            :label="props.submitLabel"
            color="primary"
            size="xl"
            icon="i-lucide-sparkles"
            :loading="props.submitting"
            :disabled="!canSubmit"
            @click="emit('submit')"
          />
        </UCard>
      </div>
    </div>
  </div>
</template>

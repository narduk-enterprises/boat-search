<script setup lang="ts">
import { buildBuyerContext, type BuyerAnswersDraft } from '~~/lib/boatFinder'
import {
  BOAT_FINDER_SECTIONS,
  getVisibleBoatFinderQuestions,
  type BoatFinderQuestion,
} from '~~/app/utils/boatFinderQuestions'

const props = withDefaults(
  defineProps<{
    submitting?: boolean
    error?: string | null
    saveOverrides?: boolean
    submitLabel?: string
  }>(),
  {
    submitting: false,
    error: null,
    saveOverrides: false,
    submitLabel: 'Find matching boats',
  },
)

const emit = defineEmits<{
  submit: []
  'update:saveOverrides': [value: boolean]
}>()

const answers = defineModel<BuyerAnswersDraft>({ required: true })
const step = shallowRef(0)
const sections = BOAT_FINDER_SECTIONS
const currentSection = computed(() => sections[step.value] ?? sections[0]!)
const visibleQuestions = computed(() =>
  currentSection.value.id === 'review'
    ? []
    : getVisibleBoatFinderQuestions(answers.value, currentSection.value.id),
)
const progressPercent = computed(() => ((step.value + 1) / sections.length) * 100)
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
    const [maxGroup, maxKey] = question.maxPath.split('.')
    if (!maxKey) return false

    if (maxGroup === 'facts' || maxGroup === 'preferences' || maxGroup === 'reflectiveAnswers') {
      return Boolean(getValueFromGroup(maxGroup, maxKey))
    }

    return false
  }

  const [group, key] = question.path.split('.')
  if (question.path === 'openContextNote') {
    return Boolean(answers.value.openContextNote.trim())
  }

  if (!key) return false

  if (group !== 'facts' && group !== 'preferences' && group !== 'reflectiveAnswers') {
    return false
  }

  const value = getValueFromGroup(group, key)
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return value != null
}

function sectionIsComplete(sectionId: string) {
  if (sectionId === 'mission') {
    return (
      answers.value.facts.primaryUses.length > 0 &&
      Boolean(
        answers.value.facts.targetWatersOrRegion.trim() || answers.value.facts.travelRadius.trim(),
      )
    )
  }

  if (sectionId === 'guardrails') {
    return answers.value.facts.budgetMax != null
  }

  const requiredQuestions = getVisibleBoatFinderQuestions(
    answers.value,
    sectionId as Exclude<(typeof sections)[number]['id'], 'review'>,
  ).filter((question) => question.required)

  return requiredQuestions.every(hasValue)
}

const canMoveNext = computed(() => {
  if (currentSection.value.id === 'review') return true
  return sectionIsComplete(currentSection.value.id)
})

function goNext() {
  if (!canMoveNext.value || step.value >= sections.length - 1) return
  step.value += 1
}

function goBack() {
  if (step.value === 0) return
  step.value -= 1
}
</script>

<template>
  <div class="space-y-5">
    <UCard class="card-base border-default" :ui="{ body: 'p-4 sm:p-5 space-y-5' }">
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
              Step {{ step + 1 }} of {{ sections.length }}
            </p>
            <h2 class="text-lg font-semibold text-default">
              {{ currentSection.label }}
            </h2>
          </div>
          <UBadge :label="currentSection.description" color="neutral" variant="subtle" size="sm" />
        </div>

        <div class="grid grid-cols-6 gap-2">
          <div
            v-for="(item, index) in sections"
            :key="item.id"
            class="h-2 rounded-full transition-colors"
            :class="index <= step ? 'bg-primary' : 'bg-muted'"
          />
        </div>

        <div class="flex items-center justify-between gap-3 text-sm text-muted">
          <span>{{ Math.round(progressPercent) }}% complete</span>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="(item, index) in sections"
              :key="item.id"
              :label="`${index + 1}. ${item.label}`"
              :color="index === step ? 'primary' : 'neutral'"
              :variant="index === step ? 'solid' : 'subtle'"
              size="sm"
            />
          </div>
        </div>
      </div>

      <div
        v-if="props.error"
        class="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error"
      >
        {{ props.error }}
      </div>
    </UCard>

    <div v-if="currentSection.id !== 'review'" class="space-y-4">
      <BoatFinderQuestionField
        v-for="question in visibleQuestions"
        :key="question.id"
        v-model="answers"
        :question="question"
        :section="currentSection.id"
      />
    </div>

    <BoatFinderReviewCard
      v-else
      :context="reviewContext"
      :save-overrides="props.saveOverrides"
      @update:save-overrides="emit('update:saveOverrides', $event)"
    />

    <div
      class="sticky bottom-3 z-10 rounded-[1.6rem] border border-default bg-default/95 p-4 shadow-card"
    >
      <div class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <UButton
          label="Back"
          color="neutral"
          variant="soft"
          icon="i-lucide-arrow-left"
          :disabled="step === 0 || props.submitting"
          @click="goBack"
        />

        <div class="flex flex-col gap-3 sm:flex-row">
          <UButton
            v-if="step < sections.length - 1"
            label="Continue"
            color="primary"
            icon="i-lucide-arrow-right"
            trailing
            :disabled="!canMoveNext || props.submitting"
            @click="goNext"
          />
          <UButton
            v-else
            :label="props.submitLabel"
            color="primary"
            icon="i-lucide-sparkles"
            :loading="props.submitting"
            @click="emit('submit')"
          />
        </div>
      </div>
    </div>
  </div>
</template>

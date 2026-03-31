<script setup lang="ts">
import type { BuyerAnswersDraft } from '~~/lib/boatFinder'
import {
  BOAT_FINDER_BUDGET_CUSTOM_ID,
  BOAT_FINDER_BUDGET_PRESETS,
  matchBudgetPreset,
  type BoatFinderBudgetPreset,
  type BoatFinderQuestion,
  type BoatFinderSectionId,
} from '~~/app/utils/boatFinderQuestions'

type NumberRangeQuestion = Extract<BoatFinderQuestion, { kind: 'number_range' }>

const props = withDefaults(
  defineProps<{
    question: BoatFinderQuestion
    section?: BoatFinderSectionId
    /** Flat layout inside wizard panel (no nested card chrome). */
    embedded?: boolean
  }>(),
  { embedded: false, section: undefined },
)

const answers = defineModel<BuyerAnswersDraft>({ required: true })

type BuyerAnswerGroupKey = 'facts' | 'preferences' | 'reflectiveAnswers'

function getNestedValue(group: BuyerAnswerGroupKey, key: string) {
  if (group === 'facts') {
    return answers.value.facts[key as keyof BuyerAnswersDraft['facts']]
  }

  if (group === 'preferences') {
    return answers.value.preferences[key as keyof BuyerAnswersDraft['preferences']]
  }

  return answers.value.reflectiveAnswers[key as keyof BuyerAnswersDraft['reflectiveAnswers']]
}

function setNestedValue(group: BuyerAnswerGroupKey, key: string, value: unknown) {
  if (group === 'facts') {
    answers.value.facts[key as keyof BuyerAnswersDraft['facts']] = value as never
    return
  }

  if (group === 'preferences') {
    answers.value.preferences[key as keyof BuyerAnswersDraft['preferences']] = value as never
    return
  }

  answers.value.reflectiveAnswers[key as keyof BuyerAnswersDraft['reflectiveAnswers']] =
    value as never
}

function getFieldValue(path: string) {
  if (path === 'openContextNote') {
    return answers.value.openContextNote
  }

  const [group, key] = path.split('.')
  if (!group || !key) return

  return getNestedValue(group as BuyerAnswerGroupKey, key)
}

function setFieldValue(path: string, value: unknown) {
  if (path === 'openContextNote') {
    answers.value.openContextNote = typeof value === 'string' ? value : ''
    return
  }

  const [group, key] = path.split('.')
  if (!group || !key) return

  setNestedValue(group as BuyerAnswerGroupKey, key, value)
}

function clearQuestionValue() {
  if (props.question.kind === 'number_range') {
    setFieldValue(props.question.minPath, undefined)
    setFieldValue(props.question.maxPath, undefined)
    return
  }

  if (props.question.kind === 'multi_select') {
    setFieldValue(props.question.path, [])
    return
  }

  setFieldValue(props.question.path, '')
}

function setQuestionState(state: 'answered' | 'skipped' | 'not_sure') {
  answers.value.questionStates[props.question.id] = state
}

function clearQuestionState() {
  answers.value.questionStates = Object.fromEntries(
    Object.entries(answers.value.questionStates).filter(([key]) => key !== props.question.id),
  )
}

function applySpecialState(state: 'skipped' | 'not_sure') {
  clearQuestionValue()
  setQuestionState(state)
}

function selectSingleValue(value: string) {
  setFieldValue(props.question.path, value)
  setQuestionState('answered')
}

function toggleMultiValue(value: string) {
  const current = Array.isArray(getFieldValue(props.question.path))
    ? ([...(getFieldValue(props.question.path) as string[])] as string[])
    : []
  const selectionLimit =
    'maxSelections' in props.question ? props.question.maxSelections : undefined

  const next = current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value].slice(0, selectionLimit ?? current.length + 1)

  setFieldValue(props.question.path, next)

  if (next.length > 0) {
    setQuestionState('answered')
  } else {
    clearQuestionState()
  }
}

const currentState = computed(() => answers.value.questionStates[props.question.id])
const maxSelections = computed(() =>
  'maxSelections' in props.question ? (props.question.maxSelections ?? Infinity) : Infinity,
)
const questionPlaceholder = computed(() =>
  'placeholder' in props.question ? props.question.placeholder : undefined,
)
const questionHelpText = computed(() =>
  'helpText' in props.question ? props.question.helpText : '',
)
const textValue = computed({
  get: () => {
    const value = getFieldValue(props.question.path)
    return typeof value === 'string' ? value : ''
  },
  set: (value: string) => {
    setFieldValue(props.question.path, value)

    if (value.trim()) {
      setQuestionState('answered')
    } else {
      clearQuestionState()
    }
  },
})

const rangeMinValue = computed({
  get: () => {
    const value =
      props.question.kind === 'number_range' ? getFieldValue(props.question.minPath) : null
    return typeof value === 'number' ? value : undefined
  },
  set: (value: number | undefined) => {
    if (props.question.kind !== 'number_range') return
    setFieldValue(props.question.minPath, value)
    const hasValue = value != null || getFieldValue(props.question.maxPath) != null
    if (hasValue) {
      setQuestionState('answered')
    } else {
      clearQuestionState()
    }
  },
})

const rangeMaxValue = computed({
  get: () => {
    const value =
      props.question.kind === 'number_range' ? getFieldValue(props.question.maxPath) : null
    return typeof value === 'number' ? value : undefined
  },
  set: (value: number | undefined) => {
    if (props.question.kind !== 'number_range') return
    setFieldValue(props.question.maxPath, value)
    const hasValue = value != null || getFieldValue(props.question.minPath) != null
    if (hasValue) {
      setQuestionState('answered')
    } else {
      clearQuestionState()
    }
  },
})

const selectedValue = computed(() => {
  const value = getFieldValue(props.question.path)
  return typeof value === 'string' ? value : ''
})

const selectedValues = computed((): string[] => {
  const value = getFieldValue(props.question.path)
  return Array.isArray(value) ? [...value] : []
})

const activeNumberRangeQuestion = computed((): NumberRangeQuestion | null =>
  props.question.kind === 'number_range' ? props.question : null,
)

const isBudgetNumberRange = computed(
  () => props.question.id === 'budget' && props.question.kind === 'number_range',
)

const budgetUserPickedCustom = ref(false)

watch(
  () => props.question.id,
  (id) => {
    if (id !== 'budget') {
      budgetUserPickedCustom.value = false
    }
  },
)

const activeBudgetPresetId = computed(() => {
  if (!isBudgetNumberRange.value) return BOAT_FINDER_BUDGET_CUSTOM_ID
  if (budgetUserPickedCustom.value) return BOAT_FINDER_BUDGET_CUSTOM_ID
  return matchBudgetPreset(rangeMinValue.value, rangeMaxValue.value) ?? BOAT_FINDER_BUDGET_CUSTOM_ID
})

const showBudgetCustomFields = computed(
  () => isBudgetNumberRange.value && activeBudgetPresetId.value === BOAT_FINDER_BUDGET_CUSTOM_ID,
)

function chooseBudgetPreset(p: BoatFinderBudgetPreset) {
  if (props.question.kind !== 'number_range') return
  budgetUserPickedCustom.value = false
  setFieldValue(props.question.minPath, p.min ?? undefined)
  setFieldValue(props.question.maxPath, p.max)
  setQuestionState('answered')
}

function chooseBudgetCustom() {
  budgetUserPickedCustom.value = true
}

function stateLabel(state?: string) {
  if (state === 'skipped') return 'Skipped'
  if (state === 'not_sure') return 'Not sure'
  return 'Answered'
}
</script>

<template>
  <div
    :class="[
      'flex flex-col',
      props.embedded
        ? 'min-h-0 min-w-0 flex-1 gap-5'
        : 'card-base gap-4 rounded-xl border border-default p-4 sm:p-5',
    ]"
  >
    <div class="min-w-0 space-y-2">
      <h3 class="text-base font-semibold text-default sm:text-lg">
        {{ props.question.label }}
      </h3>
      <div class="flex flex-wrap items-center gap-2">
        <UBadge
          v-if="props.question.required"
          label="Required"
          color="primary"
          variant="subtle"
          size="sm"
          class="shrink-0"
        />
        <UBadge
          v-if="currentState"
          :label="stateLabel(currentState)"
          color="neutral"
          variant="soft"
          size="sm"
          class="shrink-0"
        />
        <UBadge
          class="shrink-0 capitalize"
          :label="props.question.contextRole"
          :color="props.question.contextRole === 'hard' ? 'primary' : 'neutral'"
          variant="subtle"
          size="sm"
        />
      </div>
      <p class="text-sm leading-relaxed text-muted">
        {{ props.question.description }}
      </p>
    </div>

    <div v-if="props.question.kind === 'single_select'" class="flex flex-wrap gap-2">
      <UButton
        v-for="option in props.question.options"
        :key="option.value"
        :label="option.label"
        :color="selectedValue === option.value ? 'primary' : 'neutral'"
        :variant="selectedValue === option.value ? 'solid' : 'soft'"
        size="lg"
        class="min-h-11"
        @click="selectSingleValue(option.value)"
      />
    </div>

    <div v-else-if="props.question.kind === 'multi_select'" class="flex flex-wrap gap-2">
      <UButton
        v-for="option in props.question.options"
        :key="option.value"
        :label="option.label"
        :color="selectedValues.includes(option.value) ? 'primary' : 'neutral'"
        :variant="selectedValues.includes(option.value) ? 'solid' : 'soft'"
        :disabled="!selectedValues.includes(option.value) && maxSelections <= selectedValues.length"
        size="lg"
        class="min-h-11"
        @click="toggleMultiValue(option.value)"
      />
    </div>

    <div v-else-if="isBudgetNumberRange && activeNumberRangeQuestion" class="space-y-4">
      <p class="text-sm text-muted">
        Tap a range that fits, or
        <span class="font-medium text-default">Custom</span>
        to enter exact numbers.
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="p in BOAT_FINDER_BUDGET_PRESETS"
          :key="p.id"
          size="lg"
          class="min-h-11"
          :label="p.label"
          :color="activeBudgetPresetId === p.id ? 'primary' : 'neutral'"
          :variant="activeBudgetPresetId === p.id ? 'solid' : 'soft'"
          @click="chooseBudgetPreset(p)"
        />
        <UButton
          size="lg"
          class="min-h-11"
          label="Custom"
          icon="i-lucide-pen-line"
          :color="activeBudgetPresetId === BOAT_FINDER_BUDGET_CUSTOM_ID ? 'primary' : 'neutral'"
          :variant="activeBudgetPresetId === BOAT_FINDER_BUDGET_CUSTOM_ID ? 'solid' : 'soft'"
          @click="chooseBudgetCustom"
        />
      </div>
      <div
        v-show="showBudgetCustomFields"
        class="grid gap-4 border-t border-default pt-4 md:grid-cols-2"
      >
        <UFormField :label="activeNumberRangeQuestion.minLabel">
          <UInput
            v-model.number="rangeMinValue"
            class="w-full"
            type="number"
            :placeholder="activeNumberRangeQuestion.minPlaceholder"
          />
        </UFormField>
        <UFormField
          :label="activeNumberRangeQuestion.maxLabel"
          :required="activeNumberRangeQuestion.required"
        >
          <UInput
            v-model.number="rangeMaxValue"
            class="w-full"
            type="number"
            :placeholder="activeNumberRangeQuestion.maxPlaceholder"
          />
        </UFormField>
      </div>
    </div>

    <div
      v-else-if="props.question.kind === 'number_range' && activeNumberRangeQuestion"
      class="grid gap-4 md:grid-cols-2"
    >
      <UFormField :label="activeNumberRangeQuestion.minLabel">
        <UInput
          v-model.number="rangeMinValue"
          class="w-full"
          type="number"
          :placeholder="activeNumberRangeQuestion.minPlaceholder"
        />
      </UFormField>
      <UFormField
        :label="activeNumberRangeQuestion.maxLabel"
        :required="activeNumberRangeQuestion.required"
      >
        <UInput
          v-model.number="rangeMaxValue"
          class="w-full"
          type="number"
          :placeholder="activeNumberRangeQuestion.maxPlaceholder"
        />
      </UFormField>
    </div>

    <div v-else-if="props.question.kind === 'short_text_optional'">
      <UInput v-model="textValue" class="w-full" :placeholder="questionPlaceholder" />
    </div>

    <div v-else class="space-y-2">
      <UTextarea
        v-model="textValue"
        class="w-full min-h-28"
        autoresize
        :placeholder="questionPlaceholder"
      />
      <p v-if="questionHelpText" class="text-xs text-muted">
        {{ questionHelpText }}
      </p>
    </div>

    <div
      v-if="props.question.allowsSkip || props.question.allowsNotSure"
      class="flex flex-wrap items-center gap-2 border-t border-default pt-3"
    >
      <UButton
        v-if="props.question.allowsSkip"
        label="Skip for now"
        color="neutral"
        variant="ghost"
        size="md"
        icon="i-lucide-forward"
        @click="applySpecialState('skipped')"
      />
      <UButton
        v-if="props.question.allowsNotSure"
        label="Not sure"
        color="neutral"
        variant="ghost"
        size="md"
        icon="i-lucide-circle-help"
        @click="applySpecialState('not_sure')"
      />
      <UButton
        v-if="currentState && currentState !== 'answered'"
        label="Answer instead"
        color="primary"
        variant="ghost"
        size="md"
        icon="i-lucide-rotate-ccw"
        @click="clearQuestionState"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  listToTextarea,
  textareaToList,
  type BuyerAnswersDraft,
} from '~~/lib/boatFinder'
import type {
  BoatFinderQuestion,
  BoatFinderSectionId,
} from '~~/app/utils/boatFinderQuestions'

const props = defineProps<{
  question: BoatFinderQuestion
  section?: BoatFinderSectionId
}>()

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

  if (props.question.id === 'mustHaves' || props.question.id === 'dealBreakers') {
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
  const selectionLimit = 'maxSelections' in props.question ? props.question.maxSelections : undefined

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
  'maxSelections' in props.question ? props.question.maxSelections ?? Infinity : Infinity,
)
const questionPlaceholder = computed(() =>
  'placeholder' in props.question ? props.question.placeholder : undefined,
)
const questionHelpText = computed(() => ('helpText' in props.question ? props.question.helpText : ''))
const textValue = computed({
  get: () => {
    if (props.question.id === 'mustHaves' || props.question.id === 'dealBreakers') {
      return listToTextarea((getFieldValue(props.question.path) as string[] | undefined) ?? [])
    }

    const value = getFieldValue(props.question.path)
    return typeof value === 'string' ? value : ''
  },
  set: (value: string) => {
    if (props.question.id === 'mustHaves' || props.question.id === 'dealBreakers') {
      setFieldValue(props.question.path, textareaToList(value))
    } else {
      setFieldValue(props.question.path, value)
    }

    if (value.trim()) {
      setQuestionState('answered')
    } else {
      clearQuestionState()
    }
  },
})

const rangeMinValue = computed({
  get: () => {
    const value = props.question.kind === 'number_range' ? getFieldValue(props.question.minPath) : null
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
    const value = props.question.kind === 'number_range' ? getFieldValue(props.question.maxPath) : null
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

const selectedValues = computed(() => {
  const value = getFieldValue(props.question.path)
  return Array.isArray(value) ? value : []
})

function stateLabel(state?: string) {
  if (state === 'skipped') return 'Skipped'
  if (state === 'not_sure') return 'Not sure'
  return 'Answered'
}
</script>

<template>
  <UCard class="card-base border-default" :ui="{ body: 'p-4 sm:p-5 space-y-4' }">
    <div class="flex items-start justify-between gap-3">
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-base font-semibold text-default sm:text-lg">
            {{ props.question.label }}
          </h3>
          <UBadge
            v-if="props.question.required"
            label="Required"
            color="primary"
            variant="subtle"
            size="sm"
          />
          <UBadge
            v-if="currentState"
            :label="stateLabel(currentState)"
            color="neutral"
            variant="soft"
            size="sm"
          />
        </div>
        <p class="text-sm text-muted">
          {{ props.question.description }}
        </p>
      </div>
      <UBadge
        :label="props.question.contextRole"
        :color="props.question.contextRole === 'hard' ? 'primary' : 'neutral'"
        variant="subtle"
        size="sm"
      />
    </div>

    <div v-if="props.question.kind === 'single_select'" class="flex flex-wrap gap-2">
      <UButton
        v-for="option in props.question.options"
        :key="option.value"
        :label="option.label"
        :color="selectedValue === option.value ? 'primary' : 'neutral'"
        :variant="selectedValue === option.value ? 'solid' : 'soft'"
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
          @click="toggleMultiValue(option.value)"
        />
    </div>

    <div v-else-if="props.question.kind === 'number_range'" class="grid gap-4 md:grid-cols-2">
      <UFormField :label="props.question.minLabel">
        <UInput
          v-model.number="rangeMinValue"
          class="w-full"
          type="number"
          :placeholder="props.question.minPlaceholder"
        />
      </UFormField>
      <UFormField :label="props.question.maxLabel" :required="props.question.required">
        <UInput
          v-model.number="rangeMaxValue"
          class="w-full"
          type="number"
          :placeholder="props.question.maxPlaceholder"
        />
      </UFormField>
    </div>

    <div v-else-if="props.question.kind === 'location'">
      <UInput v-model="textValue" class="w-full" :placeholder="questionPlaceholder" />
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
        size="sm"
        icon="i-lucide-forward"
        @click="applySpecialState('skipped')"
      />
      <UButton
        v-if="props.question.allowsNotSure"
        label="Not sure"
        color="neutral"
        variant="ghost"
        size="sm"
        icon="i-lucide-circle-help"
        @click="applySpecialState('not_sure')"
      />
      <UButton
        v-if="currentState && currentState !== 'answered'"
        label="Answer instead"
        color="primary"
        variant="ghost"
        size="sm"
        icon="i-lucide-rotate-ccw"
        @click="clearQuestionState"
      />
    </div>
  </UCard>
</template>

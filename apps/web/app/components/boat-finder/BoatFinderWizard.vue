<script setup lang="ts">
import type { BuyerProfileDraft } from '~~/lib/boatFinder'

const props = withDefaults(
  defineProps<{
    submitting?: boolean
    error?: string | null
  }>(),
  {
    submitting: false,
    error: null,
  },
)

const emit = defineEmits<{
  submit: []
}>()

const profile = defineModel<BuyerProfileDraft>({ required: true })
const step = shallowRef(0)

const steps = [
  {
    key: 'brief',
    label: 'Mission',
    description: 'Fishing style, waters, and crew profile.',
  },
  {
    key: 'budget',
    label: 'Constraints',
    description: 'Budget, size, maintenance, and ownership guardrails.',
  },
  {
    key: 'preferences',
    label: 'Checklist',
    description: 'Must-haves and deal-breakers for ranking.',
  },
] as const

const currentSections = computed(() => [steps[step.value]!.key])
const progressPercent = computed(() => ((step.value + 1) / steps.length) * 100)
const canMoveNext = computed(() => {
  if (step.value === 0) {
    return Boolean(
      profile.value.primaryUse &&
      profile.value.targetWatersOrRegion &&
      profile.value.crewSize &&
      profile.value.experienceLevel,
    )
  }

  if (step.value === 1) {
    return Boolean(
      profile.value.budgetMax &&
      profile.value.maintenanceAppetite &&
      profile.value.storageOrTowingConstraints,
    )
  }

  return true
})

function goNext() {
  if (!canMoveNext.value || step.value >= steps.length - 1) return
  step.value += 1
}

function goBack() {
  if (step.value === 0) return
  step.value -= 1
}
</script>

<template>
  <UCard class="card-base border-default" :ui="{ body: 'p-4 sm:p-5 space-y-5' }">
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">
            Step {{ step + 1 }} of {{ steps.length }}
          </p>
          <h2 class="text-lg font-semibold text-default">
            {{ steps[step]?.label }}
          </h2>
        </div>
        <UBadge :label="steps[step]?.description" color="neutral" variant="subtle" size="sm" />
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div
          v-for="(item, index) in steps"
          :key="item.key"
          class="h-2 rounded-full transition-colors"
          :class="index <= step ? 'bg-primary' : 'bg-muted'"
        />
      </div>

      <div class="flex items-center justify-between gap-3 text-sm text-muted">
        <span>{{ Math.round(progressPercent) }}% complete</span>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="(item, index) in steps"
            :key="item.key"
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

    <BoatFinderProfileFields v-model="profile" :sections="currentSections" />

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
          v-if="step < steps.length - 1"
          label="Continue"
          color="primary"
          icon="i-lucide-arrow-right"
          trailing
          :disabled="!canMoveNext || props.submitting"
          @click="goNext"
        />
        <UButton
          v-else
          label="Find matching boats"
          color="primary"
          icon="i-lucide-sparkles"
          :loading="props.submitting"
          @click="emit('submit')"
        />
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { BuyerContext } from '~~/lib/boatFinder'

const props = withDefaults(
  defineProps<{
    context: BuyerContext
    saveOverrides?: boolean
    allowSaveToggle?: boolean
  }>(),
  {
    saveOverrides: false,
    allowSaveToggle: true,
  },
)

const emit = defineEmits<{
  'update:saveOverrides': [value: boolean]
}>()

function handleSaveOverridesUpdate(value: boolean | string) {
  emit('update:saveOverrides', Boolean(value))
}
</script>

<template>
  <UCard class="card-base border-default" :ui="{ body: 'p-4 sm:p-5 space-y-5' }">
    <div class="space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge label="What we heard" color="primary" variant="subtle" icon="i-lucide-brain" />
        <UBadge label="Review before generate" color="neutral" variant="soft" />
      </div>
      <h3 class="text-lg font-semibold text-default">Pressure-test the brief before we rank.</h3>
      <p class="text-sm text-muted">
        Hard guardrails drive filtering. Softer preferences and life-fit context shape ranking and
        commentary.
      </p>
    </div>

    <div class="space-y-3">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Buyer brief</p>
      <p class="rounded-2xl bg-muted px-4 py-3 text-sm text-default">
        {{ props.context.buyerBrief }}
      </p>
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Hard guardrails</p>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="item in props.context.filterSummary.hardConstraintSummary"
            :key="item"
            :label="item"
            color="primary"
            variant="soft"
          />
          <p
            v-if="props.context.filterSummary.hardConstraintSummary.length === 0"
            class="text-sm text-muted"
          >
            No hard guardrails beyond the minimum required answers.
          </p>
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Soft signals</p>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="item in props.context.filterSummary.softPreferenceSummary"
            :key="item"
            :label="item"
            color="neutral"
            variant="soft"
          />
          <p
            v-if="props.context.filterSummary.softPreferenceSummary.length === 0"
            class="text-sm text-muted"
          >
            You kept the preference layer intentionally light.
          </p>
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
          Life-fit context
        </p>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="item in props.context.filterSummary.reflectiveSummary"
            :key="item"
            :label="item"
            color="neutral"
            variant="subtle"
          />
          <p
            v-if="props.context.filterSummary.reflectiveSummary.length === 0"
            class="text-sm text-muted"
          >
            No reflective context added. The shortlist will lean on the factual answers only.
          </p>
        </div>
      </div>
    </div>

    <div v-if="props.context.uncertainties.length" class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
        Skipped or unclear
      </p>
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="item in props.context.uncertainties"
          :key="item"
          :label="item"
          color="neutral"
          variant="soft"
        />
      </div>
    </div>

    <div
      v-if="props.allowSaveToggle"
      class="rounded-2xl border border-default bg-default px-4 py-3 text-sm text-default"
    >
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-1">
          <p class="font-semibold text-default">Save these answers into the core profile</p>
          <p class="text-sm text-muted">
            Leave this off if you want a one-off run without changing your default buyer profile.
          </p>
        </div>
        <ClientOnly>
          <USwitch
            :model-value="props.saveOverrides"
            @update:model-value="handleSaveOverridesUpdate"
          />
        </ClientOnly>
      </div>
    </div>
  </UCard>
</template>

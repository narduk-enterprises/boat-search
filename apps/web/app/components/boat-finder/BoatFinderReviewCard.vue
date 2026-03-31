<script setup lang="ts">
import type { BuyerContext } from '~~/lib/boatFinder'

const props = withDefaults(
  defineProps<{
    context: BuyerContext
    saveOverrides?: boolean
    allowSaveToggle?: boolean
    /** Dense rail: summary + expandable details (wizard sidebar). */
    compact?: boolean
    /** Strip card chrome when nested inside another surface (e.g. wizard rail). */
    embedded?: boolean
  }>(),
  {
    saveOverrides: false,
    allowSaveToggle: true,
    compact: false,
    embedded: false,
  },
)

const detailsOpen = ref(false)

const emit = defineEmits<{
  'update:saveOverrides': [value: boolean]
}>()

function handleSaveOverridesUpdate(value: boolean | string) {
  emit('update:saveOverrides', Boolean(value))
}
</script>

<template>
  <UCard
    class="card-base border-default"
    :class="[props.embedded && 'border-0 bg-transparent shadow-none ring-0']"
    :ui="{ body: props.compact ? 'p-0 space-y-3 sm:p-0' : 'p-4 sm:p-5 space-y-5' }"
  >
    <div class="space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge
          :label="props.compact ? 'Live brief' : 'What we heard'"
          color="primary"
          variant="subtle"
          :icon="props.compact ? 'i-lucide-clipboard-list' : 'i-lucide-brain'"
        />
        <UBadge
          v-if="!props.compact"
          label="Review before generate"
          color="neutral"
          variant="soft"
        />
      </div>
      <h3 class="text-base font-semibold text-default sm:text-lg">
        {{
          props.compact
            ? 'How we read your answers so far'
            : 'Pressure-test the brief before we rank.'
        }}
      </h3>
      <p v-if="!props.compact" class="text-sm text-muted">
        Hard guardrails drive filtering. Softer preferences and life-fit context shape ranking and
        commentary.
      </p>
    </div>

    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Buyer brief</p>
      <p
        class="rounded-xl bg-muted px-3 py-2.5 text-sm text-default"
        :class="props.compact ? 'line-clamp-4' : ''"
      >
        {{ props.context.buyerBrief }}
      </p>
      <UButton
        v-if="props.compact"
        label="Show hard / soft / life-fit detail"
        color="neutral"
        variant="ghost"
        size="xs"
        :trailing-icon="detailsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        class="transition-fast -mx-1"
        @click="detailsOpen = !detailsOpen"
      />
    </div>

    <div v-show="!props.compact || detailsOpen" class="grid gap-4 lg:grid-cols-3">
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
      v-if="props.allowSaveToggle && !props.compact"
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

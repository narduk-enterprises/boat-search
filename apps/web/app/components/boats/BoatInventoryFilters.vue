<script setup lang="ts">
import type { BoatInventoryFilters } from '~~/app/types/boat-inventory'

const props = withDefaults(
  defineProps<{
    loading?: boolean
    hasActiveFilters: boolean
    hasUnsavedChanges?: boolean
    resultsLabel?: string | null
    suggestedMakes?: string[]
    mode?: 'desktop' | 'overlay'
  }>(),
  {
    loading: false,
    hasUnsavedChanges: false,
    resultsLabel: null,
    suggestedMakes: () => [],
    mode: 'desktop',
  },
)

const budgetPresets = [
  { label: 'Under $100k', minPrice: '', maxPrice: '100000' },
  { label: '$100k to $250k', minPrice: '100000', maxPrice: '250000' },
  { label: '$250k to $500k', minPrice: '250000', maxPrice: '500000' },
  { label: '$500k+', minPrice: '500000', maxPrice: '' },
]

const lengthPresets = [
  { label: '20 to 28 ft', minLength: '20', maxLength: '28' },
  { label: '28 to 35 ft', minLength: '28', maxLength: '35' },
  { label: '35 to 45 ft', minLength: '35', maxLength: '45' },
  { label: '45 ft+', minLength: '45', maxLength: '' },
]

const filters = defineModel<BoatInventoryFilters>({ required: true })

const emit = defineEmits<{
  submit: []
  clear: []
}>()

const isOverlayMode = computed(() => props.mode === 'overlay')
const activeDraftCount = computed(
  () => Object.values(filters.value).filter((value) => value.trim().length > 0).length,
)
const normalizedSuggestedMakes = computed(() =>
  props.suggestedMakes
    .map((make) => make.trim())
    .filter((make, index, makes) => make.length > 0 && makes.indexOf(make) === index),
)
const canClear = computed(() => props.hasActiveFilters || activeDraftCount.value > 0)
const applyLabel = computed(() =>
  props.hasUnsavedChanges ? 'Apply updated view' : 'View current results',
)
const appliedViewLabel = computed(() => props.resultsLabel || 'Ready to open a market view')
const appliedViewNote = computed(() =>
  props.hasUnsavedChanges
    ? 'Draft edits are waiting in the form below. Apply them to refresh the live market slice.'
    : 'The draft filters already match the live results shown beside this panel.',
)

function applyBudgetPreset(minPrice: string, maxPrice: string) {
  filters.value.minPrice = minPrice
  filters.value.maxPrice = maxPrice
}

function applyLengthPreset(minLength: string, maxLength: string) {
  filters.value.minLength = minLength
  filters.value.maxLength = maxLength
}

function applySuggestedMake(make: string) {
  filters.value.make = make
}

function matchesBudgetPreset(minPrice: string, maxPrice: string) {
  return filters.value.minPrice === minPrice && filters.value.maxPrice === maxPrice
}

function matchesLengthPreset(minLength: string, maxLength: string) {
  return filters.value.minLength === minLength && filters.value.maxLength === maxLength
}
</script>

<template>
  <UCard
    class="brand-surface brand-grid-panel"
    :ui="{ body: isOverlayMode ? 'relative space-y-6 p-5 sm:p-6' : 'relative space-y-6 p-6' }"
  >
    <div class="space-y-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-dimmed">Buyer lens</p>
          <h2 class="mt-2 text-2xl font-semibold text-highlighted">Shape this market view.</h2>
        </div>
        <div class="flex flex-wrap gap-2">
          <UBadge
            :label="props.hasActiveFilters ? 'Custom view active' : 'Wide-open market'"
            :color="props.hasActiveFilters ? 'primary' : 'neutral'"
            variant="subtle"
          />
          <UBadge
            v-if="props.hasUnsavedChanges"
            label="Draft changes"
            color="warning"
            variant="soft"
          />
        </div>
      </div>
      <p class="text-sm text-muted">
        Keep draft edits here, then apply them when the view feels right. The live URL only changes
        when you apply the view.
      </p>
      <div class="flex flex-wrap gap-2 text-sm">
        <UBadge
          :label="`${activeDraftCount} draft filter${activeDraftCount === 1 ? '' : 's'}`"
          color="neutral"
          variant="soft"
        />
        <UBadge
          :label="props.hasUnsavedChanges ? 'Results are not updated yet' : 'Draft matches results'"
          :color="props.hasUnsavedChanges ? 'warning' : 'neutral'"
          variant="soft"
        />
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="brand-surface-soft rounded-[1.25rem] p-4">
        <div class="space-y-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
              Budget presets
            </p>
            <p class="mt-1 text-sm text-muted">
              Start with an asking-price lane before you refine the shortlist.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="preset in budgetPresets"
              :key="preset.label"
              :label="preset.label"
              :color="matchesBudgetPreset(preset.minPrice, preset.maxPrice) ? 'primary' : 'neutral'"
              :variant="matchesBudgetPreset(preset.minPrice, preset.maxPrice) ? 'soft' : 'ghost'"
              size="sm"
              @click="applyBudgetPreset(preset.minPrice, preset.maxPrice)"
            />
          </div>
        </div>
      </div>

      <div class="brand-surface-soft rounded-[1.25rem] p-4">
        <div class="space-y-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
              Length presets
            </p>
            <p class="mt-1 text-sm text-muted">
              Match the hull-size band you can realistically berth, tow, or run.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="preset in lengthPresets"
              :key="preset.label"
              :label="preset.label"
              :color="
                matchesLengthPreset(preset.minLength, preset.maxLength) ? 'primary' : 'neutral'
              "
              :variant="matchesLengthPreset(preset.minLength, preset.maxLength) ? 'soft' : 'ghost'"
              size="sm"
              @click="applyLengthPreset(preset.minLength, preset.maxLength)"
            />
          </div>
        </div>
      </div>
    </div>

    <div v-if="normalizedSuggestedMakes.length" class="brand-surface-soft rounded-[1.25rem] p-4">
      <div class="space-y-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Popular makes</p>
          <p class="mt-1 text-sm text-muted">
            Tap a common builder to seed the make field without leaving the current draft view.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="make in normalizedSuggestedMakes"
            :key="make"
            :label="make"
            :color="filters.make === make ? 'primary' : 'neutral'"
            :variant="filters.make === make ? 'soft' : 'ghost'"
            size="sm"
            @click="applySuggestedMake(make)"
          />
        </div>
      </div>
    </div>

    <USeparator />

    <UForm :state="filters" class="space-y-5" @submit.prevent="emit('submit')">
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField name="make" label="Make" description="Builder or brand name">
          <UInput
            v-model="filters.make"
            class="w-full"
            placeholder="Grady-White, Boston Whaler, Sea Ray"
          />
        </UFormField>

        <UFormField name="location" label="Location" description="State, city, or region">
          <UInput v-model="filters.location" class="w-full" placeholder="FL, Miami, Gulf Coast" />
        </UFormField>

        <UFormField name="minPrice" label="Minimum price" description="Lowest asking price">
          <UInput
            v-model="filters.minPrice"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="25000"
          />
        </UFormField>

        <UFormField name="maxPrice" label="Maximum price" description="Highest asking price">
          <UInput
            v-model="filters.maxPrice"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="100000"
          />
        </UFormField>

        <UFormField
          name="minLength"
          label="Minimum length (ft)"
          description="Smallest hull to include"
        >
          <UInput
            v-model="filters.minLength"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="20"
          />
        </UFormField>

        <UFormField
          name="maxLength"
          label="Maximum length (ft)"
          description="Largest hull to include"
        >
          <UInput
            v-model="filters.maxLength"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="42"
          />
        </UFormField>
      </div>

      <div class="brand-surface-soft rounded-[1.25rem] p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
              Current applied view
            </p>
            <p class="text-base font-semibold text-highlighted">
              {{ appliedViewLabel }}
            </p>
          </div>
          <UBadge
            :label="props.hasUnsavedChanges ? 'Draft differs from live' : 'Live view in sync'"
            :color="props.hasUnsavedChanges ? 'warning' : 'neutral'"
            variant="soft"
          />
        </div>
        <p class="mt-2 text-sm text-muted">
          {{ appliedViewNote }}
        </p>
      </div>

      <div
        :class="
          isOverlayMode
            ? 'sticky bottom-0 z-10 -mx-5 border-t border-default bg-default/95 px-5 pb-1 pt-4 backdrop-blur-sm sm:-mx-6 sm:px-6'
            : 'flex flex-wrap gap-3'
        "
      >
        <div :class="isOverlayMode ? 'flex flex-wrap gap-3' : 'contents'">
          <UButton
            type="submit"
            :label="applyLabel"
            icon="i-lucide-search"
            :loading="props.loading"
            class="brand-button-shadow"
          />
          <UButton
            label="Reset all"
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="soft"
            :disabled="!canClear"
            @click="emit('clear')"
          />
        </div>
      </div>
    </UForm>
  </UCard>
</template>

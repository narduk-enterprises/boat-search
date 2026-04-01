<script setup lang="ts">
import type { BoatInventoryFilters } from '~~/app/types/boat-inventory'
import {
  BOAT_INVENTORY_BUDGET_PRESETS,
  BOAT_INVENTORY_LENGTH_PRESETS,
} from '~~/app/types/boat-inventory'
import BoatInventoryVesselFilters from '~~/app/components/boats/BoatInventoryVesselFilters.vue'

type AutoApplyMode = 'immediate' | 'debounced'

const props = withDefaults(
  defineProps<{
    hasActiveFilters?: boolean
    suggestedMakes?: string[]
  }>(),
  {
    hasActiveFilters: false,
    suggestedMakes: () => [],
  },
)

const filters = defineModel<BoatInventoryFilters>({ required: true })

const emit = defineEmits<{
  clear: []
  requestAutoApply: [mode: AutoApplyMode]
}>()

const normalizedSuggestedMakes = computed(() =>
  props.suggestedMakes
    .map((make) => String(make ?? '').trim())
    .filter((make, index, makes) => make.length > 0 && makes.indexOf(make) === index),
)
const activeDraftCount = computed(
  () =>
    Object.values(filters.value).filter((value) => String(value ?? '').trim().length > 0).length,
)
const canClear = computed(() => props.hasActiveFilters || activeDraftCount.value > 0)
const laneLabel = computed(() => {
  if (filters.value.vesselMode === 'power') return 'Power lane'
  if (filters.value.vesselMode === 'sail') return 'Sail lane'
  return 'All inventory'
})
const { makeField, locationField } = useBoatInventoryAutocomplete({
  makeQuery: computed(() => filters.value.make),
  locationQuery: computed(() => filters.value.location),
})

function requestAutoApply(mode: AutoApplyMode) {
  emit('requestAutoApply', mode)
}

function normalizeInputValue(value: string | number | null | undefined) {
  return value == null ? '' : String(value)
}

function setTextFilter(key: keyof BoatInventoryFilters, value: string | number | null | undefined) {
  filters.value[key] = normalizeInputValue(value) as never
  requestAutoApply('debounced')
}

function setVesselMode(value: BoatInventoryFilters['vesselMode']) {
  filters.value.vesselMode = value
  if (
    filters.value.vesselSubtype &&
    !filters.value.vesselSubtype.startsWith(value ? `${value}-` : '__invalid__')
  ) {
    filters.value.vesselSubtype = ''
  }
  requestAutoApply('immediate')
}

function setVesselSubtype(value: BoatInventoryFilters['vesselSubtype']) {
  filters.value.vesselSubtype = value
  requestAutoApply('immediate')
}

function applyBudgetPreset(minPrice: string, maxPrice: string) {
  filters.value.minPrice = minPrice
  filters.value.maxPrice = maxPrice
  requestAutoApply('immediate')
}

function applyLengthPreset(minLength: string, maxLength: string) {
  filters.value.minLength = minLength
  filters.value.maxLength = maxLength
  requestAutoApply('immediate')
}

function applySuggestedMake(make: string) {
  filters.value.make = make
  requestAutoApply('immediate')
}

function matchesBudgetPreset(minPrice: string, maxPrice: string) {
  return filters.value.minPrice === minPrice && filters.value.maxPrice === maxPrice
}

function matchesLengthPreset(minLength: string, maxLength: string) {
  return filters.value.minLength === minLength && filters.value.maxLength === maxLength
}
</script>

<template>
  <div
    class="brand-surface brand-grid-panel brand-orbit space-y-6 rounded-[1.8rem] p-5 sm:p-6"
    data-testid="boat-inventory-filters-panel"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <div
          class="flex size-11 shrink-0 items-center justify-center rounded-[1.2rem] bg-primary/10 text-primary"
        >
          <UIcon name="i-lucide-sliders-horizontal" class="text-lg" />
        </div>
        <div class="space-y-2">
          <div class="flex flex-wrap gap-2">
            <UBadge :label="laneLabel" color="neutral" variant="soft" />
            <UBadge
              :label="`${activeDraftCount} active`"
              :color="activeDraftCount ? 'primary' : 'neutral'"
              variant="soft"
            />
          </div>
          <p class="text-sm font-medium text-default">Filters update results automatically.</p>
        </div>
      </div>

      <UButton
        type="button"
        icon="i-lucide-rotate-ccw"
        label="Reset"
        color="neutral"
        variant="soft"
        :disabled="!canClear"
        @click="emit('clear')"
      />
    </div>

    <div class="brand-surface-soft rounded-[1.35rem] p-4 sm:p-5">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-waves" class="text-base text-primary" />
        <p class="text-xs font-semibold uppercase tracking-[0.2em] text-dimmed">Vessel mode</p>
      </div>

      <div class="mt-4">
        <BoatInventoryVesselFilters
          :vessel-mode="filters.vesselMode"
          :vessel-subtype="filters.vesselSubtype"
          @update:vessel-mode="setVesselMode"
          @update:vessel-subtype="setVesselSubtype"
        />
      </div>
    </div>

    <div class="brand-surface-soft rounded-[1.35rem] p-4 md:col-span-2">
      <UFormField name="q" label="Keywords">
        <UInput
          :model-value="filters.q"
          class="w-full"
          type="search"
          icon="i-lucide-search"
          enterkeyhint="search"
          placeholder="Sea Ray, diesel, flybridge…"
          @update:model-value="setTextFilter('q', $event)"
        />
      </UFormField>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="brand-surface-soft rounded-[1.35rem] p-4">
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-dollar-sign" class="text-base text-primary" />
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Budget</p>
          </div>
          <div class="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <UButton
              v-for="preset in BOAT_INVENTORY_BUDGET_PRESETS"
              :key="preset.label"
              :label="preset.label"
              :color="matchesBudgetPreset(preset.minPrice, preset.maxPrice) ? 'primary' : 'neutral'"
              :variant="matchesBudgetPreset(preset.minPrice, preset.maxPrice) ? 'soft' : 'ghost'"
              size="sm"
              type="button"
              class="min-h-10 w-full justify-center rounded-full px-3"
              @click="applyBudgetPreset(preset.minPrice, preset.maxPrice)"
            />
          </div>
        </div>
      </div>

      <div class="brand-surface-soft rounded-[1.35rem] p-4">
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-ruler" class="text-base text-primary" />
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Length</p>
          </div>
          <div class="grid grid-cols-2 gap-2 lg:grid-cols-3">
            <UButton
              v-for="preset in BOAT_INVENTORY_LENGTH_PRESETS"
              :key="preset.label"
              :label="preset.label"
              :color="
                matchesLengthPreset(preset.minLength, preset.maxLength) ? 'primary' : 'neutral'
              "
              :variant="matchesLengthPreset(preset.minLength, preset.maxLength) ? 'soft' : 'ghost'"
              size="sm"
              type="button"
              class="min-h-10 w-full justify-center rounded-full px-3"
              @click="applyLengthPreset(preset.minLength, preset.maxLength)"
            />
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="normalizedSuggestedMakes.length"
      class="brand-surface-soft rounded-[1.35rem] p-4 sm:p-5"
    >
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-anchor" class="text-base text-primary" />
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Popular makes</p>
        </div>
        <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <UButton
            v-for="make in normalizedSuggestedMakes"
            :key="make"
            :label="make"
            :color="filters.make === make ? 'primary' : 'neutral'"
            :variant="filters.make === make ? 'soft' : 'ghost'"
            size="sm"
            type="button"
            class="min-h-10 w-full justify-center rounded-full px-3"
            @click="applySuggestedMake(make)"
          />
        </div>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="brand-surface-soft rounded-[1.35rem] p-4">
        <UFormField name="make" label="Make" :description="makeField.helperText">
          <UInput
            :model-value="filters.make"
            class="w-full"
            type="search"
            icon="i-lucide-anchor"
            enterkeyhint="next"
            placeholder="Grady-White, Boston Whaler"
            @update:model-value="setTextFilter('make', $event)"
          />
        </UFormField>
      </div>

      <div class="brand-surface-soft rounded-[1.35rem] p-4">
        <UFormField name="location" label="Location" :description="locationField.helperText">
          <UInput
            :model-value="filters.location"
            class="w-full"
            type="search"
            icon="i-lucide-map-pin"
            enterkeyhint="search"
            placeholder="FL, Miami, Gulf Coast"
            @update:model-value="setTextFilter('location', $event)"
            @keydown.enter="requestAutoApply('immediate')"
          />
        </UFormField>
      </div>

      <div class="brand-surface-soft rounded-[1.35rem] p-4">
        <UFormField name="minPrice" label="Min price">
          <UInput
            :model-value="filters.minPrice"
            class="w-full"
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            icon="i-lucide-dollar-sign"
            placeholder="25000"
            @update:model-value="setTextFilter('minPrice', $event)"
          />
        </UFormField>
      </div>

      <div class="brand-surface-soft rounded-[1.35rem] p-4">
        <UFormField name="maxPrice" label="Max price">
          <UInput
            :model-value="filters.maxPrice"
            class="w-full"
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            icon="i-lucide-dollar-sign"
            placeholder="100000"
            @update:model-value="setTextFilter('maxPrice', $event)"
          />
        </UFormField>
      </div>

      <div class="brand-surface-soft rounded-[1.35rem] p-4">
        <UFormField name="minLength" label="Min length (ft)">
          <UInput
            :model-value="filters.minLength"
            class="w-full"
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            icon="i-lucide-ruler"
            placeholder="20"
            @update:model-value="setTextFilter('minLength', $event)"
          />
        </UFormField>
      </div>

      <div class="brand-surface-soft rounded-[1.35rem] p-4">
        <UFormField name="maxLength" label="Max length (ft)">
          <UInput
            :model-value="filters.maxLength"
            class="w-full"
            type="number"
            inputmode="numeric"
            min="0"
            step="1"
            icon="i-lucide-ruler"
            placeholder="42"
            @update:model-value="setTextFilter('maxLength', $event)"
          />
        </UFormField>
      </div>
    </div>
  </div>
</template>

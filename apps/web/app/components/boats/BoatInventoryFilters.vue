<script setup lang="ts">
import type { BoatInventoryFilters } from '~~/app/types/boat-inventory'

const props = withDefaults(
  defineProps<{
    loading?: boolean
    hasActiveFilters: boolean
  }>(),
  {
    loading: false,
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

function applyBudgetPreset(minPrice: string, maxPrice: string) {
  filters.value.minPrice = minPrice
  filters.value.maxPrice = maxPrice
}

function applyLengthPreset(minLength: string, maxLength: string) {
  filters.value.minLength = minLength
  filters.value.maxLength = maxLength
}

function matchesBudgetPreset(minPrice: string, maxPrice: string) {
  return filters.value.minPrice === minPrice && filters.value.maxPrice === maxPrice
}

function matchesLengthPreset(minLength: string, maxLength: string) {
  return filters.value.minLength === minLength && filters.value.maxLength === maxLength
}
</script>

<template>
  <UCard class="brand-surface brand-grid-panel" :ui="{ body: 'relative p-6 space-y-6' }">
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.2em] text-dimmed">Buyer lens</p>
          <h2 class="mt-2 text-2xl font-semibold text-highlighted">Shape this market view.</h2>
        </div>
        <UBadge
          :label="props.hasActiveFilters ? 'Custom view active' : 'Wide-open market'"
          :color="props.hasActiveFilters ? 'primary' : 'neutral'"
          variant="subtle"
        />
      </div>
      <p class="text-sm text-muted">
        Filters sync to the URL, so you can save or share a precise slice of the used-boat market.
      </p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="brand-surface-soft rounded-[1.25rem] p-4">
        <div class="space-y-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
              Budget presets
            </p>
            <p class="mt-1 text-sm text-muted">
              Use an asking-price window to tighten the field fast.
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

    <UForm :state="filters" class="space-y-5" @submit.prevent="emit('submit')">
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField name="make" label="Make">
          <UInput
            v-model="filters.make"
            class="w-full"
            placeholder="Grady-White, Boston Whaler, Sea Ray"
          />
        </UFormField>

        <UFormField name="location" label="Location">
          <UInput v-model="filters.location" class="w-full" placeholder="FL, Miami, Gulf Coast" />
        </UFormField>

        <UFormField name="minPrice" label="Minimum price">
          <UInput
            v-model="filters.minPrice"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="25000"
          />
        </UFormField>

        <UFormField name="maxPrice" label="Maximum price">
          <UInput
            v-model="filters.maxPrice"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="100000"
          />
        </UFormField>

        <UFormField name="minLength" label="Minimum length (ft)">
          <UInput
            v-model="filters.minLength"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="20"
          />
        </UFormField>

        <UFormField name="maxLength" label="Maximum length (ft)">
          <UInput
            v-model="filters.maxLength"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="42"
          />
        </UFormField>
      </div>

      <div class="flex flex-wrap gap-3">
        <UButton
          type="submit"
          label="Apply filters"
          icon="i-lucide-search"
          :loading="props.loading"
          class="brand-button-shadow"
        />
        <UButton
          label="Clear filters"
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="soft"
          :disabled="!props.hasActiveFilters"
          @click="emit('clear')"
        />
      </div>
    </UForm>
  </UCard>
</template>

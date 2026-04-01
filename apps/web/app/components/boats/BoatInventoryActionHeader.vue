<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type {
  BoatInventoryActiveFilterChip,
  BoatInventoryFilterKey,
} from '~~/app/types/boat-inventory'

const props = withDefaults(
  defineProps<{
    resultsLabel: string
    activeFilterCount?: number
    activeFilterChips?: BoatInventoryActiveFilterChip[]
    hasActiveFilters?: boolean
    alternateViewLabel?: string
    alternateViewTo?: RouteLocationRaw | null
    alternateViewIcon?: string
  }>(),
  {
    activeFilterCount: 0,
    activeFilterChips: () => [],
    hasActiveFilters: false,
    alternateViewLabel: undefined,
    alternateViewTo: null,
    alternateViewIcon: 'i-lucide-map',
  },
)

const emit = defineEmits<{
  openSort: []
  openFilters: []
  clearFilters: []
  removeFilter: [key: BoatInventoryFilterKey]
}>()

const filtersLabel = computed(() =>
  props.activeFilterCount ? `Filters (${props.activeFilterCount})` : 'Filters',
)
const stickyStyle = computed(() => ({
  top: 'calc(var(--brand-header-total-height, 5.5rem) - 1px)',
}))
</script>

<template>
  <div
    class="sticky z-40 -mt-3 pb-1.5 sm:mt-0 sm:pb-3"
    :style="stickyStyle"
    data-testid="boat-inventory-action-header"
  >
    <div
      class="brand-surface -mx-4 flex flex-col gap-1.5 rounded-b-[1.2rem] rounded-t-none border-x-0 border-t-0 px-3.5 py-2 sm:mx-auto sm:max-w-6xl sm:gap-2 sm:rounded-[1.45rem] sm:border-x sm:border-t sm:px-4 sm:py-2.5"
    >
      <div class="flex items-center justify-between gap-3">
        <p
          class="min-w-0 truncate px-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-dimmed sm:px-0 sm:text-[0.95rem] sm:normal-case sm:tracking-normal sm:text-default"
        >
          {{ props.resultsLabel }}
        </p>
        <UButton
          v-if="props.hasActiveFilters"
          color="neutral"
          variant="ghost"
          icon="i-lucide-rotate-ccw"
          label="Reset"
          class="min-h-8 shrink-0 rounded-full px-2 text-sm sm:min-h-9"
          @click="emit('clearFilters')"
        />
      </div>

      <div class="flex items-center gap-1.5 overflow-x-auto px-1 pb-0 sm:gap-2 sm:px-0">
        <UButton
          v-if="props.alternateViewLabel && props.alternateViewTo"
          color="neutral"
          variant="soft"
          :icon="props.alternateViewIcon"
          :label="props.alternateViewLabel"
          :to="props.alternateViewTo"
          class="min-h-10 shrink-0 justify-center rounded-full px-3 text-sm sm:px-3.5"
        />
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-arrow-up-down"
          label="Sort"
          class="min-h-10 shrink-0 justify-center rounded-full px-3 text-sm sm:px-3.5"
          @click="emit('openSort')"
        />
        <UButton
          color="primary"
          variant="solid"
          icon="i-lucide-sliders-horizontal"
          :label="filtersLabel"
          class="min-h-10 shrink-0 justify-center rounded-full px-3 text-sm sm:px-3.5"
          @click="emit('openFilters')"
        />
      </div>

      <div
        v-if="props.activeFilterChips.length"
        class="flex flex-wrap items-center gap-1.5 px-1 pb-0.5 sm:gap-2 sm:px-0"
      >
        <UButton
          v-for="chip in props.activeFilterChips"
          :key="chip.key"
          :label="`${chip.label}: ${chip.value}`"
          color="neutral"
          variant="soft"
          size="sm"
          class="shrink-0 rounded-full"
          trailing-icon="i-lucide-x"
          @click="emit('removeFilter', chip.key)"
        />
      </div>
    </div>
  </div>
</template>

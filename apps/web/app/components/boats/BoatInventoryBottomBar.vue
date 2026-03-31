<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { BoatInventorySort } from '~~/app/types/boat-inventory'
import { BOAT_INVENTORY_SORT_OPTIONS } from '~~/app/types/boat-inventory'

const props = withDefaults(
  defineProps<{
    currentSort: BoatInventorySort
    activeFilterCount?: number
    hasUnsavedChanges?: boolean
    resultsLabel: string
    alternateViewLabel?: string
    alternateViewTo?: RouteLocationRaw | null
    alternateViewIcon?: string
  }>(),
  {
    activeFilterCount: 0,
    hasUnsavedChanges: false,
    alternateViewLabel: undefined,
    alternateViewTo: null,
    alternateViewIcon: 'i-lucide-map',
  },
)

const emit = defineEmits<{
  openSort: []
  openFilters: []
}>()

const currentSortLabel = computed(
  () =>
    BOAT_INVENTORY_SORT_OPTIONS.find((option) => option.value === props.currentSort)?.label ||
    'Newest listings',
)
const filtersLabel = computed(() => {
  if (props.hasUnsavedChanges) return 'Review filters'
  if (props.activeFilterCount) return `Filters (${props.activeFilterCount})`
  return 'Filters'
})
const actionGridClass = computed(() =>
  props.alternateViewLabel && props.alternateViewTo ? 'grid-cols-3' : 'grid-cols-2',
)
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 z-40 px-3 [bottom:calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4"
  >
    <div
      class="pointer-events-auto mx-auto max-w-xl rounded-[1.75rem] border border-default bg-default/92 p-2 shadow-elevated backdrop-blur-xl sm:flex sm:items-center sm:gap-2"
    >
      <div class="hidden min-w-0 flex-1 px-3 sm:block">
        <p class="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-dimmed">
          Live inventory
        </p>
        <p class="truncate text-sm text-default">
          {{ resultsLabel }}
        </p>
        <p class="truncate text-xs text-muted">
          {{ currentSortLabel }}
        </p>
      </div>

      <div class="grid gap-2 sm:flex sm:items-center" :class="actionGridClass">
        <UButton
          v-if="props.alternateViewLabel && props.alternateViewTo"
          color="neutral"
          variant="ghost"
          :icon="props.alternateViewIcon"
          :label="props.alternateViewLabel"
          :to="props.alternateViewTo"
          class="min-h-11 justify-center rounded-full sm:min-h-10"
        />
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-arrow-up-down"
          label="Sort"
          class="min-h-11 justify-center rounded-full sm:min-h-10"
          @click="emit('openSort')"
        />
        <UButton
          color="primary"
          variant="solid"
          icon="i-lucide-sliders-horizontal"
          :label="filtersLabel"
          class="min-h-11 justify-center rounded-full sm:min-h-10"
          @click="emit('openFilters')"
        />
      </div>
    </div>
  </div>
</template>

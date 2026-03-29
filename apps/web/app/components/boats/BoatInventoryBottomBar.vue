<script setup lang="ts">
import type { BoatInventorySort } from '~~/app/types/boat-inventory'
import { BOAT_INVENTORY_SORT_OPTIONS } from '~~/app/types/boat-inventory'

const props = withDefaults(
  defineProps<{
    currentSort: BoatInventorySort
    activeFilterCount?: number
    hasUnsavedChanges?: boolean
    resultsLabel: string
  }>(),
  {
    activeFilterCount: 0,
    hasUnsavedChanges: false,
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
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-40 px-4">
    <div
      class="pointer-events-auto mx-auto flex max-w-xl items-center gap-2 rounded-full border border-default bg-default/90 px-2 py-2 shadow-elevated backdrop-blur-xl"
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

      <UButton
        color="neutral"
        variant="soft"
        icon="i-lucide-arrow-up-down"
        label="Sort"
        @click="emit('openSort')"
      />
      <UButton
        color="primary"
        variant="solid"
        icon="i-lucide-sliders-horizontal"
        :label="filtersLabel"
        @click="emit('openFilters')"
      />
    </div>
  </div>
</template>

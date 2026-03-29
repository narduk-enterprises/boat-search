<script setup lang="ts">
import type {
  BoatInventoryActiveFilterChip,
  BoatInventoryBoat,
  BoatInventoryFilterKey,
  BoatInventorySort,
} from '~~/app/types/boat-inventory'
import { BOAT_INVENTORY_SORT_OPTIONS } from '~~/app/types/boat-inventory'

const props = withDefaults(
  defineProps<{
    boats: BoatInventoryBoat[]
    status: 'idle' | 'pending' | 'success' | 'error'
    errorMessage?: string | null
    hasActiveFilters: boolean
    hasUnsavedChanges?: boolean
    activeFilterChips: BoatInventoryActiveFilterChip[]
    resultsLabel: string
    resultsContext: string
    total: number
    currentPage: number
    pageCount: number
    currentSort: BoatInventorySort
    hasNextPage: boolean
    hasPreviousPage: boolean
  }>(),
  {
    hasUnsavedChanges: false,
    errorMessage: null,
  },
)

const emit = defineEmits<{
  openFilters: []
  clearFilters: []
  removeFilter: [key: BoatInventoryFilterKey]
  changeSort: [value: BoatInventorySort]
  changePage: [page: number]
  retry: []
}>()

const sortItems = BOAT_INVENTORY_SORT_OPTIONS
const visiblePages = computed(() => {
  const start = Math.max(1, props.currentPage - 2)
  const end = Math.min(props.pageCount, props.currentPage + 2)

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

const emptyMessage = computed(() =>
  props.hasActiveFilters
    ? 'Widen the budget or hull-size band, or clear one of the applied filters below.'
    : 'Inventory is still filling in. Check back after the next import run.',
)

function normalizeSort(value: unknown): BoatInventorySort {
  if (value === 'price-asc') return value
  if (value === 'price-desc') return value
  if (value === 'year-desc') return value
  return 'updated-desc'
}

function handleSortChange(value: unknown) {
  emit('changeSort', normalizeSort(value))
}
</script>

<template>
  <div class="space-y-5">
    <UCard class="brand-surface brand-grid-panel" :ui="{ body: 'relative p-5 sm:p-6' }">
      <div class="space-y-5">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge label="Live results" color="primary" variant="subtle" icon="i-lucide-waves" />
              <h2 class="text-2xl font-semibold text-highlighted">Inventory worth a closer look</h2>
              <UBadge
                :label="resultsLabel"
                :color="boats.length ? 'primary' : 'neutral'"
                variant="subtle"
              />
              <UBadge
                v-if="status === 'pending'"
                label="Updating results"
                color="warning"
                variant="soft"
              />
            </div>
            <p class="max-w-3xl text-sm text-muted">
              {{ resultsContext }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-56 flex-1 xl:min-w-64">
              <USelectMenu
                :model-value="currentSort"
                :items="sortItems"
                value-key="value"
                label-key="label"
                class="w-full"
                @update:model-value="handleSortChange"
              />
            </div>
            <UButton
              class="xl:hidden"
              color="neutral"
              variant="soft"
              icon="i-lucide-sliders-horizontal"
              :label="
                activeFilterChips.length ? `Filters (${activeFilterChips.length})` : 'Filters'
              "
              @click="emit('openFilters')"
            />
          </div>
        </div>

        <USeparator />

        <div class="space-y-3">
          <div
            v-if="activeFilterChips.length"
            class="flex items-center gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible"
          >
            <UButton
              v-for="chip in activeFilterChips"
              :key="chip.key"
              :label="`${chip.label}: ${chip.value}`"
              color="neutral"
              variant="soft"
              size="sm"
              class="shrink-0"
              trailing-icon="i-lucide-x"
              @click="emit('removeFilter', chip.key)"
            />
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :label="`${total.toLocaleString()} total match${total === 1 ? '' : 'es'}`"
                color="neutral"
                variant="soft"
              />
              <UBadge
                v-if="hasUnsavedChanges"
                label="Draft filters not applied"
                color="warning"
                variant="soft"
              />
            </div>

            <UButton
              v-if="hasActiveFilters"
              color="neutral"
              variant="ghost"
              icon="i-lucide-rotate-ccw"
              label="Clear all"
              @click="emit('clearFilters')"
            />
          </div>
        </div>
      </div>
    </UCard>

    <div
      v-if="status === 'pending' && !boats.length"
      class="grid gap-5 md:grid-cols-2 2xl:grid-cols-3"
    >
      <UCard
        v-for="index in 6"
        :key="index"
        class="brand-surface overflow-hidden"
        :ui="{ body: 'p-0' }"
      >
        <USkeleton class="aspect-[4/3] w-full" />
        <div class="space-y-4 p-4 sm:p-5">
          <USkeleton class="h-4 w-28" />
          <USkeleton class="h-6 w-3/4" />
          <div class="flex gap-2">
            <USkeleton class="h-6 w-24 rounded-full" />
            <USkeleton class="h-6 w-20 rounded-full" />
          </div>
          <USkeleton class="h-4 w-full" />
          <USkeleton class="h-4 w-11/12" />
          <USkeleton class="h-4 w-2/3" />
        </div>
      </UCard>
    </div>

    <UCard
      v-else-if="errorMessage"
      class="brand-surface"
      :ui="{ body: 'p-8 space-y-4 text-center' }"
    >
      <UIcon name="i-lucide-alert-circle" class="mx-auto text-4xl text-warning" />
      <div class="space-y-2">
        <h3 class="text-lg font-semibold text-default">Could not load inventory</h3>
        <p class="mx-auto max-w-2xl text-sm text-muted">{{ errorMessage }}</p>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <UButton label="Retry" icon="i-lucide-refresh-cw" @click="emit('retry')" />
        <UButton
          v-if="hasActiveFilters"
          color="neutral"
          variant="soft"
          label="Clear filters"
          icon="i-lucide-rotate-ccw"
          @click="emit('clearFilters')"
        />
      </div>
    </UCard>

    <UCard v-else-if="!boats.length" class="brand-surface" :ui="{ body: 'p-8' }">
      <div class="space-y-4 text-center">
        <UIcon name="i-lucide-ship" class="mx-auto text-4xl text-dimmed" />
        <div class="space-y-2">
          <h3 class="text-lg font-semibold text-default">No listings in this view</h3>
          <p class="mx-auto max-w-2xl text-sm text-muted">{{ emptyMessage }}</p>
        </div>
        <div class="flex flex-wrap justify-center gap-2">
          <UButton
            v-if="hasActiveFilters"
            label="Clear all filters"
            icon="i-lucide-rotate-ccw"
            @click="emit('clearFilters')"
          />
          <UButton
            to="/browse"
            label="Open browse"
            icon="i-lucide-compass"
            color="neutral"
            variant="soft"
          />
        </div>
      </div>
    </UCard>

    <template v-else>
      <div class="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        <BoatListingCard v-for="boat in boats" :key="boat.id" :boat="boat" />
      </div>

      <div
        v-if="pageCount > 1"
        class="flex flex-col gap-3 rounded-[1.5rem] border border-default/80 bg-default/70 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="text-sm text-muted">Page {{ currentPage }} of {{ pageCount }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            label="Previous"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="soft"
            :disabled="!hasPreviousPage"
            @click="emit('changePage', currentPage - 1)"
          />
          <UButton
            v-for="page in visiblePages"
            :key="page"
            :label="String(page)"
            :color="page === currentPage ? 'primary' : 'neutral'"
            :variant="page === currentPage ? 'soft' : 'ghost'"
            @click="emit('changePage', page)"
          />
          <UButton
            label="Next"
            trailing-icon="i-lucide-arrow-right"
            color="neutral"
            variant="soft"
            :disabled="!hasNextPage"
            @click="emit('changePage', currentPage + 1)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

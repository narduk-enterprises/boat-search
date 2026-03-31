<script setup lang="ts">
import type {
  BoatInventoryActiveFilterChip,
  BoatInventoryBoat,
  BoatInventoryFilterKey,
  BoatInventorySort,
} from '~~/app/types/boat-inventory'
import BoatInventoryListItem from '~~/app/components/boats/BoatInventoryListItem.vue'
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

const searchQuery = defineModel<string>('searchQuery', { default: '' })

const emit = defineEmits<{
  clearFilters: []
  removeFilter: [key: BoatInventoryFilterKey]
  changePage: [page: number]
  retry: []
  submitSearch: []
}>()

function submitSearchFromField() {
  emit('submitSearch')
}

const visiblePages = computed(() => {
  const start = Math.max(1, props.currentPage - 2)
  const end = Math.min(props.pageCount, props.currentPage + 2)

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})
const currentSortLabel = computed(
  () =>
    BOAT_INVENTORY_SORT_OPTIONS.find((option) => option.value === props.currentSort)?.label ||
    'Newest listings',
)

const emptyMessage = computed(() =>
  props.hasActiveFilters
    ? 'Widen the budget or hull-size band, or clear one of the applied filters below.'
    : 'Inventory is still filling in. Check back after the next import run.',
)
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-3">
          <UBadge label="Live inventory" color="primary" variant="subtle" icon="i-lucide-waves" />
          <div class="space-y-2">
            <h1 class="text-3xl font-bold text-default sm:text-4xl">Boats for sale</h1>
            <p class="max-w-3xl text-sm text-muted sm:text-base">
              {{ resultsContext }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :label="resultsLabel"
            :color="boats.length ? 'primary' : 'neutral'"
            variant="soft"
          />
          <UBadge :label="currentSortLabel" color="neutral" variant="soft" />
          <UBadge v-if="status === 'pending'" label="Refreshing" color="warning" variant="soft" />
          <UBadge
            v-if="hasUnsavedChanges"
            label="Draft filters ready"
            color="warning"
            variant="soft"
          />
        </div>
      </div>

      <div class="flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:items-stretch">
        <UInput
          v-model="searchQuery"
          class="w-full min-w-0 sm:flex-1"
          placeholder="Search make, model, or keywords…"
          icon="i-lucide-search"
          aria-label="Search listings"
          @keydown.enter.prevent="submitSearchFromField"
        />
        <UButton
          label="Search"
          icon="i-lucide-search"
          class="shrink-0 sm:min-w-28"
          @click="submitSearchFromField"
        />
      </div>
      <p class="text-xs text-dimmed">Press Enter or Search to apply, together with any filters you set in the bar.</p>

      <div
        v-if="activeFilterChips.length || hasActiveFilters"
        class="brand-surface-soft rounded-[1.4rem] p-4"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :label="`${total.toLocaleString()} total match${total === 1 ? '' : 'es'}`"
                color="neutral"
                variant="soft"
              />
            </div>

            <div
              v-if="activeFilterChips.length"
              class="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
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

    <div v-if="status === 'pending' && !boats.length" class="space-y-4">
      <UCard
        v-for="index in 5"
        :key="index"
        class="brand-surface overflow-hidden"
        :ui="{ body: 'p-0' }"
      >
        <div class="grid gap-0 md:grid-cols-[16rem_minmax(0,1fr)]">
          <USkeleton class="aspect-[16/10] w-full md:h-full" />
          <div class="space-y-4 p-4 sm:p-5">
            <div class="flex flex-wrap gap-2">
              <USkeleton class="h-6 w-20 rounded-full" />
              <USkeleton class="h-6 w-24 rounded-full" />
              <USkeleton class="h-6 w-24 rounded-full" />
            </div>
            <USkeleton class="h-4 w-28" />
            <USkeleton class="h-7 w-3/4" />
            <USkeleton class="h-4 w-full" />
            <USkeleton class="h-4 w-11/12" />
            <div class="flex gap-2">
              <USkeleton class="h-10 w-28 rounded-full" />
              <USkeleton class="h-10 w-36 rounded-full" />
            </div>
          </div>
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
      <div class="space-y-4">
        <BoatInventoryListItem v-for="boat in boats" :key="boat.id" :boat="boat" />
      </div>

      <div
        v-if="pageCount > 1"
        class="brand-surface-soft flex flex-col gap-3 rounded-[1.5rem] p-4 sm:flex-row sm:items-center sm:justify-between"
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

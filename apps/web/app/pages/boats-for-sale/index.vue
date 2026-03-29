<script setup lang="ts">
import type { BoatInventoryFilterKey, BoatInventorySort } from '~~/app/types/boat-inventory'
import { BOAT_INVENTORY_SORT_OPTIONS } from '~~/app/types/boat-inventory'
import BoatInventoryBottomBar from '~~/app/components/boats/BoatInventoryBottomBar.vue'
import BoatInventoryFilters from '~~/app/components/boats/BoatInventoryFilters.vue'
import BoatInventoryResults from '~~/app/components/boats/BoatInventoryResults.vue'
import { BOAT_INVENTORY_RESULTS_HASH, BOAT_INVENTORY_RESULTS_ID } from '~~/app/utils/boatBrowse'

definePageMeta({ layout: 'wide' })

useSeo({
  title: 'Boats for Sale | Search Inventory by Make, Price, Length, and Location',
  description:
    'Search live aggregated boat listings by make, price, length, and location, then open the original source listing when a match is worth deeper review.',
  ogImage: {
    title: 'Boats for Sale',
    description: 'Public inventory search with structured filters and source attribution.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Boats for Sale',
  description: 'Public inventory search for aggregated boat listings.',
})

const route = useRoute()

const {
  boats,
  status,
  error,
  draftFilters,
  currentSort,
  currentPage,
  total,
  pageCount,
  hasNextPage,
  hasPreviousPage,
  hasActiveFilters,
  hasUnsavedChanges,
  activeFilterChips,
  resultsLabel,
  resultsContext,
  applyFilters,
  clearFilters,
  removeFilter,
  setSort,
  goToPage,
  retry,
} = useBoatInventorySearch({ limit: 24 })

const filtersOpen = shallowRef(false)
const sortOpen = shallowRef(false)
const resultsSection = useTemplateRef<HTMLDivElement>('resultsSection')

const errorMessage = computed(() => {
  const fetchError = error.value as { data?: { statusMessage?: string }; message?: string } | null
  return fetchError?.data?.statusMessage || fetchError?.message || null
})

function scrollResultsIntoView() {
  if (!import.meta.client) return

  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  resultsSection.value?.scrollIntoView({ behavior, block: 'start' })
}

async function handleApplyFilters() {
  await applyFilters()
  filtersOpen.value = false
  await nextTick()
  scrollResultsIntoView()
}

async function handleClearFilters() {
  await clearFilters()
  filtersOpen.value = false
  await nextTick()
  scrollResultsIntoView()
}

async function handleRemoveFilter(key: BoatInventoryFilterKey) {
  await removeFilter(key)
  await nextTick()
  scrollResultsIntoView()
}

async function handleSortChange(value: BoatInventorySort) {
  await setSort(value)
  sortOpen.value = false
  await nextTick()
  scrollResultsIntoView()
}

async function handlePageChange(page: number) {
  if (page < 1 || page > pageCount.value || page === currentPage.value) return

  await goToPage(page)
  await nextTick()
  scrollResultsIntoView()
}

async function handleRetry() {
  await retry()
}

watch(
  () => route.fullPath,
  async () => {
    if (!import.meta.client || route.hash !== BOAT_INVENTORY_RESULTS_HASH) return

    await nextTick()
    requestAnimationFrame(() => {
      scrollResultsIntoView()
    })
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <UPage>
    <UPageSection :ui="{ wrapper: 'py-6 pb-28 sm:py-8 sm:pb-32' }">
      <div
        :id="BOAT_INVENTORY_RESULTS_ID"
        ref="resultsSection"
        class="mx-auto max-w-6xl scroll-mt-24"
      >
        <BoatInventoryResults
          :boats="boats"
          :status="status"
          :error-message="errorMessage"
          :has-active-filters="hasActiveFilters"
          :has-unsaved-changes="hasUnsavedChanges"
          :active-filter-chips="activeFilterChips"
          :results-label="resultsLabel"
          :results-context="resultsContext"
          :total="total"
          :current-page="currentPage"
          :page-count="pageCount"
          :current-sort="currentSort"
          :has-next-page="hasNextPage"
          :has-previous-page="hasPreviousPage"
          @clear-filters="handleClearFilters"
          @remove-filter="handleRemoveFilter"
          @change-page="handlePageChange"
          @retry="handleRetry"
        />
      </div>
    </UPageSection>

    <BoatInventoryBottomBar
      :current-sort="currentSort"
      :active-filter-count="activeFilterChips.length"
      :has-unsaved-changes="hasUnsavedChanges"
      :results-label="resultsLabel"
      @open-sort="sortOpen = true"
      @open-filters="filtersOpen = true"
    />

    <USlideover
      v-model:open="filtersOpen"
      title="Filter boats"
      description="Adjust the draft filters, then apply them when the list looks right."
      side="right"
    >
      <template #body>
        <BoatInventoryFilters
          v-model="draftFilters"
          :loading="status === 'pending'"
          :has-active-filters="hasActiveFilters"
          :has-unsaved-changes="hasUnsavedChanges"
          @submit="handleApplyFilters"
          @clear="handleClearFilters"
        />
      </template>
    </USlideover>

    <UModal v-model:open="sortOpen">
      <template #header>
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Sort</p>
          <h2 class="text-lg font-semibold text-default">Choose list order</h2>
          <p class="text-sm text-muted">Default sort is newest listings first.</p>
        </div>
      </template>

      <div class="space-y-2">
        <UButton
          v-for="option in BOAT_INVENTORY_SORT_OPTIONS"
          :key="option.value"
          :label="option.label"
          class="w-full justify-between"
          :color="currentSort === option.value ? 'primary' : 'neutral'"
          :variant="currentSort === option.value ? 'soft' : 'ghost'"
          :trailing-icon="currentSort === option.value ? 'i-lucide-check' : undefined"
          @click="handleSortChange(option.value)"
        />
      </div>

      <template #footer>
        <div class="flex w-full justify-end">
          <UButton color="neutral" variant="soft" label="Close" @click="sortOpen = false" />
        </div>
      </template>
    </UModal>
  </UPage>
</template>

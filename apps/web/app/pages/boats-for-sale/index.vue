<script setup lang="ts">
import type { BoatInventoryFilterKey, BoatInventorySort } from '~~/app/types/boat-inventory'
import BoatInventoryFilters from '~~/app/components/boats/BoatInventoryFilters.vue'
import BoatInventoryResults from '~~/app/components/boats/BoatInventoryResults.vue'
import BoatInventorySearchHero from '~~/app/components/boats/BoatInventorySearchHero.vue'
import {
  BOAT_INVENTORY_RESULTS_HASH,
  BOAT_INVENTORY_RESULTS_ID,
  inventoryBudgetLinks,
  inventoryLocationLinks,
  makeInventorySearchLink,
} from '~~/app/utils/boatBrowse'

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

const { fetchBoatStats } = useBoats()
const { data: stats } = fetchBoatStats()
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
} = useBoatInventorySearch({ limit: 48 })

const mobileFiltersOpen = shallowRef(false)
const resultsSection = useTemplateRef<HTMLDivElement>('resultsSection')

const topMakeLinks = computed(() =>
  (stats.value?.topMakes ?? [])
    .filter((entry) => entry.make)
    .slice(0, 6)
    .map((entry) => makeInventorySearchLink(entry.make)),
)

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
  mobileFiltersOpen.value = false
  await nextTick()
  scrollResultsIntoView()
}

async function handleClearFilters() {
  await clearFilters()
  mobileFiltersOpen.value = false
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
    <UPageSection>
      <div class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
        <BoatInventorySearchHero
          :stats="stats"
          :budget-links="inventoryBudgetLinks"
          :top-make-links="topMakeLinks"
          :location-links="inventoryLocationLinks"
        />

        <div class="hidden xl:block xl:sticky xl:top-24">
          <BoatInventoryFilters
            v-model="draftFilters"
            :loading="status === 'pending'"
            :has-active-filters="hasActiveFilters"
            :has-unsaved-changes="hasUnsavedChanges"
            @submit="handleApplyFilters"
            @clear="handleClearFilters"
          />
        </div>
      </div>
    </UPageSection>

    <UPageSection :ui="{ wrapper: 'py-0 sm:py-0' }">
      <div :id="BOAT_INVENTORY_RESULTS_ID" ref="resultsSection" class="scroll-mt-24">
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
          @open-filters="mobileFiltersOpen = true"
          @clear-filters="handleClearFilters"
          @remove-filter="handleRemoveFilter"
          @change-sort="handleSortChange"
          @change-page="handlePageChange"
          @retry="handleRetry"
        />
      </div>
    </UPageSection>

    <USlideover
      v-model:open="mobileFiltersOpen"
      title="Refine inventory"
      description="Adjust the draft view, then apply it when the market slice looks right."
      side="right"
      class="xl:hidden"
    >
      <template #body>
        <BoatInventoryFilters
          v-model="draftFilters"
          mode="overlay"
          :loading="status === 'pending'"
          :has-active-filters="hasActiveFilters"
          :has-unsaved-changes="hasUnsavedChanges"
          @submit="handleApplyFilters"
          @clear="handleClearFilters"
        />
      </template>
    </USlideover>
  </UPage>
</template>

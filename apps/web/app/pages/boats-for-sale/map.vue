<script setup lang="ts">
import type { BoatInventoryFilterKey, BoatInventorySort } from '~~/app/types/boat-inventory'
import { BOAT_INVENTORY_SORT_OPTIONS } from '~~/app/types/boat-inventory'
import BoatInventoryBottomBar from '~~/app/components/boats/BoatInventoryBottomBar.vue'
import BoatInventoryFilters from '~~/app/components/boats/BoatInventoryFilters.vue'
import BoatInventoryMapView from '~~/app/components/boats/BoatInventoryMapView.vue'
import { BOAT_INVENTORY_RESULTS_HASH, BOAT_INVENTORY_RESULTS_ID } from '~~/app/utils/boatBrowse'

definePageMeta({ layout: 'wide' })

useSeo({
  title: 'Boats for Sale Map | Explore Inventory by Verified Boat Location',
  description:
    'View live boat listings on a map, filter by make, budget, length, and region, and open the strongest matches directly from the sidebar.',
  ogImage: {
    title: 'Boat inventory map',
    description: 'Map-first boat inventory search with a live sidebar.',
    icon: '🗺️',
  },
})
useWebPageSchema({
  name: 'Boats for Sale Map',
  description: 'Map-first public inventory search for aggregated boat listings.',
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
  applyFilters,
  clearFilters,
  removeFilter,
  setSort,
  goToPage,
} = useBoatInventorySearch({ limit: 100, geoMode: 'matched' })

const filtersOpen = shallowRef(false)
const sortOpen = shallowRef(false)
const resultsSection = useTemplateRef<HTMLDivElement>('resultsSection')

const listViewTo = computed(() => ({
  path: '/boats-for-sale',
  query: route.query,
  hash: BOAT_INVENTORY_RESULTS_HASH,
}))

const errorMessage = computed(() => {
  const fetchError = error.value as { data?: { statusMessage?: string }; message?: string } | null
  return fetchError?.data?.statusMessage || fetchError?.message || null
})

const mapResultsLabel = computed(() => {
  if (!total.value && hasActiveFilters.value) return 'No map-ready boats match the current filters'
  if (!total.value) return 'No map-ready boats available yet'

  return resultsLabel.value.endsWith(' boats')
    ? `${resultsLabel.value.slice(0, -' boats'.length)} map-ready boats`
    : resultsLabel.value
})

const mapResultsContext = computed(() => {
  if (!total.value && hasActiveFilters.value) {
    return 'Widen the location, price, or length filters, or switch back to list view to inspect boats without verified coordinates.'
  }

  if (!total.value) {
    return 'This inventory slice does not have verified coordinates yet. Return after the next geo backfill or use list view for the raw listings.'
  }

  return 'Map-ready inventory only. Use the floating bar to sort or filter the map at any time.'
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
    <UPageSection :ui="{ container: 'py-6 pb-28 sm:py-8 sm:pb-32' }">
      <div class="mx-auto flex max-w-6xl items-center justify-center pb-4">
        <div
          class="inline-flex rounded-full border border-default bg-default/80 p-1 shadow-card backdrop-blur-sm"
        >
          <UButton
            :to="listViewTo"
            color="neutral"
            variant="ghost"
            icon="i-lucide-list"
            label="List"
            class="rounded-full"
          />
          <UButton
            color="primary"
            variant="solid"
            icon="i-lucide-map"
            label="Map"
            class="rounded-full"
          />
        </div>
      </div>

      <div
        :id="BOAT_INVENTORY_RESULTS_ID"
        ref="resultsSection"
        class="mx-auto max-w-6xl scroll-mt-24"
      >
        <BoatInventoryMapView
          :boats="boats"
          :status="status"
          :error-message="errorMessage"
          :has-active-filters="hasActiveFilters"
          :active-filter-chips="activeFilterChips"
          :results-label="mapResultsLabel"
          :results-context="mapResultsContext"
          :total="total"
          :current-page="currentPage"
          :page-count="pageCount"
          :has-next-page="hasNextPage"
          :has-previous-page="hasPreviousPage"
          @clear-filters="handleClearFilters"
          @remove-filter="handleRemoveFilter"
          @change-page="handlePageChange"
        />
      </div>
    </UPageSection>

    <BoatInventoryBottomBar
      :current-sort="currentSort"
      :active-filter-count="activeFilterChips.length"
      :has-unsaved-changes="hasUnsavedChanges"
      :results-label="mapResultsLabel"
      alternate-view-label="List"
      :alternate-view-to="listViewTo"
      alternate-view-icon="i-lucide-list"
      @open-sort="sortOpen = true"
      @open-filters="filtersOpen = true"
    />

    <USlideover
      v-model:open="filtersOpen"
      title="Filter map results"
      description="Adjust the draft filters, then apply them when the map looks right."
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
          <h2 class="text-lg font-semibold text-default">Choose sidebar order</h2>
          <p class="text-sm text-muted">Default sort is newest listings first.</p>
        </div>
      </template>

      <template #body>
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
      </template>

      <template #footer>
        <div class="flex w-full justify-end">
          <UButton color="neutral" variant="soft" label="Close" @click="sortOpen = false" />
        </div>
      </template>
    </UModal>
  </UPage>
</template>

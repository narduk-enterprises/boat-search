<script setup lang="ts">
import type { BoatInventoryFilterKey, BoatInventorySort } from '~~/app/types/boat-inventory'
import { BOAT_INVENTORY_SORT_OPTIONS } from '~~/app/types/boat-inventory'
import BoatInventoryActionHeader from '~~/app/components/boats/BoatInventoryActionHeader.vue'
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
  navigationQuery,
  currentSort,
  currentPage,
  total,
  pageCount,
  hasNextPage,
  hasPreviousPage,
  hasActiveFilters,
  activeFilterChips,
  resultsLabel,
  applyDraftFilters,
  queueDraftApply,
  clearFilters,
  removeFilter,
  setSort,
  goToPage,
} = useBoatInventorySearch({ limit: 100, geoMode: 'matched' })
const { fetchBoatStats } = useBoats()
const { data: stats } = fetchBoatStats()
const suggestedMakes = computed(() =>
  (stats.value?.topMakes ?? [])
    .map((entry) => entry.make?.trim() || '')
    .filter(Boolean)
    .slice(0, 8),
)

const filtersOpen = shallowRef(false)
const sortOpen = shallowRef(false)
const resultsSection = useTemplateRef<HTMLDivElement>('resultsSection')

const listViewTo = computed(() => ({
  path: '/boats-for-sale',
  query: navigationQuery.value,
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

function scrollResultsIntoView() {
  if (!import.meta.client) return

  const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  resultsSection.value?.scrollIntoView({ behavior, block: 'start' })
}

async function handleFilterAutoApply(mode: 'immediate' | 'debounced') {
  if (mode === 'immediate') {
    await applyDraftFilters()
    return
  }

  queueDraftApply()
}

async function handleClearFilters() {
  await clearFilters()
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
    <UPageSection :ui="{ container: 'py-0 sm:py-6' }">
      <div
        :id="BOAT_INVENTORY_RESULTS_ID"
        ref="resultsSection"
        class="mx-auto max-w-6xl"
        style="scroll-margin-top: calc(var(--brand-header-height, 5.25rem) + 5rem)"
      >
        <BoatInventoryActionHeader
          :results-label="mapResultsLabel"
          :active-filter-count="activeFilterChips.length"
          :active-filter-chips="activeFilterChips"
          :has-active-filters="hasActiveFilters"
          alternate-view-label="List"
          :alternate-view-to="listViewTo"
          alternate-view-icon="i-lucide-list"
          @open-sort="sortOpen = true"
          @open-filters="filtersOpen = true"
          @clear-filters="handleClearFilters"
          @remove-filter="handleRemoveFilter"
        />

        <BoatInventoryMapView
          :boats="boats"
          :status="status"
          :error-message="errorMessage"
          :total="total"
          :current-page="currentPage"
          :page-count="pageCount"
          :has-next-page="hasNextPage"
          :has-previous-page="hasPreviousPage"
          @clear-filters="handleClearFilters"
          @change-page="handlePageChange"
        />
      </div>
    </UPageSection>

    <USlideover v-model:open="filtersOpen" side="right" class="sm:max-w-2xl">
      <template #body>
        <BoatInventoryFilters
          v-model="draftFilters"
          :has-active-filters="hasActiveFilters"
          :suggested-makes="suggestedMakes"
          @request-auto-apply="handleFilterAutoApply"
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

<script setup lang="ts">
import BoatInventoryFilters from '~~/app/components/boats/BoatInventoryFilters.vue'
import BoatInventoryResults from '~~/app/components/boats/BoatInventoryResults.vue'
import BoatInventorySearchHero from '~~/app/components/boats/BoatInventorySearchHero.vue'
import {
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

const {
  boats,
  status,
  error,
  filters,
  applyFilters,
  clearFilters,
  hasActiveFilters,
  activeFilterTags,
  resultsLabel,
} = useBoatInventorySearch({ limit: 48 })

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

        <div class="xl:sticky xl:top-24">
          <BoatInventoryFilters
            v-model="filters"
            :loading="status === 'pending'"
            :has-active-filters="hasActiveFilters"
            @submit="applyFilters"
            @clear="clearFilters"
          />
        </div>
      </div>
    </UPageSection>

    <UPageSection :ui="{ wrapper: 'py-0 sm:py-0' }">
      <BoatInventoryResults
        :boats="boats"
        :status="status"
        :error-message="errorMessage"
        :has-active-filters="hasActiveFilters"
        :active-filter-tags="activeFilterTags"
        :results-label="resultsLabel"
      />
    </UPageSection>
  </UPage>
</template>

<script setup lang="ts">
import {
  BOAT_INVENTORY_SEARCH_PATH,
  inventoryBudgetLinks,
  inventoryLocationLinks,
  inventoryTypeLinks,
  inventoryUseCaseLinks,
  makeInventorySearchLink,
} from '~~/app/utils/boatBrowse'

definePageMeta({ layout: 'wide' })

useSeo({
  title: 'Browse Boats | Explore Inventory Paths by Brand, Budget, and Region',
  description:
    'Browse boat inventory paths by budget, brand, location, and use case before dropping into the full public search experience.',
  ogImage: {
    title: 'Browse boats',
    description: 'Browse hub into structured public inventory search.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Browse boats',
  description: 'Browse hub for boat inventory paths by budget, brand, location, and use case.',
})

const { fetchBoatStats } = useBoats()
const { data: stats } = fetchBoatStats()

const popularMakes = computed(() =>
  (stats.value?.topMakes ?? [])
    .filter((entry) => entry.make)
    .slice(0, 8)
    .map((entry) => makeInventorySearchLink(entry.make)),
)

const summaryCards = computed(() => [
  {
    label: 'Listings',
    value: stats.value?.total ? stats.value.total.toLocaleString() : 'Live',
    detail: 'Normalized inventory pulled from public listing sources.',
  },
  {
    label: 'Brands',
    value: stats.value?.uniqueMakes ? stats.value.uniqueMakes.toLocaleString() : 'Growing',
    detail: 'Distinct makes available to browse today.',
  },
  {
    label: 'Price floor',
    value: stats.value?.minPrice != null ? `$${stats.value.minPrice.toLocaleString()}` : 'Varies',
    detail: 'Budget bands below jump straight into real search filters.',
  },
])

const discoverySteps = [
  {
    label: '1. Start with a lane',
    detail: 'Pick budget, region, or boat class before you start comparing listings one by one.',
  },
  {
    label: '2. Read the market shape',
    detail: 'Use popular makes and use-case collections to understand where inventory is deepest.',
  },
  {
    label: '3. Drop into live search',
    detail: 'Carry that lane straight into the inventory workspace with filters already in place.',
  },
]
</script>

<template>
  <UPage class="space-y-2">
    <UPageSection>
      <div class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
        <UCard
          class="brand-surface brand-grid-panel brand-orbit"
          :ui="{ body: 'relative p-6 sm:p-8 space-y-6' }"
        >
          <div class="space-y-4">
            <div class="flex flex-wrap gap-2">
              <UBadge
                label="Browse-first discovery"
                color="primary"
                variant="subtle"
                icon="i-lucide-compass"
              />
              <UBadge label="Market map" color="neutral" variant="soft" />
            </div>
            <div class="space-y-3">
              <h1 class="max-w-4xl text-4xl font-bold text-highlighted sm:text-5xl">
                Start broad, then step into a search lane that actually fits your buying brief.
              </h1>
              <p class="max-w-3xl text-base text-muted sm:text-lg">
                Browse budgets, regions, hull types, and popular makes first. When a path feels
                right, open the live inventory workspace with the relevant filters already in place.
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <UButton
              :to="BOAT_INVENTORY_SEARCH_PATH"
              label="Open live inventory"
              icon="i-lucide-search"
              class="brand-button-shadow"
            />
            <UButton
              to="/ai-boat-finder"
              label="Use the buyer brief"
              color="neutral"
              variant="soft"
              icon="i-lucide-sparkles"
            />
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <div
              v-for="step in discoverySteps"
              :key="step.label"
              class="brand-surface-soft rounded-[1.25rem] p-4"
            >
              <p class="text-sm font-semibold text-highlighted">{{ step.label }}</p>
              <p class="mt-2 text-sm text-muted">{{ step.detail }}</p>
            </div>
          </div>
        </UCard>

        <div class="grid gap-3">
          <UCard
            v-for="card in summaryCards"
            :key="card.label"
            class="brand-surface"
            :ui="{ body: 'p-5 space-y-1.5' }"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
              {{ card.label }}
            </p>
            <p class="text-3xl font-semibold text-highlighted">{{ card.value }}</p>
            <p class="text-sm text-muted">{{ card.detail }}</p>
          </UCard>
        </div>
      </div>
    </UPageSection>

    <UPageSection :ui="{ wrapper: 'py-0' }">
      <div class="grid gap-6 xl:grid-cols-[1fr_0.92fr]">
        <UCard class="brand-surface" :ui="{ body: 'p-6 space-y-4' }">
          <div class="space-y-2">
            <h2 class="text-2xl font-semibold text-highlighted">Browse by budget</h2>
            <p class="max-w-3xl text-sm text-muted">
              Use common price bands to cut down the catalog before you refine by make, region, or
              ownership style.
            </p>
          </div>
          <div class="grid gap-4 md:grid-cols-2">
            <UCard
              v-for="link in inventoryBudgetLinks"
              :key="link.label"
              class="brand-surface-soft rounded-[1.25rem]"
              :ui="{ body: 'p-5 space-y-4' }"
            >
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <UIcon :name="link.icon || 'i-lucide-search'" class="text-primary" />
                  <h3 class="text-lg font-semibold text-default">{{ link.label }}</h3>
                </div>
                <p class="text-sm text-muted">{{ link.description }}</p>
              </div>
              <UButton :to="link.to" label="Open search" icon="i-lucide-arrow-right" />
            </UCard>
          </div>
        </UCard>

        <UCard class="brand-surface" :ui="{ body: 'p-6 space-y-4' }">
          <div class="space-y-2">
            <h2 class="text-2xl font-semibold text-highlighted">Popular makes</h2>
            <p class="max-w-3xl text-sm text-muted">
              These brands currently show the deepest live inventory in the catalog and make a good
              starting point for quick market reads.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="link in popularMakes"
              :key="link.label"
              :to="link.to"
              :label="link.label"
              :icon="link.icon"
              color="neutral"
              variant="soft"
            />
          </div>
          <div class="brand-surface-soft rounded-[1.25rem] p-4 text-sm text-muted">
            Use a popular-make lane when you want to compare condition, price spread, and brokerage
            density before contacting sellers.
          </div>
        </UCard>
      </div>
    </UPageSection>

    <UPageSection :ui="{ wrapper: 'py-6' }">
      <div class="grid gap-6 xl:grid-cols-2">
        <UCard class="brand-surface" :ui="{ body: 'p-6 space-y-4' }">
          <div class="space-y-2">
            <h2 class="text-2xl font-semibold text-highlighted">Browse by location</h2>
            <p class="text-sm text-muted">
              Start in the regions where inventory density, transport, or delivery logistics matter
              most to your search.
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <UCard
              v-for="link in inventoryLocationLinks"
              :key="link.label"
              class="brand-surface-soft rounded-[1.25rem]"
              :ui="{ body: 'p-4 space-y-3' }"
            >
              <div class="space-y-1.5">
                <div class="flex items-center gap-2">
                  <UIcon :name="link.icon || 'i-lucide-map-pinned'" class="text-primary" />
                  <h3 class="font-semibold text-default">{{ link.label }}</h3>
                </div>
                <p class="text-sm text-muted">{{ link.description }}</p>
              </div>
              <UButton :to="link.to" label="View region" color="neutral" variant="soft" />
            </UCard>
          </div>
        </UCard>

        <UCard class="brand-surface" :ui="{ body: 'p-6 space-y-4' }">
          <div class="space-y-2">
            <h2 class="text-2xl font-semibold text-highlighted">Browse by use case</h2>
            <p class="text-sm text-muted">
              Use-case guides help when you know the mission but not the exact hull or brand yet.
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <UCard
              v-for="link in inventoryUseCaseLinks"
              :key="link.label"
              class="brand-surface-soft rounded-[1.25rem]"
              :ui="{ body: 'p-4 space-y-3' }"
            >
              <div class="space-y-1.5">
                <div class="flex items-center gap-2">
                  <UIcon :name="link.icon || 'i-lucide-compass'" class="text-primary" />
                  <h3 class="font-semibold text-default">{{ link.label }}</h3>
                </div>
                <p class="text-sm text-muted">{{ link.description }}</p>
              </div>
              <UButton :to="link.to" label="Open guide" color="neutral" variant="soft" />
            </UCard>
          </div>
        </UCard>
      </div>
    </UPageSection>

    <UPageSection :ui="{ wrapper: 'py-0' }">
      <UCard class="brand-surface" :ui="{ body: 'p-6 space-y-4' }">
        <div class="space-y-2">
          <h2 class="text-2xl font-semibold text-highlighted">Boat classes</h2>
          <p class="max-w-3xl text-sm text-muted">
            These class-based browse lanes get stronger as the catalog’s hull taxonomy improves and
            fresh imports land.
          </p>
        </div>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <UCard
            v-for="link in inventoryTypeLinks"
            :key="link.label"
            class="brand-surface-soft rounded-[1.25rem]"
            :ui="{ body: 'p-5 space-y-4' }"
          >
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <UIcon :name="link.icon || 'i-lucide-ship-wheel'" class="text-primary" />
                <h3 class="text-lg font-semibold text-default">{{ link.label }}</h3>
              </div>
              <p class="text-sm text-muted">{{ link.description }}</p>
            </div>
            <UButton :to="link.to" label="Explore type" color="neutral" variant="soft" />
          </UCard>
        </div>
      </UCard>
    </UPageSection>
  </UPage>
</template>

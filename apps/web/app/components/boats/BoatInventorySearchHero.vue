<script setup lang="ts">
import type { BoatBrowseLink, BoatInventoryStats } from '~~/app/types/boat-inventory'

const props = defineProps<{
  stats?: BoatInventoryStats | null
  budgetLinks: BoatBrowseLink[]
  topMakeLinks: BoatBrowseLink[]
  locationLinks: BoatBrowseLink[]
}>()

const { formatPrice } = useBoatListingDisplay()

const statCards = computed(() => [
  {
    label: 'Listings',
    value: props.stats?.total ? props.stats.total.toLocaleString() : 'Live',
    detail: 'Aggregated listings from public inventory sources.',
  },
  {
    label: 'Makes',
    value: props.stats?.uniqueMakes ? props.stats.uniqueMakes.toLocaleString() : 'Growing',
    detail: 'Distinct brands currently represented in the normalized catalog.',
  },
  {
    label: 'Price band',
    value:
      props.stats?.minPrice != null && props.stats?.maxPrice != null
        ? `${formatPrice(props.stats.minPrice)} to ${formatPrice(props.stats.maxPrice)}`
        : 'Wide market spread',
    detail: 'Use price filters to cut straight to your realistic budget window.',
  },
  {
    label: 'Model years',
    value:
      props.stats?.minYear != null && props.stats?.maxYear != null
        ? `${props.stats.minYear} to ${props.stats.maxYear}`
        : 'Mixed-year inventory',
    detail: 'Used inventory spans project boats through newer late-model listings.',
  },
])
</script>

<template>
  <div class="space-y-5">
    <UCard class="card-base border-default" :ui="{ body: 'p-6 space-y-5' }">
      <div class="space-y-3">
        <UBadge
          label="Public inventory search"
          color="primary"
          variant="subtle"
          icon="i-lucide-search"
        />
        <div class="space-y-2">
          <h1 class="max-w-4xl text-4xl font-bold text-default sm:text-5xl">
            Search live boat listings without dropping into the AI workflow first.
          </h1>
          <p class="max-w-3xl text-base text-muted sm:text-lg">
            Filter by make, location, price, and length, then open the original source listing when
            you find something worth a closer look.
          </p>
        </div>
        <div class="flex flex-wrap gap-3">
          <UButton to="/browse" label="Browse collections" icon="i-lucide-compass" />
          <UButton
            to="/ai-boat-finder"
            label="Try the AI finder"
            color="neutral"
            variant="soft"
            icon="i-lucide-sparkles"
          />
        </div>
      </div>

      <div class="grid gap-3 lg:grid-cols-2">
        <div v-for="card in statCards" :key="card.label" class="rounded-2xl bg-muted px-4 py-4">
          <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">{{ card.label }}</p>
          <p class="mt-2 text-2xl font-semibold text-default">{{ card.value }}</p>
          <p class="mt-1 text-sm text-muted">{{ card.detail }}</p>
        </div>
      </div>
    </UCard>

    <UCard class="card-base border-default" :ui="{ body: 'p-6 space-y-5' }">
      <div class="space-y-4">
        <div class="space-y-2">
          <h2 class="text-lg font-semibold text-default">Quick starts</h2>
          <p class="text-sm text-muted">
            Jump into common budgets, brands, and regions if you do not want to build filters from
            scratch.
          </p>
        </div>

        <div class="space-y-3">
          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">Budgets</p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="link in budgetLinks"
                :key="link.label"
                :to="link.to"
                :label="link.label"
                :icon="link.icon"
                color="neutral"
                variant="soft"
                size="sm"
              />
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">Popular makes</p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="link in topMakeLinks"
                :key="link.label"
                :to="link.to"
                :label="link.label"
                :icon="link.icon"
                color="neutral"
                variant="soft"
                size="sm"
              />
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">Locations</p>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="link in locationLinks"
                :key="link.label"
                :to="link.to"
                :label="link.label"
                :icon="link.icon"
                color="neutral"
                variant="soft"
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

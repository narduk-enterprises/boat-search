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
    <UCard class="brand-surface brand-grid-panel brand-orbit" :ui="{ body: 'relative p-6 sm:p-8' }">
      <div class="grid gap-8 xl:grid-cols-[1.14fr_0.86fr] xl:items-start">
        <div class="space-y-6">
          <div class="space-y-4">
            <div class="flex flex-wrap gap-2">
              <UBadge
                label="Live marketplace intelligence"
                color="primary"
                variant="subtle"
                icon="i-lucide-search"
              />
              <UBadge
                :label="
                  props.stats?.total
                    ? `${props.stats.total.toLocaleString()} tracked listings`
                    : 'Daily imports'
                "
                color="neutral"
                variant="soft"
              />
            </div>

            <div class="space-y-3">
              <h1 class="max-w-4xl text-4xl font-bold text-highlighted sm:text-5xl">
                Search the used-boat market like a buyer, not a tab collector.
              </h1>
              <p class="max-w-3xl text-base text-muted sm:text-lg">
                Aggregate public listings, narrow the field by budget, hull size, and geography,
                then open the original marketplace page only when a boat is worth deeper review.
              </p>
            </div>
          </div>

          <div class="flex flex-wrap gap-3">
            <UButton
              to="/browse"
              label="Browse market paths"
              icon="i-lucide-compass"
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

          <div class="grid gap-3 sm:grid-cols-2">
            <div
              v-for="card in statCards"
              :key="card.label"
              class="brand-surface-soft rounded-[1.25rem] p-4"
            >
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                {{ card.label }}
              </p>
              <p class="mt-2 text-2xl font-semibold text-highlighted">{{ card.value }}</p>
              <p class="mt-1 text-sm text-muted">{{ card.detail }}</p>
            </div>
          </div>
        </div>

        <div class="brand-surface-soft space-y-5 rounded-[1.35rem] p-5 sm:p-6">
          <div class="space-y-2">
            <h2 class="text-lg font-semibold text-highlighted">Fast entry points</h2>
            <p class="text-sm text-muted">
              Open a proven lane first, then keep refining in the filter panel beside the results.
            </p>
          </div>

          <div class="space-y-4">
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Budgets</p>
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
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                Popular makes
              </p>
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
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                Coastal regions
              </p>
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

          <div
            class="rounded-3xl border border-default/70 bg-default/80 px-4 py-3 text-sm text-muted"
          >
            Every filter updates the URL, so this market slice is easy to save, share, or come back
            to after a broker call.
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

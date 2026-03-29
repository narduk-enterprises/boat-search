<script setup lang="ts">
import type { BoatInventoryBoat } from '~~/app/types/boat-inventory'

const props = defineProps<{
  boats: BoatInventoryBoat[]
  status: 'idle' | 'pending' | 'success' | 'error'
  errorMessage?: string | null
  hasActiveFilters: boolean
  activeFilterTags: string[]
  resultsLabel: string
}>()

const emptyMessage = computed(() =>
  props.hasActiveFilters
    ? 'Try widening the price or length range, or clear the make and location filters.'
    : 'Inventory is still filling in. Check back after the next import run.',
)
</script>

<template>
  <div class="space-y-4">
    <div
      class="flex flex-col gap-3 rounded-2xl bg-muted px-5 py-4 lg:flex-row lg:items-start lg:justify-between"
    >
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-xl font-semibold text-default">Inventory results</h2>
          <UBadge
            :label="resultsLabel"
            :color="boats.length ? 'primary' : 'neutral'"
            variant="subtle"
          />
        </div>
        <p class="text-sm text-muted">
          Listings stay attributed to their original sources, so you can compare quickly and click
          through when a boat looks real.
        </p>
      </div>

      <div v-if="activeFilterTags.length" class="flex flex-wrap gap-2">
        <UBadge
          v-for="tag in activeFilterTags"
          :key="tag"
          :label="tag"
          color="neutral"
          variant="soft"
        />
      </div>
    </div>

    <div v-if="status === 'pending'" class="flex items-center justify-center py-24">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
    </div>

    <UCard
      v-else-if="errorMessage"
      class="card-base border-default"
      :ui="{ body: 'p-8 space-y-3 text-center' }"
    >
      <UIcon name="i-lucide-alert-circle" class="mx-auto text-4xl text-warning" />
      <h3 class="text-lg font-semibold text-default">Could not load inventory</h3>
      <p class="text-sm text-muted">{{ errorMessage }}</p>
    </UCard>

    <UCard
      v-else-if="!boats.length"
      class="card-base border-default"
      :ui="{ body: 'p-8 space-y-3 text-center' }"
    >
      <UIcon name="i-lucide-ship" class="mx-auto text-4xl text-dimmed" />
      <h3 class="text-lg font-semibold text-default">No listings in this view</h3>
      <p class="mx-auto max-w-2xl text-sm text-muted">{{ emptyMessage }}</p>
      <div class="flex flex-wrap justify-center gap-2">
        <UButton to="/browse" label="Open browse" icon="i-lucide-compass" />
        <UButton
          to="/ai-boat-finder"
          label="Try AI finder"
          color="neutral"
          variant="soft"
          icon="i-lucide-sparkles"
        />
      </div>
    </UCard>

    <div v-else class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      <BoatListingCard v-for="boat in boats" :key="boat.id" :boat="boat" />
    </div>
  </div>
</template>

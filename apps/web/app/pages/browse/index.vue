<script setup lang="ts">
useSeo({
  title: 'Browse Boats',
  description: 'Browse by type, brand, budget, location, and use case.',
  ogImage: {
    title: 'Browse boats',
    description: 'Structured browse paths into search.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Browse boats',
  description: 'Hub links for boat types, brands, budgets, and use cases.',
})
const types = [
  ['Center console', 'center-console'],
  ['Pontoon', 'pontoon'],
  ['Bowrider', 'bowrider'],
  ['Cabin cruiser', 'cabin-cruiser'],
  ['Sailboat', 'sailboat'],
  ['Trawler', 'trawler'],
  ['Catamaran', 'catamaran'],
]
const budgets = [
  ['Under $25k', 'under-25k'],
  ['Under $50k', 'under-50k'],
  ['Under $100k', 'under-100k'],
  ['Under $250k', 'under-250k'],
]
const uses = [
  ['Family weekends', 'family-weekends'],
  ['Offshore fishing', 'offshore-fishing'],
  ['Lake days', 'lake-days'],
  ['Liveaboard', 'liveaboard'],
]
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">Browse</h1>
      <p class="mt-2 text-muted max-w-2xl">
        Jump into filtered search. Inventory facets will tighten as data models expand.
      </p>
    </UPageSection>
    <UPageSection :ui="{ wrapper: 'py-4' }">
      <h2 class="text-lg font-semibold text-default mb-3">By type</h2>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="[label, slug] in types"
          :key="slug"
          :to="`/boats-for-sale/type/${slug}`"
          :label="label"
          color="neutral"
          variant="soft"
          size="sm"
        />
      </div>
    </UPageSection>
    <UPageSection :ui="{ wrapper: 'py-4' }">
      <h2 class="text-lg font-semibold text-default mb-3">By budget</h2>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="[label, slug] in budgets"
          :key="slug"
          :to="`/boats-for-sale/budget/${slug}`"
          :label="label"
          color="neutral"
          variant="soft"
          size="sm"
        />
      </div>
    </UPageSection>
    <UPageSection :ui="{ wrapper: 'py-4' }">
      <h2 class="text-lg font-semibold text-default mb-3">By use case</h2>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="[label, slug] in uses"
          :key="slug"
          :to="`/best/${slug}`"
          :label="label"
          color="neutral"
          variant="soft"
          size="sm"
        />
      </div>
    </UPageSection>
    <UPageSection :ui="{ wrapper: 'py-4' }">
      <UButton to="/search" label="Open full search" icon="i-lucide-search" />
    </UPageSection>
  </UPage>
</template>

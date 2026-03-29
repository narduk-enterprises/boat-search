<script setup lang="ts">
const route = useRoute()
const brand = String(route.params.slug || '')
  .split('-')
  .filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(' ')

const titleText = brand ? `${brand} boats for sale` : 'Boats by brand'

useSeo({
  title: titleText,
  description: brand
    ? `Shop ${brand} boats with price, length, and location filters.`
    : 'Browse boats for a specific manufacturer.',
  ogImage: { title: titleText, description: 'Brand hub into structured search.', icon: '⛵' },
})
useWebPageSchema({
  name: titleText,
  description: 'Browse boats for a specific manufacturer.',
})

const searchTo = brand
  ? { path: '/boats-for-sale' as const, query: { make: brand } }
  : { path: '/boats-for-sale' as const }
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">{{ brand || 'Brand' }} boats for sale</h1>
      <p class="mt-4 text-muted max-w-3xl">
        Open search with this make prefilled. Inventory depth varies by brand and region.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton :to="searchTo" label="Search this brand" icon="i-lucide-search" />
        <UButton to="/browse" label="Browse" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

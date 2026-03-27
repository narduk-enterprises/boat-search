<script setup lang="ts">
const route = useRoute()

const bands: Record<string, { max: number; label: string }> = {
  'under-10k': { max: 10_000, label: 'under $10,000' },
  'under-25k': { max: 25_000, label: 'under $25,000' },
  'under-50k': { max: 50_000, label: 'under $50,000' },
  'under-100k': { max: 100_000, label: 'under $100,000' },
  'under-250k': { max: 250_000, label: 'under $250,000' },
}

const key = String(route.params.slug || '')
const band = bands[key]

const titleText = band ? `Boats ${band.label}` : 'Boats by budget'

useSeo({
  title: titleText,
  description: band
    ? `Browse boats priced ${band.label} with transparent filters.`
    : 'Browse boats by budget band.',
  ogImage: { title: titleText, description: 'Budget hub into search.', icon: '⛵' },
})
useWebPageSchema({
  name: titleText,
  description: 'Price-banded entry points into boat search.',
})

const searchTo = band
  ? { path: '/search' as const, query: { maxPrice: String(band.max) } }
  : { path: '/search' as const }
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">
        <template v-if="band">Boats {{ band.label }}</template>
        <template v-else>Boats by budget</template>
      </h1>
      <p class="mt-4 text-muted max-w-3xl">
        Budget hubs map to max price filters. Fine-tune length, make, and location on the search
        page.
      </p>
      <div v-if="!band" class="mt-4 text-warning text-sm">Unknown budget slug. Try browse.</div>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton :to="searchTo" label="Open search" icon="i-lucide-search" :disabled="!band" />
        <UButton to="/browse" label="Browse" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

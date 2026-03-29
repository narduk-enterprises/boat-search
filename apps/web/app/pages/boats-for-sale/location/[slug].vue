<script setup lang="ts">
const route = useRoute()
const region = String(route.params.slug || '').toUpperCase()

const titleText = region ? `Boats for sale in ${region}` : 'Boats by location'

useSeo({
  title: titleText,
  description: region
    ? `Explore boats listed in ${region} with source attribution.`
    : 'Browse boats by state or region.',
  ogImage: { title: titleText, description: 'Location hub into search.', icon: '⛵' },
})
useWebPageSchema({
  name: titleText,
  description: 'Geographic entry points into inventory.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">{{ titleText }}</h1>
      <p class="mt-4 text-muted max-w-3xl">
        <template v-if="region">
          Tip: on the search page, combine filters with listing location fields (e.g. {{ region }}).
        </template>
        <template v-else>Pick a region slug like tx or fl.</template>
      </p>
      <p class="mt-2 text-sm text-dimmed">
        Dedicated state filters will ship with enriched geo fields in the crawler.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton
          :to="{ path: '/boats-for-sale', query: region ? { location: region } : undefined }"
          label="Search boats"
          icon="i-lucide-search"
        />
        <UButton to="/browse" label="Browse" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

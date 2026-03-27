<script setup lang="ts">
useSeo({
  title: 'Boats for Sale',
  description: 'Search aggregated boat listings by filters, alerts, and recommendations.',
  ogImage: {
    title: 'Boats for Sale',
    description: 'Search aggregated boat listings by filters, alerts, and recommendations.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Boats for Sale',
  description: 'Search aggregated boat listings by filters, alerts, and recommendations.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">Boats for sale</h1>
      <p class="mt-4 text-muted max-w-3xl whitespace-pre-line">
        Start from structured search. We aggregate public listings and attribute each boat to its
        source.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/search" label="Search boats" icon="i-lucide-search" />
        <UButton to="/" label="Home" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

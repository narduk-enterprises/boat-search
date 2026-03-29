<script setup lang="ts">
useSeo({
  title: 'Used Boats for Sale',
  description: 'Find pre-owned boats with filters and source attribution.',
  ogImage: {
    title: 'Used Boats for Sale',
    description: 'Find pre-owned boats with filters and source attribution.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Used Boats for Sale',
  description: 'Find pre-owned boats with filters and source attribution.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">Used boats for sale</h1>
      <p class="mt-4 text-muted max-w-3xl whitespace-pre-line">
        Most inventory here is pre-owned. New-boat listings will appear when present in upstream
        feeds.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/boats-for-sale" label="Search boats" icon="i-lucide-search" />
        <UButton to="/" label="Home" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

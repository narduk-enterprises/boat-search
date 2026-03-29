<script setup lang="ts">
useSeo({
  title: 'About Boat Search',
  description: 'Boat Search is a buyer-focused discovery layer on top of aggregated listings.',
  ogImage: {
    title: 'About Boat Search',
    description: 'Boat Search is a buyer-focused discovery layer on top of aggregated listings.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'About Boat Search',
  description: 'Boat Search is a buyer-focused discovery layer on top of aggregated listings.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">About Boat Search</h1>
      <p class="mt-4 text-muted max-w-3xl whitespace-pre-line">
        We are not a brokerage. We combine search, alerts, and transparent AI guidance so you waste
        fewer clicks.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/boats-for-sale" label="Search boats" icon="i-lucide-search" />
        <UButton to="/" label="Home" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

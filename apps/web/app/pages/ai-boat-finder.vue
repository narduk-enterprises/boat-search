<script setup lang="ts">
useSeo({
  title: 'AI Boat Finder | Get Recommendations Based on Your Needs',
  description: 'Describe how you will use a boat and get guided filters plus recommendations.',
  ogImage: {
    title: 'AI Boat Finder | Get Recommendations Based on Your Needs',
    description: 'Describe how you will use a boat and get guided filters plus recommendations.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'AI Boat Finder | Get Recommendations Based on Your Needs',
  description: 'Describe how you will use a boat and get guided filters plus recommendations.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">AI boat finder</h1>
      <p class="mt-4 text-muted max-w-3xl whitespace-pre-line">
        Use the homepage analyzer for deep market snapshots today. Profile-aware matching and
        plain-language search are next.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/search" label="Search boats" icon="i-lucide-search" />
        <UButton to="/" label="Home" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

useSeo({
  title: 'Notifications',
  description: 'Alert history and delivery preferences.',
  ogImage: {
    title: 'Notifications',
    description: 'Alert history and delivery preferences.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Notifications',
  description: 'Alert history and delivery preferences.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-2xl font-bold text-default">Notifications</h1>
      <p class="mt-4 text-muted max-w-2xl">
        Signed-in experience is being wired to saved searches, alerts, and recommendations. Check
        back after the next milestone.
      </p>
      <UButton class="mt-6" to="/search" label="Go to search" icon="i-lucide-search" />
    </UPageSection>
  </UPage>
</template>

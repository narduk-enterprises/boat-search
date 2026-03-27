<script setup lang="ts">
useSeo({
  title: 'Contact',
  description: 'Reach the Boat Search team.',
  ogImage: { title: 'Contact', description: 'Reach the Boat Search team.', icon: '⛵' },
})
useWebPageSchema({
  name: 'Contact',
  description: 'Reach the Boat Search team.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">Contact</h1>
      <p class="mt-4 text-muted max-w-3xl whitespace-pre-line">
        For partnership or data questions, reach out through your usual Narduk channels. In-product
        messaging will land later.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/search" label="Search boats" icon="i-lucide-search" />
        <UButton to="/" label="Home" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

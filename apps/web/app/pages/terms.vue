<script setup lang="ts">
useSeo({
  title: 'Terms of Use',
  description: 'Terms for using Boat Search.',
  ogImage: { title: 'Terms of Use', description: 'Terms for using Boat Search.', icon: '⛵' },
})
useWebPageSchema({
  name: 'Terms of Use',
  description: 'Terms for using Boat Search.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">Terms of use</h1>
      <p class="mt-4 text-muted max-w-3xl whitespace-pre-line">
        Boat Search is provided as-is. Listing accuracy remains with sellers and host sites. Full
        legal terms will be published here.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/boats-for-sale" label="Search boats" icon="i-lucide-search" />
        <UButton to="/" label="Home" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

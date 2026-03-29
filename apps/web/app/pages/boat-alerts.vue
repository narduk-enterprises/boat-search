<script setup lang="ts">
useSeo({
  title: 'Boat Alerts | Get Notified About New Matching Boats',
  description: 'Save criteria and get email digests when new boats match.',
  ogImage: {
    title: 'Boat Alerts | Get Notified About New Matching Boats',
    description: 'Save criteria and get email digests when new boats match.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Boat Alerts | Get Notified About New Matching Boats',
  description: 'Save criteria and get email digests when new boats match.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">Boat alerts</h1>
      <p class="mt-4 text-muted max-w-3xl whitespace-pre-line">
        Saved search alerts are rolling out next: email digests, instant notifications, and pause
        controls. Sign in to reserve your spot.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/boats-for-sale" label="Search boats" icon="i-lucide-search" />
        <UButton to="/" label="Home" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

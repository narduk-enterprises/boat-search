<script setup lang="ts">
useSeo({
  title: 'Privacy Policy',
  description: 'How Boat Search handles analytics and account data.',
  ogImage: {
    title: 'Privacy Policy',
    description: 'How Boat Search handles analytics and account data.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Privacy Policy',
  description: 'How Boat Search handles analytics and account data.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">Privacy</h1>
      <p class="mt-4 text-muted max-w-3xl whitespace-pre-line">
        We use the template analytics stack (PostHog, GA4) with privacy-friendly defaults. Detailed
        policy text will be finalized with counsel.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/search" label="Search boats" icon="i-lucide-search" />
        <UButton to="/" label="Home" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

<script setup lang="ts">
useSeo({
  title: 'FAQ',
  description: 'Common questions about Boat Search listings, AI, and alerts.',
  ogImage: {
    title: 'FAQ',
    description: 'Common questions about Boat Search listings, AI, and alerts.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'FAQ',
  description: 'Common questions about Boat Search listings, AI, and alerts.',
  type: 'FAQPage',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">FAQ</h1>
      <dl class="mt-8 space-y-6 max-w-3xl">
        <div>
          <dt class="font-semibold text-default">Where do listings come from?</dt>
          <dd class="mt-2 text-muted">
            Public sources we crawl and normalize. Always verify details on the original listing.
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-default">Is AI advice binding?</dt>
          <dd class="mt-2 text-muted">
            No. Treat AI output as decision support alongside surveys, sea trials, and professional
            help.
          </dd>
        </div>
      </dl>
      <div class="mt-10 flex flex-wrap gap-3">
        <UButton to="/search" label="Search boats" icon="i-lucide-search" />
        <UButton to="/" label="Home" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

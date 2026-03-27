<script setup lang="ts">
useSeo({
  title: 'Boat Buying Guides',
  description: 'Practical guides on boat types, budgets, maintenance, and inspections.',
  ogImage: {
    title: 'Buying guides',
    description: 'Education-first content for boat buyers.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Boat buying guides',
  description: 'Index of buyer education articles.',
})

const guides = [
  { slug: 'how-to-choose-a-center-console', title: 'How to choose a center console' },
  { slug: 'what-size-boat-do-i-need', title: 'What size boat do I need' },
  { slug: 'used-boat-inspection-checklist', title: 'Used boat inspection checklist' },
]
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default">Buying guides</h1>
      <p class="mt-2 text-muted max-w-2xl">
        Deep articles will publish here for SEO and buyer education. Starters below are stubs.
      </p>
      <ul class="mt-8 space-y-3">
        <li v-for="g in guides" :key="g.slug">
          <ULink :to="`/guides/${g.slug}`" class="text-primary font-medium hover:underline">
            {{ g.title }}
          </ULink>
        </li>
      </ul>
    </UPageSection>
  </UPage>
</template>

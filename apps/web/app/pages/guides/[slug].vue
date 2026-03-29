<script setup lang="ts">
const route = useRoute()
const slug = String(route.params.slug || '')

const titles: Record<string, string> = {
  'how-to-choose-a-center-console': 'How to choose a center console',
  'what-size-boat-do-i-need': 'What size boat do I need',
  'used-boat-inspection-checklist': 'Used boat inspection checklist',
}

const titleText = titles[slug] || slug.replaceAll('-', ' ')

useSeo({
  title: titleText,
  description: `Buyer guide: ${titleText}. Practical advice for serious shoppers.`,
  ogImage: { title: titleText, description: 'Boat buyer guide article.', icon: '⛵' },
})
useWebPageSchema({
  name: titleText,
  description: 'Educational article for boat buyers.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default capitalize">{{ titleText }}</h1>
      <p class="mt-6 text-muted max-w-3xl">
        Full article copy will ship with editorial review. Use search to explore live inventory
        while this page grows.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/boats-for-sale" label="Search boats" icon="i-lucide-search" />
        <UButton to="/guides" label="All guides" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

<script setup lang="ts">
const route = useRoute()
const raw = String(route.params.slug || '').replaceAll('-', ' ')
const titleText = raw ? `Best boats for ${raw}` : 'Best boats by use case'

useSeo({
  title: titleText,
  description:
    'Editorial-style guides tying use cases to hull types, budgets, and search shortcuts.',
  ogImage: { title: titleText, description: 'Use-case landing for boat buyers.', icon: '⛵' },
})
useWebPageSchema({
  name: titleText,
  description: 'Practical guidance for a specific boating intent.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default capitalize">{{ titleText }}</h1>
      <p class="mt-4 text-muted max-w-3xl">
        These pages will host long-form guidance plus curated search deep-links. For now, jump into
        search and save alerts for the boats that fit your story.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/search" label="Search boats" icon="i-lucide-search" />
        <UButton to="/guides" label="Guides" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

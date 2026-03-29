<script setup lang="ts">
const route = useRoute()
const raw = String(route.params.slug || '').replaceAll('-', ' ')
const titleText = raw
  ? `${raw
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')} boats for sale`
  : 'Boats by type'

useSeo({
  title: titleText,
  description: raw
    ? `Browse ${raw} listings with filters, source attribution, and alerts.`
    : 'Browse boats by hull type and intent.',
  ogImage: {
    title: titleText,
    description: 'Type hub into structured boat search.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: titleText,
  description: 'Browse boats by hull type and intent.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-3xl font-bold text-default capitalize">
        {{ raw || 'Boat type' }} boats for sale
      </h1>
      <p class="mt-4 text-muted max-w-3xl">
        This hub will drive faceted search as boat classes are normalized in the database. Use
        search today and save alerts when they launch.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <UButton to="/boats-for-sale" label="Search all boats" icon="i-lucide-search" />
        <UButton to="/browse" label="Browse index" color="neutral" variant="soft" />
      </div>
    </UPageSection>
  </UPage>
</template>

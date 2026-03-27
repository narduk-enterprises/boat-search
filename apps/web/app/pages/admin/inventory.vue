<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

useSeo({
  title: 'Inventory Health',
  description:
    'Admin visibility into crawl freshness, source coverage, and fishing inventory health.',
  ogImage: {
    title: 'Inventory Health',
    description: 'Admin inventory monitoring for Boat Search.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Inventory Health',
  description: 'Protected inventory health dashboard for Boat Search admins.',
})

const { data, status } = useInventoryHealth()
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="space-y-2">
        <UBadge color="primary" variant="subtle" label="Admin only" />
        <h1 class="text-3xl font-semibold text-default">Inventory health</h1>
        <p class="max-w-3xl text-muted">
          Keep an eye on fishing-inventory freshness, crawl status, and source depth without leaving
          the product.
        </p>
      </div>
    </UPageSection>

    <UPageSection :ui="{ wrapper: 'py-4' }">
      <div v-if="status === 'pending'" class="flex justify-center py-20">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
      </div>
      <InventoryHealthPanel v-else-if="data" :data="data" />
    </UPageSection>
  </UPage>
</template>

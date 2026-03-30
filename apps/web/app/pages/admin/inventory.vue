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
const { data: dedupeData, status: dedupeStatus } = useInventoryDedupe()
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-2">
          <UBadge color="primary" variant="subtle" label="Admin only" />
          <h1 class="text-3xl font-semibold text-default">Inventory health</h1>
          <p class="max-w-3xl text-muted">
            Keep an eye on fishing-inventory freshness, crawl status, and source depth without
            leaving the product.
          </p>
        </div>

        <div class="flex flex-wrap gap-3">
          <UButton
            to="/admin"
            label="Admin dashboard"
            icon="i-lucide-layout-dashboard"
            color="neutral"
            variant="ghost"
          />
          <UButton
            to="/admin/scraper-pipeline"
            label="Open scraper builder"
            icon="i-lucide-panel-top-open"
            color="neutral"
            variant="soft"
          />
        </div>
      </div>
    </UPageSection>

    <UPageSection :ui="{ container: 'py-4' }">
      <div
        v-if="status === 'pending' || dedupeStatus === 'pending'"
        class="flex justify-center py-20"
      >
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
      </div>
      <div v-else class="space-y-6">
        <InventoryHealthPanel v-if="data" :data="data" />
        <InventoryDedupePanel v-if="dedupeData" :data="dedupeData" />
      </div>
    </UPageSection>
  </UPage>
</template>

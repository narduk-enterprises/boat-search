<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

useSeo({
  title: 'Admin Dashboard',
  description:
    'Manage Boat Search ingestion tools, monitor inventory health, and issue extension API keys.',
  ogImage: {
    title: 'Admin Dashboard',
    description:
      'Manage Boat Search ingestion tools, monitor inventory health, and issue extension API keys.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Admin Dashboard',
  description:
    'Protected Boat Search admin dashboard for inventory operations and API key management.',
})

const adminTools = [
  {
    title: 'Inventory health',
    description: 'Track crawl freshness, stale inventory, and recent source coverage issues.',
    to: '/admin/inventory',
    icon: 'i-lucide-activity',
    cta: 'Open inventory',
  },
  {
    title: 'Scraper pipeline builder',
    description: 'Preview selectors, tune ingestion rules, and run first-party scraper jobs.',
    to: '/admin/scraper-pipeline',
    icon: 'i-lucide-panel-top-open',
    cta: 'Open builder',
  },
  {
    title: 'Account settings',
    description:
      'Review your profile settings and keep the same key-management flow available there too.',
    to: '/account/settings',
    icon: 'i-lucide-user-round-cog',
    cta: 'Open settings',
  },
] as const
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="space-y-2">
            <UBadge color="primary" variant="subtle" label="Admin only" />
            <h1 class="text-3xl font-semibold text-default">Admin dashboard</h1>
            <p class="max-w-3xl text-muted">
              Run the ingestion stack from one place. Jump into inventory monitoring, pipeline
              editing, and extension API key management without leaving the protected admin surface.
            </p>
          </div>

          <UButton
            to="/boats-for-sale"
            label="Open search"
            icon="i-lucide-search"
            color="neutral"
            variant="soft"
          />
        </div>

        <div class="grid gap-4 xl:grid-cols-3">
          <UCard
            v-for="tool in adminTools"
            :key="tool.to"
            class="card-base border-default"
            :ui="{ body: 'p-5 space-y-4' }"
          >
            <div class="flex items-start gap-3">
              <div class="rounded-2xl bg-muted p-3">
                <UIcon :name="tool.icon" class="size-5 text-default" />
              </div>

              <div class="space-y-1">
                <h2 class="text-lg font-semibold text-default">{{ tool.title }}</h2>
                <p class="text-sm text-muted">
                  {{ tool.description }}
                </p>
              </div>
            </div>

            <UButton
              :to="tool.to"
              :label="tool.cta"
              trailing-icon="i-lucide-arrow-right"
              color="neutral"
              variant="soft"
            />
          </UCard>
        </div>
      </div>
    </UPageSection>

    <USeparator />

    <AccountApiKeysPanel />
  </UPage>
</template>

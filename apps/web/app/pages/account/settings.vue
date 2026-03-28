<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

useSeo({
  title: 'Account settings',
  description: 'Email, password, and data controls.',
  ogImage: {
    title: 'Account settings',
    description: 'Email, password, and data controls.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Account settings',
  description: 'Email, password, and data controls.',
})
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2">
          <h1 class="text-2xl font-bold text-default">
            Account settings
          </h1>
          <p class="max-w-2xl text-muted">
            Manage the Boat Search extension credential here. The scraper plugin uses API keys to
            authenticate itself and stream records directly into inventory.
          </p>
        </div>

        <UButton
          class="w-fit"
          to="/search"
          label="Go to search"
          icon="i-lucide-search"
        />
      </div>
    </UPageSection>

    <USeparator />

    <AccountApiKeysPanel />
  </UPage>
</template>

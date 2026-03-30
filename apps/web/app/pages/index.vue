<script setup lang="ts">
useSeo({
  title: 'Boat Search | Live Inventory and AI Boat Suggestions',
  description:
    'Open the live inventory or start the AI-guided boat suggestion flow from a single simple launch page.',
  ogImage: {
    title: 'Boat Search',
    description: 'Choose between live inventory and AI-tailored boat suggestions.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Boat Search',
  description: 'Simple launch page for live boat inventory and AI-guided suggestions.',
})
</script>

<template>
  <UPage>
    <UPageSection :ui="{ container: 'py-4 sm:py-6' }">
      <div class="mx-auto flex min-h-[calc(100dvh-20rem)] max-w-5xl items-center justify-center">
        <div
          class="brand-surface flex w-full max-w-4xl flex-col items-center gap-8 rounded-[2rem] px-6 py-10 text-center shadow-card sm:px-10 sm:py-12"
        >
          <div class="max-w-3xl space-y-4">
            <UBadge label="Boat Search" color="primary" variant="subtle" icon="i-lucide-waves" />
            <h1 class="mx-auto max-w-3xl text-balance text-4xl font-bold text-default sm:text-6xl">
              Start with the market, or jump straight to tailored suggestions.
            </h1>
            <p class="mx-auto max-w-2xl text-base leading-7 text-muted sm:text-xl">
              Two paths. No clutter.
            </p>
          </div>

          <div class="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            <UButton
              to="/boats-for-sale"
              label="View Live Inventory"
              icon="i-lucide-search"
              class="min-h-18 w-full justify-center rounded-[1.4rem] px-6 py-5 text-lg font-semibold sm:text-xl"
            />
            <UButton
              to="/boats-for-sale/map"
              label="Open Inventory Map"
              color="neutral"
              variant="soft"
              icon="i-lucide-map"
              class="min-h-18 w-full justify-center rounded-[1.4rem] px-6 py-5 text-lg font-semibold sm:text-xl"
            />
            <UButton
              to="/login"
              label="AI Tailored Boat Suggestions"
              color="neutral"
              variant="ghost"
              icon="i-lucide-sparkles"
              class="min-h-18 w-full justify-center rounded-[1.4rem] px-6 py-5 text-lg font-semibold sm:text-xl"
            />
          </div>
        </div>
      </div>
    </UPageSection>
  </UPage>
</template>

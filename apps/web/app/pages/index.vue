<script setup lang="ts">
useSeo({
  title: 'Boat Search | AI Fishing Boat Finder',
  description:
    'Signed-in, AI-first buyer workflow for offshore and sportfishing boats. Save one fishing brief, rank the current inventory, and get personalized boat commentary.',
  ogImage: {
    title: 'Boat Search',
    description: 'AI-ranked fishing boat matches from a saved buyer brief.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Boat Search',
  description: 'AI-first fishing boat finder with saved buyer profiles and ranked shortlists.',
})

const { loggedIn } = useUserSession()
const primaryCta = computed(() =>
  loggedIn.value
    ? '/ai-boat-finder'
    : ({ path: '/login', query: { redirect: '/ai-boat-finder' } } as const),
)

const publicSearchCta = '/boats-for-sale'
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
        <div class="space-y-5">
          <div class="space-y-2.5">
            <UBadge
              label="Fishing/offshore MVP"
              color="primary"
              variant="subtle"
              icon="i-lucide-sparkles"
            />
            <h1 class="max-w-4xl text-4xl font-bold text-default sm:text-5xl">
              Save one buyer brief and get a ranked fishing shortlist faster.
            </h1>
            <p class="max-w-3xl text-base text-muted sm:text-lg">
              Boat Search is a signed-in workflow for offshore buyers who want quick shortlist
              decisions, tighter filters, and clearer fit commentary on live inventory.
            </p>
          </div>

          <div class="flex flex-wrap gap-3">
            <UButton
              :to="primaryCta"
              label="Start the AI finder"
              icon="i-lucide-sparkles"
              size="lg"
            />
            <UButton
              :to="publicSearchCta"
              label="Search boats"
              color="neutral"
              variant="soft"
              icon="i-lucide-search"
              size="lg"
            />
            <UButton
              to="/login"
              label="Sign in"
              color="neutral"
              variant="ghost"
              icon="i-lucide-log-in"
              size="lg"
            />
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <UCard class="card-base border-default" :ui="{ body: 'p-4 space-y-1.5' }">
              <div class="space-y-1.5">
                <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">1. Brief</p>
                <p class="text-sm font-semibold text-default">Save your fishing mission once.</p>
                <p class="text-sm text-muted">Waters, crew, budget, size, and ownership limits.</p>
              </div>
            </UCard>
            <UCard class="card-base border-default" :ui="{ body: 'p-4 space-y-1.5' }">
              <div class="space-y-1.5">
                <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">2. Rank</p>
                <p class="text-sm font-semibold text-default">Filter first, then rerank with AI.</p>
                <p class="text-sm text-muted">The shortlist stays grounded in live inventory.</p>
              </div>
            </UCard>
            <UCard class="card-base border-default" :ui="{ body: 'p-4 space-y-1.5' }">
              <div class="space-y-1.5">
                <p class="text-xs font-semibold uppercase tracking-wide text-dimmed">3. Inspect</p>
                <p class="text-sm font-semibold text-default">Review fit notes boat by boat.</p>
                <p class="text-sm text-muted">See why a listing belongs on the board or not.</p>
              </div>
            </UCard>
          </div>
        </div>

        <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-4' }">
          <div class="space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-xl font-semibold text-default">Launch scope</h2>
              <UBadge
                label="Signed-in workflow"
                color="neutral"
                variant="subtle"
                icon="i-lucide-lock-keyhole"
              />
            </div>
            <p class="text-sm text-muted">
              Compact by design: fishing inventory, saved buyer profiles, ranked shortlists, and
              boat-level fit commentary.
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-xl bg-muted px-4 py-3">
              <p class="text-sm font-semibold text-default">Included now</p>
              <p class="mt-1 text-sm text-muted">
                Finder, saved profile, run history, fit summaries, and source click-through.
              </p>
            </div>
            <div class="rounded-xl bg-muted px-4 py-3">
              <p class="text-sm font-semibold text-default">Shipping next</p>
              <p class="mt-1 text-sm text-muted">
                Alerts, email delivery, and deeper class-level taxonomy after public search.
              </p>
            </div>
          </div>

          <USeparator />

          <div class="flex flex-wrap gap-2">
            <UButton :to="primaryCta" label="Open questionnaire" icon="i-lucide-arrow-right" />
            <UButton to="/about" label="Why this product exists" color="neutral" variant="ghost" />
          </div>
        </UCard>
      </div>
    </UPageSection>
  </UPage>
</template>

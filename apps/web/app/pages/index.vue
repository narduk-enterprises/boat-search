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
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
        <div class="space-y-6">
          <div class="space-y-3">
            <UBadge
              label="Fishing/offshore MVP"
              color="primary"
              variant="subtle"
              icon="i-lucide-sparkles"
            />
            <h1 class="text-4xl sm:text-5xl font-bold text-default max-w-4xl">
              Save one fishing brief and let AI rank the right boats in the current inventory.
            </h1>
            <p class="text-lg text-muted max-w-3xl">
              Boat Search is no longer a broad browse site. It is a signed-in buyer workflow for
              fishing and offshore shoppers who want faster shortlist decisions and clearer fit
              commentary.
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
              to="/login"
              label="Sign in"
              color="neutral"
              variant="soft"
              icon="i-lucide-log-in"
              size="lg"
            />
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <UCard class="card-base border-default">
              <div class="space-y-2">
                <p class="text-sm font-semibold text-default">1. Save the brief</p>
                <p class="text-sm text-muted">
                  Capture waters, crew, budget, size, and ownership constraints in one short wizard.
                </p>
              </div>
            </UCard>
            <UCard class="card-base border-default">
              <div class="space-y-2">
                <p class="text-sm font-semibold text-default">2. Rank the inventory</p>
                <p class="text-sm text-muted">
                  We translate the brief into structured filters, then AI reranks the candidate set.
                </p>
              </div>
            </UCard>
            <UCard class="card-base border-default">
              <div class="space-y-2">
                <p class="text-sm font-semibold text-default">3. Inspect each boat</p>
                <p class="text-sm text-muted">
                  Boat detail pages explain why a listing fits or misses your saved profile.
                </p>
              </div>
            </UCard>
          </div>
        </div>

        <UCard class="card-base border-default" :ui="{ body: 'p-6 space-y-5' }">
          <div class="space-y-3">
            <h2 class="text-2xl font-semibold text-default">Launch scope</h2>
            <p class="text-muted">
              This MVP is intentionally opinionated: signed-in flow first, fishing/offshore
              inventory only, saved profiles, ranked shortlists, and boat-level fit commentary.
            </p>
          </div>

          <div class="space-y-3">
            <div class="rounded-xl bg-muted px-4 py-3">
              <p class="text-sm font-semibold text-default">Included now</p>
              <p class="mt-1 text-sm text-muted">
                AI finder, saved buyer profile, recommendation history, boat fit summaries, and
                source click-through.
              </p>
            </div>
            <div class="rounded-xl bg-muted px-4 py-3">
              <p class="text-sm font-semibold text-default">Deferred</p>
              <p class="mt-1 text-sm text-muted">
                Alerts, email, broad editorial hubs, and classic browse-first discovery are no
                longer on the MVP path.
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

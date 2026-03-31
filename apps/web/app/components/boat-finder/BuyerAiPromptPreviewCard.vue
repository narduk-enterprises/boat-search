<script setup lang="ts">
import {
  buildBuyerContext,
  deriveRecommendationFiltersFromAnswers,
  type BuyerAnswersDraft,
} from '~~/lib/boatFinder'

const props = defineProps<{
  answers: BuyerAnswersDraft
}>()

const profileContext = computed(() => buildBuyerContext(props.answers))

const structuredFiltersJson = computed(() =>
  JSON.stringify(deriveRecommendationFiltersFromAnswers(props.answers), null, 2),
)
</script>

<template>
  <UCard class="card-base border-default shadow-card" :ui="{ body: 'space-y-6 p-4 sm:p-6' }">
    <div class="flex flex-wrap items-center gap-2">
      <UBadge
        label="Shortlist AI — buyer payload"
        color="primary"
        variant="subtle"
        size="sm"
        icon="i-lucide-bot-message-square"
      />
    </div>

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="How close is this to the real call?"
      description="This matches the structured buyer fields in our recommendation prompt. The live request also includes a system prompt, scored boat listings, and sometimes relaxed filters when inventory is thin."
      class="border-default"
    />

    <div class="space-y-2">
      <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-dimmed">Buyer brief</h2>
      <p class="text-base leading-relaxed text-default">
        {{ profileContext.buyerBrief }}
      </p>
    </div>

    <USeparator />

    <div class="space-y-2">
      <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-dimmed">Hard constraints</h2>
      <ul
        v-if="profileContext.hardConstraints.length"
        class="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-default"
      >
        <li v-for="(line, i) in profileContext.hardConstraints" :key="`h-${i}`">{{ line }}</li>
      </ul>
      <p v-else class="text-sm text-muted">None captured yet — budget, region, and size show up here.</p>
    </div>

    <USeparator />

    <div class="space-y-2">
      <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-dimmed">Soft preferences</h2>
      <p class="text-xs text-muted">Same entries we pack into the Soft preferences array for the model.</p>
      <div
        class="max-h-72 overflow-y-auto overscroll-y-contain rounded-lg border border-default bg-muted/40 px-4 py-3"
      >
        <ul
          v-if="profileContext.softPreferences.length"
          class="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-default"
        >
          <li v-for="(line, i) in profileContext.softPreferences" :key="`s-${i}`">{{ line }}</li>
        </ul>
        <p v-else class="text-sm text-muted">
          Missions, species, styles, must-haves, and similar signals land here.
        </p>
      </div>
    </div>

    <USeparator />

    <div class="space-y-2">
      <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-dimmed">Reflective context</h2>
      <div
        class="max-h-56 overflow-y-auto overscroll-y-contain rounded-lg border border-default bg-muted/40 px-4 py-3"
      >
        <ul
          v-if="profileContext.reflectiveContext.length"
          class="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-default"
        >
          <li v-for="(line, i) in profileContext.reflectiveContext" :key="`r-${i}`">{{ line }}</li>
        </ul>
        <p v-else class="text-sm text-muted">
          Family, timing, stressors, and your free-form note appear here.
        </p>
      </div>
    </div>

    <USeparator />

    <div class="space-y-2">
      <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-dimmed">Uncertainties</h2>
      <ul
        v-if="profileContext.uncertainties.length"
        class="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-warning"
      >
        <li v-for="(line, i) in profileContext.uncertainties" :key="`u-${i}`">{{ line }}</li>
      </ul>
      <p v-else class="text-sm text-muted">Skipped or &ldquo;not sure&rdquo; answers are called out here for the model.</p>
    </div>

    <USeparator />

    <div class="space-y-2">
      <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-dimmed">Structured filters applied</h2>
      <p class="text-xs text-muted">
        Same JSON shape we attach for inventory filtering and keyword hints (not the boat list itself).
      </p>
      <div
        class="max-h-64 overflow-auto rounded-lg border border-default bg-muted/50 p-3 font-mono text-xs leading-relaxed text-default"
      >
        {{ structuredFiltersJson }}
      </div>
    </div>
  </UCard>
</template>

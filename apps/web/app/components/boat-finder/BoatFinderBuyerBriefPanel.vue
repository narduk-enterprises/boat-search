<script setup lang="ts">
import type { BuyerContext } from '~~/lib/boatFinder'

const props = defineProps<{
  context: BuyerContext
  /** When false, show guidance for what is still needed before shortlist generation. */
  canSubmit: boolean
}>()

const pillars = computed(() => [
  {
    id: 'hard',
    title: 'Hard guardrails',
    description: 'Filters the inventory so results stay realistic.',
    icon: 'i-lucide-shield-check' as const,
    tone: 'primary' as const,
    items: props.context.hardConstraints,
    empty:
      'No fixed guardrails yet — add budget, region or travel radius, or size limits in the questionnaire.',
  },
  {
    id: 'soft',
    title: 'Preferences & fishing fit',
    description: 'How we rank and explain matches inside the pool.',
    icon: 'i-lucide-compass' as const,
    tone: 'neutral' as const,
    items: props.context.softPreferences,
    empty: 'No extra preferences captured yet — optional answers sharpen the ranking.',
  },
  {
    id: 'life',
    title: 'Life-fit & context',
    description: 'Household, timing, stressors, and anything you wrote in your own words.',
    icon: 'i-lucide-heart-pulse' as const,
    tone: 'neutral' as const,
    items: props.context.reflectiveContext,
    empty: 'No reflective context yet — the AI will lean on missions and guardrails only.',
  },
])
</script>

<template>
  <div class="space-y-6 sm:space-y-8" data-testid="boat-finder-brief-panel">
    <!-- Hero: purpose + trust -->
    <div
      class="relative overflow-hidden rounded-2xl border border-default bg-elevated px-5 py-6 sm:px-8 sm:py-7"
    >
      <div
        class="pointer-events-none absolute inset-y-0 end-0 w-2/5 max-w-xs bg-linear-to-l from-primary/15 to-transparent dark:from-primary/20"
        aria-hidden="true"
      />
      <div class="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:size-14"
        >
          <UIcon name="i-lucide-sparkles" class="size-6 sm:size-7" />
        </div>
        <div class="min-w-0 flex-1 space-y-2">
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-dimmed">
            Before we run the matcher
          </p>
          <h2 class="text-xl font-semibold tracking-tight text-default sm:text-2xl">
            Your buyer brief
          </h2>
          <p class="max-w-prose text-sm leading-relaxed text-muted sm:text-base">
            Below is everything we distilled from your answers — the story the AI uses to score
            boats against live inventory. Edit any section with the tabs above, or go back to the
            last question for fine-grained tweaks.
          </p>
          <div class="flex flex-wrap gap-2 pt-1">
            <UBadge
              :label="`${context.hardConstraints.length} guardrail${context.hardConstraints.length === 1 ? '' : 's'}`"
              color="primary"
              variant="soft"
              size="sm"
            />
            <UBadge
              :label="`${context.softPreferences.length} preference${context.softPreferences.length === 1 ? '' : 's'}`"
              color="neutral"
              variant="soft"
              size="sm"
            />
            <UBadge
              :label="`${context.reflectiveContext.length} life-fit signal${context.reflectiveContext.length === 1 ? '' : 's'}`"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <UBadge
              v-if="context.uncertainties.length > 0"
              :label="`${context.uncertainties.length} skipped / unclear`"
              color="warning"
              variant="soft"
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Narrative summary -->
    <UCard
      class="card-base border-default shadow-card overflow-hidden"
      :ui="{ body: 'p-5 sm:p-6 space-y-4' }"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
            In plain language
          </p>
          <h3 class="text-lg font-semibold text-default">How we describe you today</h3>
        </div>
        <UBadge
          label="AI-facing summary"
          color="primary"
          variant="subtle"
          icon="i-lucide-file-text"
        />
      </div>
      <p
        class="rounded-xl border border-default bg-muted/40 px-4 py-3.5 text-base leading-relaxed text-default sm:px-5 sm:py-4 sm:text-[1.05rem]"
      >
        {{ context.buyerBrief }}
      </p>
    </UCard>

    <!-- Structured pillars -->
    <div>
      <div class="mb-4 flex items-end justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
            Structured signals
          </p>
          <h3 class="text-lg font-semibold text-default">What we learned, by layer</h3>
        </div>
      </div>
      <div class="grid min-w-0 gap-4 lg:grid-cols-3">
        <UCard
          v-for="col in pillars"
          :key="col.id"
          class="card-base flex min-h-0 min-w-0 flex-col border-default"
          :ui="{ body: 'flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-5' }"
        >
          <div class="flex items-start gap-3">
            <div
              class="flex size-9 shrink-0 items-center justify-center rounded-lg"
              :class="col.tone === 'primary' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted'"
            >
              <UIcon :name="col.icon" class="size-4" />
            </div>
            <div class="min-w-0 flex-1 space-y-1">
              <h4 class="text-sm font-semibold text-default">{{ col.title }}</h4>
              <p class="text-xs leading-snug text-muted">{{ col.description }}</p>
            </div>
          </div>
          <USeparator />
          <div
            class="min-h-0 max-h-52 flex-1 space-y-2 overflow-y-auto overscroll-y-contain sm:max-h-60"
          >
            <ul v-if="col.items.length" class="flex list-none flex-col gap-2" role="list">
              <li
                v-for="(item, idx) in col.items"
                :key="`${col.id}-${idx}`"
                class="rounded-lg border px-3 py-2 text-sm leading-snug text-default"
                :class="
                  col.tone === 'primary'
                    ? 'border-primary/20 bg-primary/5'
                    : 'border-default bg-muted/40'
                "
              >
                {{ item }}
              </li>
            </ul>
            <p v-else class="text-sm leading-relaxed text-muted">{{ col.empty }}</p>
          </div>
        </UCard>
      </div>
    </div>

    <!-- Skipped / unclear -->
    <UCard
      v-if="context.uncertainties.length > 0"
      class="card-base border-warning/30 bg-warning/5"
      :ui="{ body: 'space-y-3 p-4 sm:p-5' }"
    >
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-circle-dashed" class="mt-0.5 size-5 shrink-0 text-warning" />
        <div class="min-w-0 space-y-1">
          <h3 class="text-sm font-semibold text-default">Skipped or marked "not sure"</h3>
          <p class="text-sm leading-relaxed text-muted">
            The matcher treats these as unknowns, not as open-ended preferences. You can still
            refine answers from the tabs above.
          </p>
        </div>
      </div>
      <ul class="max-h-40 space-y-2 overflow-y-auto overscroll-y-contain ps-8" role="list">
        <li
          v-for="(item, idx) in context.uncertainties"
          :key="`u-${idx}`"
          class="rounded-lg border border-default bg-default px-3 py-2 text-sm text-default"
        >
          {{ item }}
        </li>
      </ul>
    </UCard>

    <UAlert
      v-if="!canSubmit"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Almost ready to generate"
      description="To run a ranked shortlist we still need at least one mission, a budget ceiling, and either a primary region or travel radius. Everything else can stay optional — use the section tabs to fill gaps without leaving this page."
      class="border-default"
    />
  </div>
</template>

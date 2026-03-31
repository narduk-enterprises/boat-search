<script setup lang="ts">
import type { BoatFitSummary } from '~~/lib/boatFinder'

const props = withDefaults(
  defineProps<{
    summary: BoatFitSummary | null
    loading?: boolean
    errorMessage?: string | null
    loggedIn?: boolean
    loginTo?: string
  }>(),
  {
    loading: false,
    errorMessage: null,
    loggedIn: false,
    loginTo: '/login',
  },
)

const emit = defineEmits<{
  generate: []
}>()

const verdictTone = computed(() => {
  switch (props.summary?.verdict) {
    case 'strong-fit':
      return 'success'
    case 'mixed-fit':
      return 'warning'
    case 'weak-fit':
      return 'neutral'
    default:
      return 'neutral'
  }
})
</script>

<template>
  <UCard class="brand-surface border-default/80 shadow-card" :ui="{ body: 'p-5 space-y-4' }">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-sparkles" class="text-primary" />
      <div>
        <h2 class="text-lg font-semibold text-default">Your fit summary</h2>
        <p class="text-sm text-muted">Concise commentary tied to your saved fishing brief.</p>
      </div>
    </div>

    <div v-if="!props.loggedIn" class="space-y-3">
      <p class="text-sm text-muted">
        Sign in and complete the buyer profile wizard to see personalized pros, cons, and fit
        commentary on each boat.
      </p>
      <UButton :to="props.loginTo" label="Sign in for fit summary" icon="i-lucide-log-in" />
    </div>

    <div v-else-if="props.loading" class="flex items-center gap-3 py-6">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-muted" />
      <span class="text-sm text-muted">Scoring this boat against your profile…</span>
    </div>

    <div v-else-if="props.errorMessage" class="space-y-4">
      <div class="rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-default">
        {{ props.errorMessage }}
      </div>
      <UButton label="Try again" color="neutral" variant="soft" @click="emit('generate')" />
    </div>

    <div v-else-if="props.summary" class="space-y-4">
      <UBadge
        :label="props.summary.verdict.replace('-', ' ')"
        :color="verdictTone"
        variant="subtle"
      />

      <div>
        <h3 class="text-lg font-semibold text-default">{{ props.summary.headline }}</h3>
        <p class="mt-2 text-sm text-muted">
          {{ props.summary.summary }}
        </p>
        <p v-if="props.summary.lifeFitNote" class="mt-2 text-sm text-default">
          {{ props.summary.lifeFitNote }}
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <h4 class="text-sm font-semibold text-default">Pros</h4>
          <ul class="space-y-2 text-sm text-muted">
            <li v-for="item in props.summary.pros" :key="item" class="flex gap-2">
              <UIcon name="i-lucide-check-circle-2" class="mt-0.5 shrink-0 text-success" />
              <span>{{ item }}</span>
            </li>
          </ul>
        </div>
        <div class="space-y-2">
          <h4 class="text-sm font-semibold text-default">Watch-outs</h4>
          <ul class="space-y-2 text-sm text-muted">
            <li v-for="item in props.summary.cons" :key="item" class="flex gap-2">
              <UIcon name="i-lucide-alert-triangle" class="mt-0.5 shrink-0 text-warning" />
              <span>{{ item }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div v-else class="space-y-3">
      <p class="text-sm text-muted">
        Run the finder to generate a personalized view of how this boat fits your profile. Note:
        Limits apply per day.
      </p>
      <UButton
        label="Score boat against profile"
        icon="i-lucide-bot-message-square"
        color="primary"
        @click="emit('generate')"
      />
    </div>
  </UCard>
</template>

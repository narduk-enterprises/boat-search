<script setup lang="ts">
import {
  buyerAnswersSchema,
  createEmptyBuyerAnswers,
  createEmptyBuyerAnswerOverrides,
  diffBuyerAnswers,
  normalizeBuyerAnswersDraft,
  type BuyerAnswersDraft,
} from '~~/lib/boatFinder'

definePageMeta({ middleware: ['auth'] })

useSeo({
  title: 'AI Fishing Boat Finder',
  description:
    'Answer a richer fishing questionnaire and get an AI-ranked shortlist grounded in the current offshore inventory.',
  ogImage: {
    title: 'AI Fishing Boat Finder',
    description: 'Adaptive buyer questionnaire plus AI-ranked fishing boat matches.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'AI Fishing Boat Finder',
  description: 'Adaptive questionnaire that turns a fishing brief into an AI-ranked shortlist.',
})

const toast = useToast()
const route = useRoute()
const { coreAnswers, effectiveAnswers, status, isComplete } = useBuyerProfile()
const { createSession } = useRecommendationSessions()

const draftAnswers = ref<BuyerAnswersDraft>(createEmptyBuyerAnswers())
const saveOverrides = shallowRef(false)
const submitting = shallowRef(false)
const submitError = shallowRef<string | null>(null)
const saveToggleTouched = shallowRef(false)

watch(
  effectiveAnswers,
  (nextAnswers) => {
    draftAnswers.value = normalizeBuyerAnswersDraft(nextAnswers)
    if (!saveToggleTouched.value) {
      saveOverrides.value = !isComplete.value
    }
  },
  { immediate: true },
)

function updateSaveOverrides(value: boolean) {
  saveToggleTouched.value = true
  saveOverrides.value = value
}

async function handleSubmit() {
  submitError.value = null

  let parsedAnswers
  try {
    parsedAnswers = buyerAnswersSchema.parse(draftAnswers.value)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Complete the required answers before continuing.'
    submitError.value = message
    return
  }

  const overrides = diffBuyerAnswers(coreAnswers.value, parsedAnswers)
  const hasOverrides =
    JSON.stringify(overrides) !== JSON.stringify(createEmptyBuyerAnswerOverrides())

  submitting.value = true
  try {
    const response = await createSession({
      overrides: hasOverrides ? overrides : undefined,
      saveOverrides: saveOverrides.value,
    })
    toast.add({
      title: 'Shortlist ready',
      description: 'Your buyer brief has been matched against the current inventory.',
      color: 'success',
    })
    await navigateTo({
      path: '/search',
      query: { sessionId: String(response.session.id) },
    })
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    submitError.value =
      err.data?.statusMessage || err.message || 'Could not generate recommendations.'
  } finally {
    submitting.value = false
  }
}

const backPath = computed(() => {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/')) {
    return redirect
  }
  return '/'
})
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div class="space-y-5">
          <div class="space-y-2.5">
            <UBadge
              label="Signed-in AI workflow"
              color="primary"
              variant="subtle"
              icon="i-lucide-sparkles"
            />
            <h1 class="text-3xl font-bold text-default sm:text-4xl">
              Tell us the mission, the guardrails, and the real-life baggage.
            </h1>
            <p class="max-w-3xl text-base text-muted sm:text-lg">
              Build one honest buyer brief, pressure-test it before you run, and let AI rank the
              boats that actually make sense.
            </p>
          </div>

          <div
            v-if="status === 'pending'"
            class="flex items-center gap-3 rounded-xl bg-muted px-4 py-3"
          >
            <UIcon name="i-lucide-loader-2" class="animate-spin text-muted" />
            <span class="text-sm text-muted">Loading your saved buyer brief…</span>
          </div>

          <BoatFinderWizard
            v-else
            v-model="draftAnswers"
            :submitting="submitting"
            :error="submitError"
            :save-overrides="saveOverrides"
            submit-label="Generate shortlist"
            @update:save-overrides="updateSaveOverrides"
            @submit="handleSubmit"
          />
        </div>

        <div class="space-y-4 xl:sticky xl:top-24">
          <UCard class="card-base border-default" :ui="{ body: 'p-4 space-y-4' }">
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <h2 class="text-lg font-semibold text-default">Workflow summary</h2>
                <p class="text-sm text-muted">
                  One adaptive intake. One shortlist. Optional core-profile updates.
                </p>
              </div>
              <UBadge label="6 steps" color="primary" variant="soft" icon="i-lucide-list-checks" />
            </div>

            <div class="grid gap-2 text-sm text-muted">
              <div class="rounded-xl bg-muted px-3 py-2">
                1. Define the mission and geography honestly.
              </div>
              <div class="rounded-xl bg-muted px-3 py-2">
                2. Set budget and size guardrails that hold up in real life.
              </div>
              <div class="rounded-xl bg-muted px-3 py-2">
                3. Add fishing, ownership, and family reality checks before reranking.
              </div>
            </div>
          </UCard>

          <UCard class="card-base border-default" :ui="{ body: 'p-4 space-y-3' }">
            <h2 class="text-lg font-semibold text-default">
              Need to edit the saved default later?
            </h2>
            <p class="text-sm text-muted">
              The finder can run with one-off overrides, or you can lock changes into your core
              buyer profile.
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                to="/account/profile"
                label="Open saved profile"
                color="neutral"
                variant="soft"
              />
              <UButton :to="backPath" label="Back" color="neutral" variant="ghost" />
            </div>
          </UCard>
        </div>
      </div>
    </UPageSection>
  </UPage>
</template>

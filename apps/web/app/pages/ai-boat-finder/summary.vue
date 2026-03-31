<script setup lang="ts">
import BuyerAiPromptPreviewCard from '~~/app/components/boat-finder/BuyerAiPromptPreviewCard.vue'
import {
  buyerAnswersSchema,
  createEmptyBuyerAnswers,
  normalizeBuyerAnswersDraft,
  type BuyerAnswersDraft,
} from '~~/lib/boatFinder'

definePageMeta({
  middleware: ['auth'],
  ssr: false,
})

useSeo({
  title: 'Review brief before shortlist',
  description: 'Confirm what we send to the matcher, then generate your AI-ranked shortlist.',
  ogImage: {
    title: 'Boat finder — review brief',
    description: 'Buyer payload preview before shortlist generation.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Review brief before shortlist',
  description: 'Preview of buyer context sent to the recommendation model.',
})

const toast = useToast()
const { coreAnswers, status, refresh } = useBuyerProfile()
const { createSession } = useRecommendationSessions()

const generating = shallowRef(false)
const generateError = shallowRef<string | null>(null)

const answers = computed<BuyerAnswersDraft>(() =>
  normalizeBuyerAnswersDraft(coreAnswers.value ?? createEmptyBuyerAnswers()),
)

const answersValid = computed(() => buyerAnswersSchema.safeParse(answers.value).success)

onMounted(() => {
  void refresh()
})

async function handleGenerateAiSummary() {
  generateError.value = null
  if (!buyerAnswersSchema.safeParse(answers.value).success) {
    generateError.value = 'Complete required answers before generating.'
    return
  }

  generating.value = true
  try {
    const response = await createSession()
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
    generateError.value =
      err.data?.statusMessage || err.message || 'Could not generate recommendations.'
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <UPage class="min-w-0" :ui="{ root: 'min-w-0', center: 'min-w-0' }">
    <UPageSection
      class="pb-20"
      :ui="{
        root: 'relative isolate min-w-0',
        container:
          'min-w-0 w-full flex flex-col gap-6 py-8 sm:gap-10 sm:py-10 lg:gap-12 lg:py-12',
      }"
    >
      <div class="mx-auto w-full min-w-0 max-w-3xl space-y-6" data-testid="boat-finder-summary-shell">
        <div class="space-y-2">
          <h1 class="text-2xl font-bold tracking-tight text-default sm:text-3xl">Review your brief</h1>
          <p class="text-sm text-muted sm:text-base">
            This is what we send to the shortlist model (plus system instructions and live listings on
            our side). When it looks right, run generation — you can still edit answers in the finder or
            profile afterward.
          </p>
        </div>

        <div v-if="status === 'pending'" class="flex justify-center py-16">
          <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
        </div>

        <template v-else>
          <UButton
            block
            label="Run AI assessment now"
            color="primary"
            size="xl"
            icon="i-lucide-sparkles"
            class="min-h-14 text-base sm:min-h-16 sm:text-lg"
            :loading="generating"
            :disabled="!answersValid || generating"
            data-testid="boat-finder-summary-generate"
            @click="handleGenerateAiSummary"
          />

          <div v-if="!answersValid" class="space-y-3">
            <UAlert
              color="warning"
              variant="subtle"
              title="Required answers missing"
              description="Go back to the finder and finish mission, budget ceiling, and region or travel radius before generating."
              class="border-default"
            />
            <UButton to="/ai-boat-finder" label="Back to finder" size="sm" variant="soft" />
          </div>

          <div
            v-if="generateError"
            class="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error"
            data-testid="boat-finder-summary-error"
          >
            {{ generateError }}
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              to="/ai-boat-finder"
              label="Edit in finder"
              color="neutral"
              variant="soft"
              size="sm"
              icon="i-lucide-arrow-left"
            />
            <UButton
              to="/account/profile"
              label="Buyer profile"
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-user-round"
            />
          </div>

          <BuyerAiPromptPreviewCard :answers="answers" />
        </template>
      </div>
    </UPageSection>
  </UPage>
</template>

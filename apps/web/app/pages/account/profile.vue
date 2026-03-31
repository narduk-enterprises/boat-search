<script setup lang="ts">
import BuyerAiPromptPreviewCard from '~~/app/components/boat-finder/BuyerAiPromptPreviewCard.vue'
import {
  buyerAnswersSchema,
  createEmptyBuyerAnswers,
  normalizeBuyerAnswersDraft,
  type BuyerAnswersDraft,
} from '~~/lib/boatFinder'

definePageMeta({ middleware: ['auth'] })

const showFullEditor = shallowRef(false)

useSeo({
  title: 'Buyer Profile',
  description: 'Edit the saved fishing brief that powers your shortlist and boat commentary.',
  ogImage: {
    title: 'Buyer Profile',
    description: 'Saved fishing questionnaire and rerun controls for Boat Search.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Buyer Profile',
  description: 'Saved fishing questionnaire and rerun controls for Boat Search.',
})

const toast = useToast()
const { coreAnswers, status, saveProfile } = useBuyerProfile()
const { createSession } = useRecommendationSessions()

const draftAnswers = ref<BuyerAnswersDraft>(createEmptyBuyerAnswers())
const saving = shallowRef(false)
const rerunning = shallowRef(false)

watch(
  coreAnswers,
  (nextAnswers) => {
    draftAnswers.value = normalizeBuyerAnswersDraft(nextAnswers)
  },
  { immediate: true },
)

function parseDraftAnswers() {
  return buyerAnswersSchema.parse(draftAnswers.value)
}

async function handleSave() {
  saving.value = true
  try {
    await saveProfile(parseDraftAnswers())
    toast.add({ title: 'Buyer profile saved', color: 'success' })
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    toast.add({
      title: 'Could not save',
      description: err.data?.statusMessage || err.message || 'Try again.',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

async function handleSaveAndRerun() {
  rerunning.value = true
  try {
    await saveProfile(parseDraftAnswers())
    const response = await createSession()
    toast.add({
      title: 'Shortlist refreshed',
      description: 'Your updated buyer brief is now driving the recommendation board.',
      color: 'success',
    })
    await navigateTo({
      path: '/search',
      query: { sessionId: String(response.session.id) },
    })
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    toast.add({
      title: 'Could not rerun finder',
      description: err.data?.statusMessage || err.message || 'Try again.',
      color: 'error',
    })
  } finally {
    rerunning.value = false
  }
}
</script>

<template>
  <UPage>
    <UPageSection class="pb-10 sm:pb-12">
      <div class="mx-auto max-w-3xl space-y-5">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 space-y-1">
            <h1 class="text-xl font-bold tracking-tight text-default sm:text-2xl">Buyer profile</h1>
            <p class="text-sm text-muted">
              Below is the buyer side of what we send when we run the shortlist model — same sections as
              the prompt payload (brief, constraints, preferences, life-fit, uncertainties, filters). The
              API also adds system instructions, inventory candidates, and any relaxed search rules, so
              this is not the entire request.
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <UButton
              to="/ai-boat-finder"
              label="AI finder"
              icon="i-lucide-sparkles"
              color="neutral"
              variant="ghost"
              size="sm"
            />
            <UButton
              label="Save"
              icon="i-lucide-save"
              color="neutral"
              variant="soft"
              size="sm"
              :loading="saving"
              @click="handleSave"
            />
            <UButton
              label="Save & rerun"
              icon="i-lucide-refresh-cw"
              size="sm"
              :loading="rerunning"
              @click="handleSaveAndRerun"
            />
          </div>
        </div>

        <div v-if="status === 'pending'" class="flex justify-center py-16">
          <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
        </div>

        <template v-else>
          <BuyerAiPromptPreviewCard :answers="draftAnswers" />

          <div class="flex flex-wrap items-center justify-between gap-3">
            <UButton
              :label="showFullEditor ? 'Hide full questionnaire' : 'Edit full questionnaire'"
              color="neutral"
              variant="outline"
              size="sm"
              :icon="showFullEditor ? 'i-lucide-chevron-up' : 'i-lucide-panels-top-left'"
              @click="showFullEditor = !showFullEditor"
            />
          </div>

          <UCard
            v-show="showFullEditor"
            class="card-base border-default"
            :ui="{ body: 'p-4 sm:p-5' }"
          >
            <BoatFinderProfileFields v-model="draftAnswers" />
          </UCard>
        </template>
      </div>
    </UPageSection>
  </UPage>
</template>

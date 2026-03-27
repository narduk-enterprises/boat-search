<script setup lang="ts">
import {
  buyerProfileSchema,
  createEmptyBuyerProfile,
  normalizeBuyerProfileDraft,
  type BuyerProfileDraft,
} from '~~/lib/boatFinder'

definePageMeta({ middleware: ['auth'] })

useSeo({
  title: 'AI Fishing Boat Finder',
  description:
    'Answer a short fishing questionnaire and get an AI-ranked shortlist from the current offshore inventory.',
  ogImage: {
    title: 'AI Fishing Boat Finder',
    description: 'Guided buyer questionnaire plus AI-ranked fishing boat matches.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'AI Fishing Boat Finder',
  description: 'Guided questionnaire that turns a fishing brief into an AI-ranked shortlist.',
})

const toast = useToast()
const route = useRoute()
const { profile, status } = useBuyerProfile()
const { createSession } = useRecommendationSessions()

const draftProfile = ref<BuyerProfileDraft>(createEmptyBuyerProfile())
const submitting = shallowRef(false)
const submitError = shallowRef<string | null>(null)

watch(
  profile,
  (nextProfile) => {
    draftProfile.value = normalizeBuyerProfileDraft(nextProfile)
  },
  { immediate: true },
)

async function handleSubmit() {
  submitError.value = null

  let parsedProfile
  try {
    parsedProfile = buyerProfileSchema.parse(draftProfile.value)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Complete each required field before continuing.'
    submitError.value = message
    return
  }

  submitting.value = true
  try {
    const response = await createSession(parsedProfile)
    toast.add({
      title: 'Shortlist ready',
      description: 'Your fishing brief has been matched against the current inventory.',
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
      <div class="grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
        <div class="space-y-6">
          <div class="space-y-3">
            <UBadge
              label="Signed-in AI workflow"
              color="primary"
              variant="subtle"
              icon="i-lucide-sparkles"
            />
            <h1 class="text-3xl sm:text-4xl font-bold text-default">
              Tell us your fishing mission and we will rank the right boats.
            </h1>
            <p class="text-lg text-muted max-w-3xl">
              This finder saves your brief, translates it into structured filters, and then reranks
              the live fishing inventory with AI commentary.
            </p>
          </div>

          <div
            v-if="status === 'pending'"
            class="flex items-center gap-3 rounded-xl bg-muted px-4 py-4"
          >
            <UIcon name="i-lucide-loader-2" class="animate-spin text-muted" />
            <span class="text-sm text-muted">Loading your saved buyer brief…</span>
          </div>

          <BoatFinderWizard
            v-else
            v-model="draftProfile"
            :submitting="submitting"
            :error="submitError"
            @submit="handleSubmit"
          />
        </div>

        <div class="space-y-4">
          <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-4' }">
            <div class="space-y-2">
              <h2 class="text-lg font-semibold text-default">How it works</h2>
              <ol class="space-y-2 text-sm text-muted">
                <li>1. Save a focused offshore fishing brief.</li>
                <li>
                  2. We search the current inventory with budget, size, and region constraints.
                </li>
                <li>3. AI reranks the shortlist and explains why each boat belongs there.</li>
              </ol>
            </div>
            <USeparator />
            <div class="space-y-2 text-sm text-muted">
              <p>
                Launch scope is intentionally narrow: fishing/offshore inventory, saved profiles,
                ranked matches, and personalized boat commentary.
              </p>
              <p>
                Alerts, editorial hubs, and broader browse experiences stay outside the MVP path.
              </p>
            </div>
          </UCard>

          <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-3' }">
            <h2 class="text-lg font-semibold text-default">Need to adjust later?</h2>
            <p class="text-sm text-muted">
              Your answers become your saved buyer profile, so future runs and boat detail
              commentary stay aligned with the same brief.
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

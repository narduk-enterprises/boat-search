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
              Tell us the mission. We will rank the right boats.
            </h1>
            <p class="max-w-3xl text-base text-muted sm:text-lg">
              Save one buyer brief, filter the live inventory, and get AI-ranked matches with
              concise fit commentary.
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
            v-model="draftProfile"
            :submitting="submitting"
            :error="submitError"
            @submit="handleSubmit"
          />
        </div>

        <div class="space-y-4 xl:sticky xl:top-24">
          <UCard class="card-base border-default" :ui="{ body: 'p-4 space-y-4' }">
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <h2 class="text-lg font-semibold text-default">Workflow summary</h2>
                <p class="text-sm text-muted">One brief. One shortlist. Reusable profile.</p>
              </div>
              <UBadge label="3 steps" color="primary" variant="soft" icon="i-lucide-list-checks" />
            </div>

            <div class="grid gap-2 text-sm text-muted">
              <div class="rounded-xl bg-muted px-3 py-2">
                1. Save the mission and ownership limits.
              </div>
              <div class="rounded-xl bg-muted px-3 py-2">
                2. Filter the live inventory before reranking.
              </div>
              <div class="rounded-xl bg-muted px-3 py-2">
                3. Review why each boat fits or misses.
              </div>
            </div>
          </UCard>

          <UCard class="card-base border-default" :ui="{ body: 'p-4 space-y-3' }">
            <h2 class="text-lg font-semibold text-default">Need to adjust later?</h2>
            <p class="text-sm text-muted">
              Your answers become the saved buyer profile that future runs and boat detail notes
              reference.
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

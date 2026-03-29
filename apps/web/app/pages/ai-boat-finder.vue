<script setup lang="ts">
import {
  buyerAnswersSchema,
  createEmptyBuyerAnswers,
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
const { coreAnswers, updatedAt, saveProfile, status } = useBuyerProfile()
const { createSession } = useRecommendationSessions()

const draftAnswers = ref<BuyerAnswersDraft>(createEmptyBuyerAnswers())
const submitting = shallowRef(false)
const submitError = shallowRef<string | null>(null)
const autosaveState = shallowRef<'idle' | 'saving' | 'saved' | 'error'>('idle')
const autosaveError = shallowRef<string | null>(null)
const profileHydrated = shallowRef(false)
const suppressAutosave = shallowRef(true)
const persistedSignature = shallowRef(JSON.stringify(createEmptyBuyerAnswers()))
const activeSaveSignature = shallowRef<string | null>(null)

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<boolean> | null = null

function currentDraftSignature() {
  return JSON.stringify(normalizeBuyerAnswersDraft(draftAnswers.value))
}

function syncDraftFromProfile(nextAnswers: BuyerAnswersDraft) {
  suppressAutosave.value = true
  draftAnswers.value = normalizeBuyerAnswersDraft(nextAnswers)
  persistedSignature.value = currentDraftSignature()
  profileHydrated.value = true

  queueMicrotask(() => {
    suppressAutosave.value = false
  })
}

watch(
  coreAnswers,
  (nextAnswers) => {
    const normalized = normalizeBuyerAnswersDraft(nextAnswers)
    const nextSignature = JSON.stringify(normalized)
    const localSignature = currentDraftSignature()

    if (
      !profileHydrated.value ||
      localSignature === persistedSignature.value ||
      localSignature === nextSignature
    ) {
      syncDraftFromProfile(normalized)
      return
    }

    persistedSignature.value = nextSignature
  },
  { immediate: true },
)

async function persistDraft(options: { force?: boolean } = {}) {
  const normalized = normalizeBuyerAnswersDraft(draftAnswers.value)
  const signature = JSON.stringify(normalized)

  if (!options.force && signature === persistedSignature.value) {
    autosaveState.value = profileHydrated.value ? 'saved' : 'idle'
    autosaveError.value = null
    return true
  }

  if (pendingSave && activeSaveSignature.value === signature) {
    return pendingSave
  }

  autosaveState.value = 'saving'
  autosaveError.value = null
  activeSaveSignature.value = signature

  pendingSave = saveProfile(normalized)
    .then(() => {
      persistedSignature.value = signature
      autosaveState.value = 'saved'
      return true
    })
    .catch((error: unknown) => {
      const err = error as { data?: { statusMessage?: string }; message?: string }
      autosaveState.value = 'error'
      autosaveError.value =
        err.data?.statusMessage || err.message || 'Could not save your buyer brief.'
      return false
    })
    .finally(() => {
      pendingSave = null
      activeSaveSignature.value = null
    })

  return pendingSave
}

/* vue-official allow-deep-watch -- Autosave needs to observe nested draft answer changes. */
watch(
  draftAnswers,
  () => {
    if (import.meta.server || !profileHydrated.value || suppressAutosave.value) {
      return
    }

    const signature = currentDraftSignature()
    if (signature === persistedSignature.value) {
      if (autosaveState.value !== 'saving') {
        autosaveState.value = 'saved'
      }
      autosaveError.value = null
      return
    }

    autosaveState.value = 'idle'

    if (autosaveTimer) {
      clearTimeout(autosaveTimer)
    }

    autosaveTimer = setTimeout(() => {
      void persistDraft()
    }, 900)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
  }
})

const autosaveMessage = computed(() => {
  if (autosaveState.value === 'saving') {
    return 'Saving your buyer brief...'
  }

  if (autosaveState.value === 'error') {
    return autosaveError.value ?? 'Could not save your buyer brief.'
  }

  if (autosaveState.value === 'saved' && updatedAt.value) {
    const formatted = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(updatedAt.value))
    return `Saved to your buyer profile at ${formatted}.`
  }

  return 'Changes save into your buyer profile automatically as you answer.'
})

async function handleSubmit() {
  submitError.value = null

  try {
    buyerAnswersSchema.parse(draftAnswers.value)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Complete the required answers before continuing.'
    submitError.value = message
    return
  }

  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }

  const saved = await persistDraft()
  if (!saved) {
    submitError.value = autosaveError.value ?? 'Could not save the latest buyer brief.'
    return
  }

  submitting.value = true
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
              Build one honest buyer brief on a single page, let it autosave while you work, and
              then have AI rank the boats that actually deserve your time.
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
            :autosave-state="autosaveState"
            :autosave-message="autosaveMessage"
            submit-label="Generate shortlist"
            @submit="handleSubmit"
          />
        </div>

        <div class="space-y-4 xl:sticky xl:top-24">
          <UCard class="card-base border-default" :ui="{ body: 'p-4 space-y-4' }">
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <h2 class="text-lg font-semibold text-default">Workflow summary</h2>
                <p class="text-sm text-muted">
                  One page. Autosaved profile. One shortlist grounded in the current market.
                </p>
              </div>
              <UBadge label="Autosaved" color="primary" variant="soft" icon="i-lucide-save" />
            </div>

            <div class="grid gap-2 text-sm text-muted">
              <div class="rounded-xl bg-muted px-3 py-2">
                1. Answer everything on one page without losing your place.
              </div>
              <div class="rounded-xl bg-muted px-3 py-2">
                2. Save the buyer brief automatically while you work.
              </div>
              <div class="rounded-xl bg-muted px-3 py-2">
                3. Generate a linked shortlist with real boats to pursue and avoid.
              </div>
            </div>
          </UCard>

          <UCard class="card-base border-default" :ui="{ body: 'p-4 space-y-3' }">
            <h2 class="text-lg font-semibold text-default">Your saved profile stays current</h2>
            <p class="text-sm text-muted">
              This page edits the core buyer profile directly, so the next shortlist starts from the
              latest answers you already worked through.
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

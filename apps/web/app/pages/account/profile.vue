<script setup lang="ts">
import {
  buyerProfileSchema,
  createEmptyBuyerProfile,
  normalizeBuyerProfileDraft,
  type BuyerProfileDraft,
} from '~~/lib/boatFinder'

definePageMeta({ middleware: ['auth'] })

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
const { profile, status, saveProfile } = useBuyerProfile()
const { createSession } = useRecommendationSessions()

const draftProfile = ref<BuyerProfileDraft>(createEmptyBuyerProfile())
const saving = shallowRef(false)
const rerunning = shallowRef(false)

watch(
  profile,
  (nextProfile) => {
    draftProfile.value = normalizeBuyerProfileDraft(nextProfile)
  },
  { immediate: true },
)

function parseDraftProfile() {
  return buyerProfileSchema.parse(draftProfile.value)
}

async function handleSave() {
  saving.value = true
  try {
    await saveProfile(parseDraftProfile())
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
    const response = await createSession(parseDraftProfile())
    toast.add({
      title: 'Shortlist refreshed',
      description: 'Your updated fishing brief is now driving the recommendation board.',
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
    <UPageSection>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 class="text-3xl font-bold text-default">Saved buyer profile</h1>
          <p class="mt-2 max-w-3xl text-muted">
            This is the fishing brief used to search, rank, and explain boats everywhere else in the
            product.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            label="Save profile"
            icon="i-lucide-save"
            color="neutral"
            variant="soft"
            :loading="saving"
            @click="handleSave"
          />
          <UButton
            label="Save and rerun finder"
            icon="i-lucide-sparkles"
            :loading="rerunning"
            @click="handleSaveAndRerun"
          />
        </div>
      </div>
    </UPageSection>

    <UPageSection>
      <div v-if="status === 'pending'" class="flex items-center justify-center py-24">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
      </div>

      <UCard v-else class="card-base border-default" :ui="{ body: 'p-5 sm:p-6 space-y-6' }">
        <BoatFinderProfileFields v-model="draftProfile" />
      </UCard>
    </UPageSection>
  </UPage>
</template>

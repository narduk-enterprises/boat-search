<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

useSeo({
  title: 'Buyer Profiles',
  description: 'Manage your library of buyer profiles that power AI shortlist recommendations.',
  ogImage: {
    title: 'Buyer Profiles',
    description: 'Named buyer profiles and rerun controls for Boat Search.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Buyer Profiles',
  description: 'Manage named buyer profiles for AI-driven boat recommendations.',
})

const toast = useToast()
const {
  profiles,
  status,
  canCreateMore,
  createProfile,
  duplicateProfile,
  activateProfile,
  deleteProfile,
  renameProfile,
} = useBuyerProfiles()
const { createSession } = useRecommendationSessions()

const showCreateDialog = shallowRef(false)
const rerunningProfileId = shallowRef<number | null>(null)

async function handleCreate(name: string) {
  try {
    const created = await createProfile({ name })
    toast.add({ title: 'Profile created', color: 'success' })
    if (created?.id) {
      await navigateTo(`/account/profile/${created.id}`)
    }
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    toast.add({
      title: 'Could not create profile',
      description: err.data?.statusMessage || err.message || 'Try again.',
      color: 'error',
    })
  }
}

function handleEdit(profileId: number) {
  void navigateTo({ path: '/ai-boat-finder', query: { profileId: String(profileId) } })
}

async function handleActivate(profileId: number) {
  try {
    await activateProfile(profileId)
    toast.add({ title: 'Profile activated', color: 'success' })
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    toast.add({
      title: 'Could not activate',
      description: err.data?.statusMessage || err.message || 'Try again.',
      color: 'error',
    })
  }
}

async function handleDuplicate(profileId: number) {
  try {
    await duplicateProfile(profileId)
    toast.add({ title: 'Profile duplicated', color: 'success' })
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    toast.add({
      title: 'Could not duplicate',
      description: err.data?.statusMessage || err.message || 'Try again.',
      color: 'error',
    })
  }
}

async function handleRerun(profileId: number) {
  rerunningProfileId.value = profileId
  try {
    const response = await createSession({ profileId })
    toast.add({
      title: 'Shortlist refreshed',
      description: 'Your profile has been matched against current inventory.',
      color: 'success',
    })
    await navigateTo({
      path: '/search',
      query: { sessionId: String(response.session.id) },
    })
  } catch (error: unknown) {
    const err = error as {
      data?: { statusMessage?: string; nextRunAvailableAt?: string }
      statusCode?: number
      message?: string
    }
    if (err.statusCode === 429) {
      const nextAt = err.data?.nextRunAvailableAt
      toast.add({
        title: 'Cooldown active',
        description: nextAt
          ? `This profile can be rerun after ${new Date(nextAt).toLocaleString()}.`
          : 'This profile was run recently. Please wait before rerunning.',
        color: 'warning',
      })
    } else {
      toast.add({
        title: 'Could not rerun',
        description: err.data?.statusMessage || err.message || 'Try again.',
        color: 'error',
      })
    }
  } finally {
    rerunningProfileId.value = null
  }
}

async function handleDelete(profileId: number) {
  try {
    await deleteProfile(profileId)
    toast.add({ title: 'Profile deleted', color: 'success' })
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    toast.add({
      title: 'Could not delete',
      description: err.data?.statusMessage || err.message || 'Try again.',
      color: 'error',
    })
  }
}

async function handleRename(profileId: number, name: string) {
  try {
    await renameProfile(profileId, name)
    toast.add({ title: 'Profile renamed', color: 'success' })
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    toast.add({
      title: 'Could not rename',
      description: err.data?.statusMessage || err.message || 'Try again.',
      color: 'error',
    })
  }
}
</script>

<template>
  <UPage>
    <UPageSection class="pb-10 sm:pb-12">
      <div class="mx-auto max-w-3xl space-y-5">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0 space-y-1">
            <h1 class="text-xl font-bold tracking-tight text-default sm:text-2xl">
              AI Boat Profiles
            </h1>
            <p class="text-sm text-muted">
              Each profile captures a different buying scenario. Activate one to use it as the
              default when running the AI boat finder.
            </p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <UButton
              label="New profile"
              icon="i-lucide-plus"
              size="sm"
              :disabled="!canCreateMore"
              @click="showCreateDialog = true"
            />
          </div>
        </div>

        <div v-if="status === 'pending'" class="flex justify-center py-16">
          <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
        </div>

        <template v-else-if="profiles.length === 0">
          <div class="card-base rounded-2xl border-default px-6 py-12 text-center">
            <UIcon name="i-lucide-user-round" class="mx-auto text-4xl text-dimmed" />
            <h2 class="mt-4 text-xl font-semibold text-default">No profiles yet</h2>
            <p class="mt-2 text-muted">
              Create your first buyer profile to start generating AI-ranked shortlists.
            </p>
            <UButton
              class="mt-6"
              label="Create first profile"
              icon="i-lucide-plus"
              @click="showCreateDialog = true"
            />
          </div>
        </template>

        <template v-else>
          <div v-if="!canCreateMore" class="text-xs text-muted">
            {{ profiles.length }} / 5 profiles used
          </div>
          <div class="space-y-3">
            <AccountBuyerProfileCard
              v-for="p in profiles"
              :key="p.id"
              :profile="p"
              :rerunning="rerunningProfileId === p.id"
              @edit="handleEdit"
              @activate="handleActivate"
              @duplicate="handleDuplicate"
              @rerun="handleRerun"
              @delete="handleDelete"
              @rename="handleRename"
            />
          </div>
        </template>

        <AccountBuyerProfileCreateDialog
          :open="showCreateDialog"
          @update:open="showCreateDialog = $event"
          @create="handleCreate"
        />
      </div>
    </UPageSection>
  </UPage>
</template>

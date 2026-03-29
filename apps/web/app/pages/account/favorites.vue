<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

useSeo({
  title: 'Favorites',
  description: 'Boats you are tracking.',
  ogImage: { title: 'Favorites', description: 'Boats you are tracking.', icon: '⛵' },
})
useWebPageSchema({
  name: 'Favorites',
  description: 'Boats you are tracking.',
})

const { data, status, remove } = useFavoritesList()

const deleteOpen = ref(false)
const pendingBoatId = ref<number | null>(null)

function askRemove(boatId: number) {
  pendingBoatId.value = boatId
  deleteOpen.value = true
}

async function confirmRemove() {
  if (pendingBoatId.value != null) await remove(pendingBoatId.value)
  deleteOpen.value = false
  pendingBoatId.value = null
}
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-2xl font-bold text-default">Favorites</h1>
      <p class="mt-1 text-muted max-w-2xl">Listings you have saved for quick access.</p>

      <div v-if="status === 'pending'" class="flex justify-center py-16">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
      </div>
      <div v-else-if="!data?.favorites?.length" class="mt-8 text-center py-12 card-base rounded-xl">
        <UIcon name="i-lucide-heart" class="size-10 text-dimmed mx-auto" />
        <p class="text-muted mt-3">No favorites yet.</p>
        <UButton class="mt-4" to="/boats-for-sale" label="Browse boats" icon="i-lucide-search" />
      </div>
      <div v-else class="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <template v-for="f in data.favorites" :key="f.boatId">
          <div v-if="f.boat" class="relative group">
            <BoatListingCard :boat="f.boat" />
            <div class="absolute top-2 right-2">
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="solid"
                size="xs"
                square
                class="opacity-90"
                @click="askRemove(f.boatId)"
              />
            </div>
          </div>
          <UCard v-else class="card-base border-default p-4">
            <p class="text-sm text-muted">Listing #{{ f.boatId }} is no longer available.</p>
            <UButton
              class="mt-3"
              size="sm"
              label="Remove"
              color="neutral"
              @click="askRemove(f.boatId)"
            />
          </UCard>
        </template>
      </div>
    </UPageSection>

    <AppConfirmModal
      v-model="deleteOpen"
      title="Remove favorite?"
      message="You can add this boat again from its listing page."
      confirm-label="Remove"
      confirm-color="error"
      @confirm="confirmRemove"
    />
  </UPage>
</template>

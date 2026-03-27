<script setup lang="ts">
definePageMeta({
  layout: 'wide',
})

useSeo({
  title: 'Search Boats',
  description:
    'Filter boats by make, price, and length. Save searches and get in-app alerts when new listings match.',
  ogImage: {
    title: 'Search boats',
    description: 'Structured filters across aggregated listings.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Search boats',
  description: 'Boat Search results with filters by make, price, and length.',
})

const route = useRoute()
const session = useUserSession()
const toast = useToast()
const { save } = useSaveSearch()

const {
  boats,
  status,
  makeFilter,
  minPrice,
  maxPrice,
  minLength,
  maxLength,
  applyFilters,
  clearFilters,
  hasActiveFilters,
  filterPayload,
} = useBoatSearchPage()

const saveOpen = ref(false)
const saveName = ref('')
const saveFrequency = ref<'instant' | 'daily' | 'weekly'>('daily')
const saveSubmitting = ref(false)

const frequencyItems = [
  { label: 'Daily digest', value: 'daily' as const },
  { label: 'Weekly summary', value: 'weekly' as const },
  { label: 'Instant (new matches)', value: 'instant' as const },
]

function openSaveModal() {
  if (!session.loggedIn.value) {
    navigateTo({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  const hint = makeFilter.value?.trim() || 'search'
  saveName.value = `My ${hint}`.slice(0, 120)
  saveFrequency.value = 'daily'
  saveOpen.value = true
}

async function confirmSaveSearch() {
  const name = saveName.value.trim()
  if (!name) {
    toast.add({
      title: 'Name required',
      description: 'Give this search a short name.',
      color: 'warning',
    })
    return
  }
  saveSubmitting.value = true
  try {
    await save(name, filterPayload.value, saveFrequency.value)
    toast.add({
      title: 'Search saved',
      description: 'Manage alerts under Account → Saved searches.',
      color: 'success',
    })
    saveOpen.value = false
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    toast.add({
      title: 'Could not save',
      description: err.data?.statusMessage || err.message || 'Try again.',
      color: 'error',
    })
  } finally {
    saveSubmitting.value = false
  }
}
</script>

<template>
  <UPage>
    <UPageSection :ui="{ wrapper: 'py-4' }">
      <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-default">Search boats</h1>
          <p class="text-muted mt-1 max-w-2xl">
            Use filters to narrow inventory. Save a search to get in-app alerts when new listings
            match your criteria.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="hasActiveFilters"
            label="Clear filters"
            color="neutral"
            variant="soft"
            @click="clearFilters"
          />
          <UButton
            label="Save search"
            color="neutral"
            variant="outline"
            icon="i-lucide-bookmark"
            @click="openSaveModal"
          />
        </div>
      </div>
    </UPageSection>

    <UPageSection :ui="{ wrapper: 'py-4' }">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <UFormField label="Make" class="lg:col-span-2">
          <UInput
            v-model="makeFilter"
            placeholder="e.g. Boston Whaler"
            icon="i-lucide-search"
            class="w-full"
            @keyup.enter="applyFilters"
          />
        </UFormField>
        <UFormField label="Min price">
          <UInput
            v-model.number="minPrice"
            type="number"
            placeholder="0"
            class="w-full"
            @keyup.enter="applyFilters"
          />
        </UFormField>
        <UFormField label="Max price">
          <UInput
            v-model.number="maxPrice"
            type="number"
            placeholder="No max"
            class="w-full"
            @keyup.enter="applyFilters"
          />
        </UFormField>
        <UButton label="Apply" icon="i-lucide-filter" class="w-full" @click="applyFilters" />
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 items-end">
        <UFormField label="Min length (ft)">
          <UInput
            v-model.number="minLength"
            type="number"
            class="w-full"
            @keyup.enter="applyFilters"
          />
        </UFormField>
        <UFormField label="Max length (ft)">
          <UInput
            v-model.number="maxLength"
            type="number"
            class="w-full"
            @keyup.enter="applyFilters"
          />
        </UFormField>
      </div>
    </UPageSection>

    <UPageSection :ui="{ wrapper: 'py-6' }">
      <div v-if="status === 'pending'" class="text-center py-12">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
        <p class="text-muted mt-2">Loading boats...</p>
      </div>
      <div v-else-if="boats && boats.length > 0">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold text-default">{{ boats.length }} boats</h2>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <BoatListingCard v-for="boat in boats" :key="boat.id" :boat="boat" />
        </div>
      </div>
      <div v-else class="text-center py-12">
        <UIcon name="i-lucide-ship" class="text-5xl text-dimmed" />
        <p class="text-lg text-muted mt-4">No boats match these filters</p>
        <UButton
          class="mt-4"
          label="Clear filters"
          color="neutral"
          variant="soft"
          @click="clearFilters"
        />
      </div>
    </UPageSection>

    <UModal v-model:open="saveOpen">
      <template #content>
        <div class="p-6 space-y-4">
          <div>
            <h3 class="font-semibold text-default text-lg">Save search</h3>
            <p class="mt-1 text-sm text-muted">
              We will notify you in-app when listings match these filters (see cron / alerts
              rollout).
            </p>
          </div>
          <UFormField label="Name">
            <UInput v-model="saveName" class="w-full" placeholder="e.g. My Boston Whaler search" />
          </UFormField>
          <UFormField label="Alert frequency">
            <USelectMenu
              v-model="saveFrequency"
              :items="frequencyItems"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              color="neutral"
              variant="soft"
              label="Cancel"
              :disabled="saveSubmitting"
              @click="saveOpen = false"
            />
            <UButton
              color="primary"
              label="Save"
              icon="i-lucide-bookmark"
              :loading="saveSubmitting"
              :disabled="saveSubmitting"
              @click="confirmSaveSearch"
            />
          </div>
        </div>
      </template>
    </UModal>
  </UPage>
</template>

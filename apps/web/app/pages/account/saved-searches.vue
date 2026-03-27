<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

useSeo({
  title: 'Saved searches',
  description: 'Manage saved criteria and alert frequency.',
  ogImage: {
    title: 'Saved searches',
    description: 'Manage saved criteria and alert frequency.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Saved searches',
  description: 'Manage saved criteria and alert frequency.',
})

const { data, status, setPaused, setFrequency, remove } = useSavedSearchesList()

const deleteOpen = ref(false)
const pendingDeleteId = ref<number | null>(null)

const frequencyItems = [
  { label: 'Daily', value: 'daily' as const },
  { label: 'Weekly', value: 'weekly' as const },
  { label: 'Instant', value: 'instant' as const },
]

function askDelete(id: number) {
  pendingDeleteId.value = id
  deleteOpen.value = true
}

async function confirmDelete() {
  if (pendingDeleteId.value != null) await remove(pendingDeleteId.value)
  deleteOpen.value = false
  pendingDeleteId.value = null
}

function normalizeFrequency(f: string): 'instant' | 'daily' | 'weekly' {
  if (f === 'instant' || f === 'daily' || f === 'weekly') return f
  return 'daily'
}

function coerceFrequency(v: unknown): 'instant' | 'daily' | 'weekly' | undefined {
  if (v === 'instant' || v === 'daily' || v === 'weekly') return v
  if (v && typeof v === 'object' && 'value' in v) {
    const val = (v as { value: unknown }).value
    if (val === 'instant' || val === 'daily' || val === 'weekly') return val
  }
  return undefined
}

function onRowFrequencyChange(rowId: number, v: unknown) {
  const f = coerceFrequency(v)
  if (f) void setFrequency(rowId, f)
}

function formatFilterSummary(f: Record<string, unknown>): string {
  const parts: string[] = []
  if (typeof f.make === 'string' && f.make.trim()) parts.push(`Make ${f.make.trim()}`)
  for (const key of ['minPrice', 'maxPrice', 'minLength', 'maxLength'] as const) {
    const v = f[key]
    if (v == null || v === '') continue
    const label =
      key === 'minPrice'
        ? 'Min $'
        : key === 'maxPrice'
          ? 'Max $'
          : key === 'minLength'
            ? 'Min ft'
            : 'Max ft'
    parts.push(`${label} ${String(v)}`)
  }
  return parts.length ? parts.join(' · ') : 'Any boat'
}
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-default">Saved searches</h1>
          <p class="mt-1 text-muted max-w-2xl">
            Run a saved search anytime, pause alerts, or change how often we check for new matches.
          </p>
        </div>
        <UButton to="/search" label="New search" icon="i-lucide-search" color="primary" />
      </div>

      <div v-if="status === 'pending'" class="flex justify-center py-16">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
      </div>
      <div
        v-else-if="!data?.savedSearches?.length"
        class="mt-8 text-center py-12 card-base rounded-xl"
      >
        <UIcon name="i-lucide-bookmark" class="size-10 text-dimmed mx-auto" />
        <p class="text-muted mt-3">No saved searches yet.</p>
        <UButton class="mt-4" to="/search" label="Go to search" icon="i-lucide-search" />
      </div>
      <div v-else class="mt-8 space-y-4">
        <UCard
          v-for="row in data.savedSearches"
          :key="row.id"
          class="card-base border-default"
          :ui="{ body: 'p-4 sm:p-5 space-y-4' }"
        >
          <div class="flex flex-col lg:flex-row lg:items-start gap-4 lg:justify-between">
            <div class="min-w-0 flex-1">
              <h2 class="font-semibold text-default text-lg">{{ row.name }}</h2>
              <p class="text-sm text-muted mt-1">{{ formatFilterSummary(row.filter) }}</p>
              <p v-if="row.lastNotifiedAt" class="text-xs text-dimmed mt-2">
                Last notified {{ new Date(row.lastNotifiedAt).toLocaleString() }}
              </p>
            </div>
            <div class="flex flex-wrap gap-2 lg:shrink-0">
              <UButton
                :to="{ path: '/search', query: savedSearchFilterToQuery(row.filter) }"
                label="Run search"
                icon="i-lucide-play"
                size="sm"
                color="primary"
                variant="soft"
              />
              <UButton
                :label="row.paused ? 'Resume' : 'Pause'"
                :icon="row.paused ? 'i-lucide-play' : 'i-lucide-pause'"
                size="sm"
                color="neutral"
                variant="outline"
                @click="setPaused(row.id, !row.paused)"
              />
              <UButton
                label="Delete"
                icon="i-lucide-trash-2"
                size="sm"
                color="error"
                variant="ghost"
                @click="askDelete(row.id)"
              />
            </div>
          </div>
          <div class="flex flex-col sm:flex-row sm:items-center gap-2">
            <span class="text-sm text-muted shrink-0">Alert frequency</span>
            <USelectMenu
              :model-value="normalizeFrequency(row.frequency)"
              :items="frequencyItems"
              value-key="value"
              label-key="label"
              class="w-full sm:max-w-xs"
              @update:model-value="(v: unknown) => onRowFrequencyChange(row.id, v)"
            />
          </div>
        </UCard>
      </div>
    </UPageSection>

    <AppConfirmModal
      v-model="deleteOpen"
      title="Delete saved search?"
      message="You can create a new saved search from Search at any time."
      confirm-label="Delete"
      confirm-color="error"
      @confirm="confirmDelete"
    />
  </UPage>
</template>

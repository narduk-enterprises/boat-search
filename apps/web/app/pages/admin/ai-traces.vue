<script setup lang="ts">
import type { AiTraceEntry } from '~~/app/composables/useAdminAiTraces'

definePageMeta({ middleware: ['admin'] })

useSeo({
  title: 'AI Trace Inspector',
  description:
    'Inspect AI recommendation request and response lifecycle data including prompts, tokens, model selection and errors.',
  ogImage: {
    title: 'AI Trace Inspector',
    description: 'Debug and monitor AI recommendation traces.',
    icon: '🧠',
  },
})
useWebPageSchema({
  name: 'AI Trace Inspector',
  description:
    'Protected admin tool for inspecting AI recommendation traces and debugging prompt lifecycle.',
})

const { data, status } = useAdminAiTraces()

const selectedTrace = ref<AiTraceEntry | null>(null)
const slideoverOpen = ref(false)

// ── Filters ──────────────────────────────────────────────────
const statusFilter = ref<string>('all')
const modelFilter = ref<string>('all')
const userFilter = ref<string>('')
const sortField = ref<string>('attemptedAt')
const sortDirection = ref<'asc' | 'desc'>('desc')

const traces = computed(() => data.value?.traces ?? [])
const stats = computed(() => data.value?.stats ?? null)

const uniqueModels = computed(() => {
  const models = new Set(traces.value.map((t) => t.model).filter(Boolean))
  return [...models].sort() as string[]
})

const modelFilterItems = computed(() => [
  { label: 'All models', value: 'all' },
  ...uniqueModels.value.map((m) => ({ label: m, value: m })),
])

const statusFilterItems = [
  { label: 'All statuses', value: 'all' },
  { label: 'Success', value: 'success' },
  { label: 'Parse failed', value: 'parse-failed' },
  { label: 'Request failed', value: 'request-failed' },
]

const sortFieldItems = [
  { label: 'Time', value: 'attemptedAt' },
  { label: 'User', value: 'userEmail' },
  { label: 'Tokens', value: 'tokensUsed' },
  { label: 'Candidates', value: 'candidateCount' },
  { label: 'Recommendations', value: 'recommendationCount' },
]

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

const filteredTraces = computed(() => {
  let result = traces.value

  if (statusFilter.value !== 'all') {
    result = result.filter((t) => t.status === statusFilter.value)
  }

  if (modelFilter.value !== 'all') {
    result = result.filter((t) => t.model === modelFilter.value)
  }

  if (userFilter.value.trim()) {
    const query = userFilter.value.trim().toLowerCase()
    result = result.filter(
      (t) =>
        t.userEmail.toLowerCase().includes(query) ||
        (t.buyerProfileName && t.buyerProfileName.toLowerCase().includes(query)),
    )
  }

  const field = sortField.value as keyof AiTraceEntry
  const dir = sortDirection.value === 'asc' ? 1 : -1
  result = [...result].sort((a, b) => dir * compareValues(a[field], b[field]))

  return result
})

function toggleSortDirection() {
  sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
}

function clearFilters() {
  statusFilter.value = 'all'
  modelFilter.value = 'all'
  userFilter.value = ''
  sortField.value = 'attemptedAt'
  sortDirection.value = 'desc'
}

const hasActiveFilters = computed(
  () =>
    statusFilter.value !== 'all' ||
    modelFilter.value !== 'all' ||
    userFilter.value.trim() !== '' ||
    sortField.value !== 'attemptedAt' ||
    sortDirection.value !== 'desc',
)

function openTrace(trace: AiTraceEntry) {
  selectedTrace.value = trace
  slideoverOpen.value = true
}

function statusBadgeColor(traceStatus: string) {
  switch (traceStatus) {
    case 'success':
      return 'success'
    case 'parse-failed':
      return 'warning'
    case 'request-failed':
      return 'error'
    default:
      return 'neutral'
  }
}

function formatRelativeTime(iso: string) {
  try {
    const date = new Date(iso)
    const now = Date.now()
    const diff = now - date.getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  } catch {
    return iso
  }
}

function formatTokens(tokens: number | null) {
  if (tokens == null) return '—'
  return tokens.toLocaleString()
}

const columns = [
  { accessorKey: 'attemptedAt' as const, header: 'Time' },
  { accessorKey: 'userEmail' as const, header: 'User' },
  { accessorKey: 'buyerProfileName' as const, header: 'Profile' },
  { accessorKey: 'status' as const, header: 'Status' },
  { accessorKey: 'model' as const, header: 'Model' },
  { accessorKey: 'tokensUsed' as const, header: 'Tokens' },
  { accessorKey: 'candidateCount' as const, header: 'Candidates' },
  { accessorKey: 'recommendationCount' as const, header: 'Recs' },
  { id: 'actions' as const, header: '' },
]
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-2">
          <UBadge color="primary" variant="subtle" label="Admin only" />
          <h1 class="text-3xl font-semibold text-default">AI trace inspector</h1>
          <p class="max-w-3xl text-muted">
            Inspect the full AI request and response lifecycle for every recommendation session —
            prompts, model selection, token usage, and error diagnostics.
          </p>
        </div>

        <div class="flex flex-wrap gap-3">
          <UButton
            to="/admin"
            label="Admin dashboard"
            icon="i-lucide-layout-dashboard"
            color="neutral"
            variant="ghost"
          />
        </div>
      </div>
    </UPageSection>

    <UPageSection :ui="{ container: 'py-4' }">
      <div v-if="status === 'pending'" class="flex justify-center py-20">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
      </div>

      <div v-else-if="!data || !traces.length" class="flex flex-col items-center gap-4 py-20">
        <UIcon name="i-lucide-brain" class="size-12 text-dimmed" />
        <p class="text-muted">
          No AI traces found. Generate a recommendation session to create trace data.
        </p>
      </div>

      <div v-else class="space-y-6">
        <!-- Stats row -->
        <div v-if="stats" class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div class="card-base rounded-xl border border-default p-4 text-center">
            <p class="text-2xl font-bold text-default">{{ stats.totalSessions }}</p>
            <p class="text-xs text-dimmed">Total sessions</p>
          </div>
          <div class="card-base rounded-xl border border-default p-4 text-center">
            <p class="text-2xl font-bold text-default">{{ stats.tracedSessions }}</p>
            <p class="text-xs text-dimmed">With AI trace</p>
          </div>
          <div class="card-base rounded-xl border border-default p-4 text-center">
            <p class="text-2xl font-bold text-success">{{ stats.successCount }}</p>
            <p class="text-xs text-dimmed">Success</p>
          </div>
          <div class="card-base rounded-xl border border-default p-4 text-center">
            <p class="text-2xl font-bold text-warning">{{ stats.parseFailedCount }}</p>
            <p class="text-xs text-dimmed">Parse failed</p>
          </div>
          <div class="card-base rounded-xl border border-default p-4 text-center">
            <p class="text-2xl font-bold text-error">{{ stats.requestFailedCount }}</p>
            <p class="text-xs text-dimmed">Request failed</p>
          </div>
          <div class="card-base rounded-xl border border-default p-4 text-center">
            <p class="text-2xl font-bold text-default">
              {{ stats.totalTokensUsed.toLocaleString() }}
            </p>
            <p class="text-xs text-dimmed">Total tokens</p>
          </div>
        </div>

        <!-- Filter / sort toolbar -->
        <div
          class="flex flex-col gap-3 rounded-xl border border-default bg-elevated p-4 sm:flex-row sm:flex-wrap sm:items-center"
        >
          <UInput
            v-model="userFilter"
            placeholder="Search user or profile…"
            icon="i-lucide-search"
            class="w-full sm:w-56"
          />
          <USelect v-model="statusFilter" :items="statusFilterItems" class="w-full sm:w-40" />
          <USelect v-model="modelFilter" :items="modelFilterItems" class="w-full sm:w-44" />

          <USeparator orientation="vertical" class="hidden h-6 sm:block" />

          <div class="flex items-center gap-2">
            <span class="text-xs text-dimmed">Sort by</span>
            <USelect v-model="sortField" :items="sortFieldItems" class="w-36" />
            <UButton
              :icon="
                sortDirection === 'desc'
                  ? 'i-lucide-arrow-down-wide-narrow'
                  : 'i-lucide-arrow-up-narrow-wide'
              "
              size="sm"
              color="neutral"
              variant="soft"
              @click="toggleSortDirection"
            />
          </div>

          <div class="flex items-center gap-3 sm:ml-auto">
            <UButton
              v-if="hasActiveFilters"
              label="Clear"
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="clearFilters"
            />
            <span class="text-sm text-muted">
              {{ filteredTraces.length }} trace{{ filteredTraces.length === 1 ? '' : 's' }}
            </span>
          </div>
        </div>

        <!-- Traces table -->
        <UTable :data="filteredTraces" :columns="columns" class="rounded-xl border border-default">
          <template #attemptedAt-cell="{ row }">
            <span class="whitespace-nowrap text-sm text-default">
              {{ formatRelativeTime(row.original.attemptedAt) }}
            </span>
          </template>

          <template #userEmail-cell="{ row }">
            <span class="max-w-[160px] truncate text-sm text-default">
              {{ row.original.userEmail }}
            </span>
          </template>

          <template #buyerProfileName-cell="{ row }">
            <span class="max-w-[140px] truncate text-sm text-muted">
              {{ row.original.buyerProfileName || '—' }}
            </span>
          </template>

          <template #status-cell="{ row }">
            <UBadge
              :color="statusBadgeColor(row.original.status)"
              :label="row.original.status"
              variant="subtle"
              size="xs"
            />
          </template>

          <template #model-cell="{ row }">
            <span class="whitespace-nowrap font-mono text-xs text-muted">
              {{ row.original.model || '—' }}
            </span>
          </template>

          <template #tokensUsed-cell="{ row }">
            <span class="font-mono text-sm text-default">
              {{ formatTokens(row.original.tokensUsed) }}
            </span>
          </template>

          <template #candidateCount-cell="{ row }">
            <span class="text-sm text-default">{{ row.original.candidateCount }}</span>
          </template>

          <template #recommendationCount-cell="{ row }">
            <span class="text-sm text-default">{{ row.original.recommendationCount }}</span>
          </template>

          <template #actions-cell="{ row }">
            <UButton
              icon="i-lucide-scan-eye"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="openTrace(row.original)"
            />
          </template>
        </UTable>
      </div>
    </UPageSection>

    <!-- Detail slideover -->
    <USlideover
      v-model:open="slideoverOpen"
      title="AI Trace Detail"
      description="Full request and response lifecycle for this recommendation run."
      class="sm:max-w-2xl"
    >
      <template #body>
        <AdminAiTraceDetailPanel v-if="selectedTrace" :trace="selectedTrace" />
      </template>
    </USlideover>
  </UPage>
</template>

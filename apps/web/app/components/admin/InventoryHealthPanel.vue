<script setup lang="ts">
interface InventoryHealthResponse {
  overview: {
    totalBoats: number
    staleBoats: number
    freshBoats: number
    failedCrawls: number
    partialCrawls: number
    lastUpdatedAt: string | null
    lastScrapedAt: string | null
  }
  sources: {
    source: string
    count: number
    latestUpdatedAt: string | null
    mapReadyBoats: number
    pendingBoats: number
    ambiguousBoats: number
    skippedBoats: number
    failedBoats: number
  }[]
  geoCoverage: {
    mapReadyBoats: number
    pendingBoats: number
    ambiguousBoats: number
    skippedBoats: number
    failedBoats: number
    lastGeocodedAt: string | null
    normalizationIssues: {
      issue: string
      count: number
    }[]
  }
  recentCrawls: {
    id: number
    searchUrl: string
    status: string
    boatsFound: number | null
    boatsScraped: number | null
    startedAt: string
    completedAt: string | null
    error: string | null
  }[]
}

const props = defineProps<{
  data: InventoryHealthResponse
}>()

function formatDate(value: string | null) {
  if (!value) return 'N/A'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatPercent(value: number, total: number) {
  if (total <= 0) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

function formatIssueLabel(issue: string) {
  return issue
    .split('_')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <UCard
        v-for="card in [
          {
            label: 'Fresh boats',
            value: props.data.overview.freshBoats,
            detail: `of ${props.data.overview.totalBoats} total listings`,
          },
          {
            label: 'Stale boats',
            value: props.data.overview.staleBoats,
            detail: 'Older than 7 days by updated_at',
          },
          {
            label: 'Recent crawl issues',
            value: props.data.overview.failedCrawls + props.data.overview.partialCrawls,
            detail: `${props.data.overview.failedCrawls} failed / ${props.data.overview.partialCrawls} partial`,
          },
        ]"
        :key="card.label"
        class="card-base border-default"
      >
        <div class="space-y-2">
          <p class="text-sm text-dimmed">{{ card.label }}</p>
          <p class="text-3xl font-semibold text-default">{{ card.value }}</p>
          <p class="text-sm text-muted">{{ card.detail }}</p>
        </div>
      </UCard>
    </div>

    <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-4' }">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold text-default">Inventory freshness</h2>
        <p class="text-sm text-muted">
          Last boat update: {{ formatDate(props.data.overview.lastUpdatedAt) }}. Last scrape event:
          {{ formatDate(props.data.overview.lastScrapedAt) }}.
        </p>
      </div>

      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div
          v-for="source in props.data.sources"
          :key="source.source"
          class="rounded-xl bg-muted px-4 py-3"
        >
          <p class="text-sm font-semibold text-default">{{ source.source }}</p>
          <p class="mt-2 text-2xl font-semibold text-default">{{ source.count }}</p>
          <p class="mt-1 text-xs text-muted">
            Latest update {{ formatDate(source.latestUpdatedAt) }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Map-ready {{ source.mapReadyBoats }} ·
            {{ formatPercent(source.mapReadyBoats, source.count) }}
          </p>
        </div>
      </div>
    </UCard>

    <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-4' }">
      <div class="flex flex-col gap-1">
        <h2 class="text-lg font-semibold text-default">Geo coverage</h2>
        <p class="text-sm text-muted">
          City-level normalization and Apple geocoding readiness for the future map experience. Last
          geocode refresh: {{ formatDate(props.data.geoCoverage.lastGeocodedAt) }}.
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <UCard
          v-for="card in [
            {
              label: 'Map-ready',
              value: props.data.geoCoverage.mapReadyBoats,
              detail: formatPercent(
                props.data.geoCoverage.mapReadyBoats,
                props.data.overview.totalBoats,
              ),
            },
            {
              label: 'Pending',
              value: props.data.geoCoverage.pendingBoats,
              detail: 'Normalized, awaiting resolution',
            },
            {
              label: 'Ambiguous',
              value: props.data.geoCoverage.ambiguousBoats,
              detail: 'Multiple plausible geocode hits',
            },
            {
              label: 'Skipped',
              value: props.data.geoCoverage.skippedBoats,
              detail: 'Missing confident city/state',
            },
            {
              label: 'Failed',
              value: props.data.geoCoverage.failedBoats,
              detail: 'Provider or match failures',
            },
          ]"
          :key="card.label"
          class="card-base border-default"
        >
          <div class="space-y-2">
            <p class="text-sm text-dimmed">{{ card.label }}</p>
            <p class="text-3xl font-semibold text-default">{{ card.value }}</p>
            <p class="text-sm text-muted">{{ card.detail }}</p>
          </div>
        </UCard>
      </div>

      <div class="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div class="space-y-3">
          <p class="text-sm font-semibold text-default">Source geo coverage</p>
          <div class="space-y-3">
            <div
              v-for="source in props.data.sources"
              :key="`${source.source}-geo`"
              class="rounded-xl border border-default px-4 py-3"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold text-default">{{ source.source }}</p>
                <UBadge
                  :label="`${source.mapReadyBoats}/${source.count} map-ready`"
                  color="neutral"
                  variant="soft"
                />
              </div>
              <div class="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                <span>Pending {{ source.pendingBoats }}</span>
                <span>Ambiguous {{ source.ambiguousBoats }}</span>
                <span>Skipped {{ source.skippedBoats }}</span>
                <span>Failed {{ source.failedBoats }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <p class="text-sm font-semibold text-default">Top normalization issues</p>
          <div v-if="props.data.geoCoverage.normalizationIssues.length" class="space-y-3">
            <div
              v-for="issue in props.data.geoCoverage.normalizationIssues"
              :key="issue.issue"
              class="rounded-xl bg-muted px-4 py-3"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="text-sm font-semibold text-default">
                  {{ formatIssueLabel(issue.issue) }}
                </p>
                <UBadge :label="String(issue.count)" color="warning" variant="soft" />
              </div>
            </div>
          </div>
          <div v-else class="rounded-xl bg-muted px-4 py-3 text-sm text-muted">
            No normalization issues detected in active inventory.
          </div>
        </div>
      </div>
    </UCard>

    <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-4' }">
      <div>
        <h2 class="text-lg font-semibold text-default">Recent crawl jobs</h2>
        <p class="text-sm text-muted">
          Use this to spot stale sources or partial inventory refreshes.
        </p>
      </div>

      <div class="space-y-3">
        <div
          v-for="crawl in props.data.recentCrawls"
          :key="crawl.id"
          class="rounded-xl border border-default px-4 py-4 space-y-2"
        >
          <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <UBadge
                  :label="crawl.status"
                  :color="crawl.status === 'completed' ? 'success' : 'warning'"
                  variant="subtle"
                />
                <span class="text-sm text-dimmed">Job #{{ crawl.id }}</span>
              </div>
              <p class="text-sm text-default break-all">{{ crawl.searchUrl }}</p>
            </div>
            <div class="text-sm text-muted lg:text-right">
              <p>Started {{ formatDate(crawl.startedAt) }}</p>
              <p>Completed {{ formatDate(crawl.completedAt) }}</p>
            </div>
          </div>

          <div class="flex flex-wrap gap-4 text-sm text-muted">
            <span>Found {{ crawl.boatsFound ?? 0 }}</span>
            <span>Scraped {{ crawl.boatsScraped ?? 0 }}</span>
          </div>

          <p v-if="crawl.error" class="text-sm text-warning">
            {{ crawl.error }}
          </p>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { ScraperPipelineRecord, ScraperRunSummary } from '~~/lib/scraperPipeline'

const props = defineProps<{
  pipeline: ScraperPipelineRecord | null
  previewSummary: ScraperRunSummary | null
  runSummary: ScraperRunSummary | null
  runningJobId: number | null
}>()

const activeSummary = computed(() => props.runSummary || props.previewSummary)
</script>

<template>
  <div class="space-y-6">
    <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-4' }">
      <div class="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 class="text-xl font-semibold text-default">Run visibility</h2>
          <p class="mt-1 text-sm text-muted">
            Preview results stay local to the editor. A pipeline run writes boats directly into D1
            and lands in inventory health.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UBadge
            :label="props.pipeline?.active ? 'Active' : 'Draft only'"
            :color="props.pipeline?.active ? 'success' : 'warning'"
            variant="subtle"
          />
          <UBadge
            v-if="props.runningJobId"
            :label="`Last job #${props.runningJobId}`"
            color="neutral"
            variant="soft"
          />
        </div>
      </div>

      <div v-if="activeSummary" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <UCard
          v-for="card in [
            { label: 'Pages visited', value: activeSummary.pagesVisited },
            { label: 'Items seen', value: activeSummary.itemsSeen },
            { label: 'Candidates extracted', value: activeSummary.itemsExtracted },
            { label: 'Skipped existing', value: activeSummary.skippedExisting },
            { label: 'Inserted', value: activeSummary.inserted },
            { label: 'Updated', value: activeSummary.updated },
            { label: 'Warnings', value: activeSummary.warnings.length },
          ]"
          :key="card.label"
          class="border-default bg-elevated/50"
        >
          <p class="text-sm text-dimmed">{{ card.label }}</p>
          <p class="mt-2 text-3xl font-semibold text-default">{{ card.value }}</p>
        </UCard>
      </div>

      <div v-else class="rounded-2xl border border-dashed border-default px-5 py-10 text-center">
        <p class="text-sm text-muted">
          Run a preview to see extraction output before you ingest anything.
        </p>
      </div>
    </UCard>

    <UCard
      v-if="activeSummary?.warnings.length"
      class="card-base border-default"
      :ui="{ body: 'p-5 space-y-3' }"
    >
      <div>
        <h3 class="text-lg font-semibold text-default">Warnings</h3>
        <p class="mt-1 text-sm text-muted">
          These are strong signals that a selector drifted or the upstream page changed shape.
        </p>
      </div>

      <ul class="space-y-2">
        <li
          v-for="warning in activeSummary.warnings"
          :key="warning"
          class="rounded-xl bg-warning/10 px-4 py-3 text-sm text-default"
        >
          {{ warning }}
        </li>
      </ul>
    </UCard>

    <UCard
      v-if="activeSummary?.records.length"
      class="card-base border-default"
      :ui="{ body: 'p-5 space-y-4' }"
    >
      <div>
        <h3 class="text-lg font-semibold text-default">Sample records</h3>
        <p class="mt-1 text-sm text-muted">
          A quick gut-check of normalized records before you trust the full pipeline.
        </p>
      </div>

      <div class="space-y-4">
        <div
          v-for="(record, index) in activeSummary.records.slice(0, 8)"
          :key="`${record.url || 'record'}-${index}`"
          class="rounded-2xl border border-default px-4 py-4 space-y-3"
        >
          <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p class="font-semibold text-default">
                {{
                  record.title || `${record.make || 'Unknown make'} ${record.model || ''}`.trim()
                }}
              </p>
              <p class="text-sm text-muted break-all">{{ record.url || 'No URL extracted' }}</p>
            </div>
            <UBadge
              :label="record.price ? `$${Number(record.price).toLocaleString()}` : 'No price'"
              color="neutral"
              variant="subtle"
            />
          </div>

          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
            <div class="rounded-xl bg-elevated px-3 py-2">
              <p class="text-dimmed">Listing ID</p>
              <p class="mt-1 text-default">{{ record.listingId || 'N/A' }}</p>
            </div>
            <div class="rounded-xl bg-elevated px-3 py-2">
              <p class="text-dimmed">Year</p>
              <p class="mt-1 text-default">{{ record.year || 'N/A' }}</p>
            </div>
            <div class="rounded-xl bg-elevated px-3 py-2">
              <p class="text-dimmed">Location</p>
              <p class="mt-1 text-default">{{ record.location || 'N/A' }}</p>
            </div>
            <div class="rounded-xl bg-elevated px-3 py-2">
              <p class="text-dimmed">Images</p>
              <p class="mt-1 text-default">{{ record.images.length }}</p>
            </div>
          </div>

          <p v-if="record.description" class="text-sm text-muted line-clamp-3">
            {{ record.description }}
          </p>
        </div>
      </div>
    </UCard>

    <ScraperPipelineRunAudit :job-id="props.runningJobId" />
  </div>
</template>

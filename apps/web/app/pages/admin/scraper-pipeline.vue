<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

useSeo({
  title: 'Scraper Pipeline Builder',
  description:
    'Configure selector-driven ingestion pipelines, preview extraction, and write new boat inventory directly into the product.',
  ogImage: {
    title: 'Scraper Pipeline Builder',
    description: 'Admin pipeline editor for Boat Search.',
    icon: '🛠️',
  },
})
useWebPageSchema({
  name: 'Scraper Pipeline Builder',
  description: 'Admin tooling for selector-based boat inventory ingestion.',
})

const scraperPipelines = useAdminScraperPipelines()
</script>

<template>
  <UPage>
    <UPageSection>
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-2">
          <UBadge color="primary" variant="subtle" label="Admin only" />
          <h1 class="text-3xl font-semibold text-default">Scraper pipeline builder</h1>
          <p class="max-w-3xl text-muted">
            This is the first-party ingestion surface for Boat Search. Model the site structure,
            preview selectors, and write directly into the inventory pipeline without leaving the
            product.
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
          <UButton
            to="/admin/inventory"
            label="Inventory health"
            icon="i-lucide-activity"
            color="neutral"
            variant="soft"
          />
        </div>
      </div>
    </UPageSection>

    <UPageSection>
      <div
        v-if="scraperPipelines.status.value === 'pending'"
        class="flex items-center justify-center py-24"
      >
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
      </div>

      <div v-else class="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <ScraperPipelineEditor
          v-model="scraperPipelines.draft"
          :pipeline-items="scraperPipelines.pipelineItems"
          :selected-pipeline-id="scraperPipelines.selectedPipelineId"
          :saving="scraperPipelines.saving"
          :previewing="scraperPipelines.previewing"
          :running="scraperPipelines.running"
          @select-pipeline="scraperPipelines.selectPipeline"
          @create-new-pipeline="scraperPipelines.createNewPipeline"
          @add-field-rule="scraperPipelines.addFieldRule"
          @duplicate-field-rule="scraperPipelines.duplicateFieldRule"
          @remove-field-rule="scraperPipelines.removeFieldRule"
          @preview="scraperPipelines.previewDraft"
          @save="scraperPipelines.persistDraft"
          @run="scraperPipelines.runPipeline"
        />

        <ScraperPipelineResults
          :pipeline="scraperPipelines.selectedPipeline"
          :preview-summary="scraperPipelines.previewSummary"
          :run-summary="scraperPipelines.runSummary"
          :running-job-id="scraperPipelines.runningJobId"
        />
      </div>
    </UPageSection>
  </UPage>
</template>

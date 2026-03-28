<script setup lang="ts">
import { computed, onMounted } from 'vue'
import FieldRuleList from './components/FieldRuleList.vue'
import WorkflowStepCard from './components/WorkflowStepCard.vue'
import { useExtensionSession } from './composables/useExtensionSession'
import type { ScraperFieldRule } from '@/shared/types'

type WorkflowStatus = 'active' | 'complete' | 'upcoming' | 'ready'

const extension = useExtensionSession()

function inferPageTypeFromUrl(url: string | null) {
  if (!url) {
    return 'unknown'
  }

  try {
    const pathname = new URL(url).pathname
    if (/\/yacht\//i.test(pathname)) {
      return 'detail'
    }
    if (/\/boats-for-sale\//i.test(pathname)) {
      return 'search'
    }
  } catch {
    return 'unknown'
  }

  return 'unknown'
}

function formatFieldName(key: ScraperFieldRule['key']) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase())
}

const draft = computed(() => extension.session.value.draft)
const analysis = computed(() => extension.session.value.lastAnalysis)
const analysisWarnings = computed(() => analysis.value?.warnings ?? [])

const startUrlsText = computed({
  get: () => draft.value.config.startUrls.join('\n'),
  set: (value: string) => {
    draft.value.config.startUrls = value
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
  },
})

const allowedDomainsText = computed({
  get: () => draft.value.config.allowedDomains.join('\n'),
  set: (value: string) => {
    draft.value.config.allowedDomains = value
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
  },
})

const itemFieldCount = computed(
  () => extension.itemFields.value.filter((field) => field.selector.trim()).length,
)
const detailFieldCount = computed(
  () => extension.detailFields.value.filter((field) => field.selector.trim()).length,
)

const isDetailStage = computed(() => extension.session.value.stage === 'detail')
const hasSearchAnalysis = computed(
  () => analysis.value?.pageType === 'search' || draft.value.config.startUrls.length > 0,
)
const hasItemSelector = computed(() => Boolean(draft.value.config.itemSelector.trim()))
const hasSearchFields = computed(() => itemFieldCount.value > 0)
const paginationConfigured = computed(
  () => Boolean(draft.value.config.nextPageSelector.trim()) || draft.value.config.maxPages === 1,
)
const hasSampleDetail = computed(() => Boolean(extension.session.value.sampleDetailUrl))
const hasDetailAnalysis = computed(() => analysis.value?.pageType === 'detail')
const hasDetailFields = computed(() => detailFieldCount.value > 0)
const itemSelectorTraining = computed(() => extension.itemSelectorTraining.value)
const itemSelectorPreview = computed(() => extension.itemSelectorPreview.value)
const remoteRun = computed(() => extension.remoteRun.value)
const browserRunProgress = computed(() => extension.browserRunProgress.value)
const startingRemoteRun = computed(() => extension.startingRemoteRun.value)
const detectedCardCount = computed(
  () => itemSelectorPreview.value?.matchCount || itemSelectorTraining.value?.matchCount || 0,
)
const selectedExampleCount = computed(() => itemSelectorTraining.value?.selectionCount || 0)
const itemSelectorPreviewActive = computed(() => Boolean(itemSelectorPreview.value?.active))
const currentTabPageType = computed(() => inferPageTypeFromUrl(extension.session.value.currentTabUrl))
const detailContextReady = computed(() => currentTabPageType.value === 'detail')
const detailFieldLabels = computed(() =>
  extension.detailFields.value
    .filter((field) => field.selector.trim())
    .map((field) => formatFieldName(field.key)),
)

const exportGaps = computed(() => {
  const gaps: string[] = []

  if (!draft.value.name.trim()) gaps.push('pipeline name')
  if (!draft.value.boatSource.trim()) gaps.push('source name')
  if (!draft.value.config.startUrls.length) gaps.push('start URL')
  if (!hasItemSelector.value) gaps.push('listing card selector')
  if (!hasSearchFields.value) gaps.push('reviewed search fields')
  if (!hasDetailFields.value) gaps.push('reviewed detail fields')

  return gaps
})

const exportReady = computed(() => exportGaps.value.length === 0)

function statusLabel(status: WorkflowStatus) {
  switch (status) {
    case 'complete':
      return 'Done'
    case 'ready':
      return 'Ready'
    case 'active':
      return 'Do this now'
    default:
      return 'Coming up'
  }
}

const workflowSteps = computed(() => {
  const steps = [
    {
      id: 'scan-search',
      step: 1,
      title: 'Scan the search page',
      status: hasSearchAnalysis.value ? 'complete' : 'active',
      note: hasSearchAnalysis.value
        ? `Detected ${analysis.value?.pageType ?? 'search'} page on ${analysis.value?.siteName ?? 'this site'}.`
        : 'Start on a YachtWorld results page and let the helper read the DOM first.',
    },
    {
      id: 'listing-card',
      step: 2,
      title: 'Confirm the listing card',
      status: !hasSearchAnalysis.value
        ? 'upcoming'
        : hasItemSelector.value
          ? 'complete'
          : 'active',
      note: hasItemSelector.value
        ? `${draft.value.config.itemSelector}${detectedCardCount.value ? ` · ${detectedCardCount.value} cards on this page` : ''}`
        : 'Pick two result cards so every listing-level selector stays anchored to the full result set.',
    },
    {
      id: 'search-fields',
      step: 3,
      title: 'Review search fields',
      status: !hasItemSelector.value
        ? 'upcoming'
        : hasSearchFields.value
          ? 'complete'
          : 'active',
      note: hasSearchFields.value
        ? `${itemFieldCount.value} search field${itemFieldCount.value === 1 ? '' : 's'} captured.`
        : 'Confirm the title, URL, price, location, and any other fields scraped from the result card.',
    },
    {
      id: 'pagination',
      step: 4,
      title: 'Capture pagination',
      status: !hasSearchFields.value
        ? 'upcoming'
        : paginationConfigured.value
          ? 'complete'
          : 'active',
      note: draft.value.config.nextPageSelector.trim()
        ? draft.value.config.nextPageSelector
        : draft.value.config.maxPages === 1
          ? 'Single-page mode is on.'
          : 'Pick the next-page button or reduce max pages to 1 for single-page searches.',
    },
    {
      id: 'detail-page',
      step: 5,
      title: 'Open and scan a detail page',
      status: !paginationConfigured.value
        ? 'upcoming'
        : hasDetailAnalysis.value
          ? 'complete'
          : 'active',
      note: hasDetailAnalysis.value
        ? analysis.value?.pageUrl || 'Detail page scanned.'
        : extension.session.value.sampleDetailUrl || 'Open a sample listing detail page and run detection again.',
    },
    {
      id: 'detail-fields-export',
      step: 6,
      title: 'Review detail fields and export',
      status: !hasDetailAnalysis.value
        ? 'upcoming'
        : exportReady.value
          ? 'ready'
          : 'active',
      note: exportReady.value
        ? 'The draft looks ready to send into Boat Search.'
        : exportGaps.value.length
          ? `Still needed: ${exportGaps.value.join(', ')}.`
          : 'Finalize the pipeline details and hand the draft to Boat Search.',
    },
  ] as Array<{ id: string; step: number; title: string; status: WorkflowStatus; note: string }>

  return steps.map((step) => ({
    ...step,
    statusLabel: statusLabel(step.status),
  }))
})

const nextAction = computed(() => {
  const nextStep = workflowSteps.value.find((step) => step.status === 'active')
  if (nextStep) {
    return `${nextStep.step}. ${nextStep.title}`
  }

  if (exportReady.value) {
    return 'Send the draft into Boat Search'
  }

  return 'Review the detected selectors and refine anything that looks off'
})

async function pickItemSelector() {
  await extension.startPicker({ kind: 'itemSelector' })
}

async function pickNextPageSelector() {
  await extension.startPicker({ kind: 'nextPageSelector' })
}

async function pickField(field: ScraperFieldRule) {
  await extension.startPicker({
    kind: 'field',
    fieldKey: field.key,
    scope: field.scope,
  })
}

function setSinglePageMode() {
  draft.value.config.maxPages = 1
  draft.value.config.nextPageSelector = ''
}

onMounted(async () => {
  await extension.loadSession()
  await extension.refreshActiveTab()
})
</script>

<template>
  <main class="panel">
    <header class="hero">
      <div class="hero__copy">
        <p class="eyebrow">
          Boat Search
        </p>
        <h1>Scraper setup workflow</h1>
        <p class="lede">
          Walk the page the same way a human would: scan the search results, lock the listing card,
          review fields, capture pagination, then switch to a detail page and export the draft.
        </p>
      </div>

      <div class="hero__metrics">
        <div class="hero-pill">
          <span class="hero-pill__label">Active tab</span>
          <strong>{{ extension.session.value.currentTabUrl || 'No active tab yet' }}</strong>
        </div>
        <div class="hero-pill">
          <span class="hero-pill__label">Detected page</span>
          <strong>{{ analysis?.pageType || 'Not scanned yet' }}</strong>
        </div>
        <div class="hero-pill">
          <span class="hero-pill__label">Sample detail</span>
          <strong>{{ extension.session.value.sampleDetailUrl || 'Not discovered yet' }}</strong>
        </div>
      </div>

      <div class="hero__focus">
        <div>
          <p class="hero__focus-label">
            Next action
          </p>
          <strong class="hero__focus-title">{{ nextAction }}</strong>
          <p class="hero__focus-copy">
            {{ extension.statusMessage.value }}
          </p>
          <p
            v-if="extension.errorMessage.value"
            class="hero__error"
          >
            {{ extension.errorMessage.value }}
          </p>
        </div>

        <div class="hero__actions">
          <button
            type="button"
            @click="extension.analyzeCurrentPage"
          >
            {{ isDetailStage ? 'Re-scan current detail page' : 'Scan current page' }}
          </button>
          <button
            type="button"
            class="secondary"
            @click="extension.resetSession"
          >
            Reset workflow
          </button>
        </div>
      </div>
    </header>

    <section class="workflow-rail">
      <article
        v-for="step in workflowSteps"
        :key="step.id"
        class="workflow-rail__step"
        :class="`workflow-rail__step--${step.status}`"
      >
        <span class="workflow-rail__number">{{ step.step }}</span>
        <div class="workflow-rail__body">
          <strong>{{ step.title }}</strong>
          <span>{{ step.statusLabel }}</span>
        </div>
      </article>
    </section>

    <section
      v-if="analysisWarnings.length"
      class="warning-strip"
    >
      <h2>Review flags</h2>
      <div class="warning-strip__items">
        <span
          v-for="warning in analysisWarnings"
          :key="warning"
          class="warning-pill"
        >
          {{ warning }}
        </span>
      </div>
    </section>

    <WorkflowStepCard
      :step="1"
      title="Scan the search page"
      subtitle="Let the helper inspect the YachtWorld results DOM before you touch any selectors."
      :status="workflowSteps[0]?.status ?? 'active'"
      :note="workflowSteps[0]?.note"
    >
      <template #actions>
        <button
          type="button"
          @click="extension.analyzeCurrentPage"
        >
          Auto-detect this page
        </button>
      </template>

      <div class="metrics-grid metrics-grid--three">
        <div class="metric-card">
          <span>Site</span>
          <strong>{{ analysis?.siteName || 'Not detected yet' }}</strong>
        </div>
        <div class="metric-card">
          <span>Start URLs</span>
          <strong>{{ draft.config.startUrls.length }}</strong>
        </div>
        <div class="metric-card">
          <span>Allowed domains</span>
          <strong>{{ draft.config.allowedDomains.length }}</strong>
        </div>
      </div>
    </WorkflowStepCard>

    <WorkflowStepCard
      :step="2"
      title="Confirm the listing card"
      subtitle="Click two example cards, ideally from different rows, so the helper learns the shared listing container instead of guessing from the first visible block."
      :status="workflowSteps[1]?.status ?? 'upcoming'"
      :note="workflowSteps[1]?.note"
    >
      <template #actions>
        <button
          type="button"
          class="ghost"
          @click="extension.detectItemSelector"
        >
          Run card detection
        </button>
        <button
          type="button"
          class="secondary"
          @click="pickItemSelector"
        >
          Train listing card selector
        </button>
        <button
          v-if="hasItemSelector"
          type="button"
          class="ghost"
          @click="itemSelectorPreviewActive ? extension.clearItemSelectorPreview() : extension.previewItemSelector()"
        >
          {{ itemSelectorPreviewActive ? 'Hide detected cards' : 'Show detected cards' }}
        </button>
        <button
          v-if="hasItemSelector || selectedExampleCount"
          type="button"
          class="danger danger--ghost"
          @click="extension.resetItemSelector"
        >
          Reset card detection
        </button>
      </template>

      <div class="metrics-grid metrics-grid--three">
        <label class="stack">
          <span>Item selector</span>
          <input
            v-model="draft.config.itemSelector"
            type="text"
            placeholder="article.result-card"
          >
        </label>

        <label class="stack">
          <span>Allowed domains</span>
          <textarea
            v-model="allowedDomainsText"
            rows="3"
            placeholder="www.yachtworld.com"
          />
        </label>

        <div class="metric-card">
          <span>Cards on current page</span>
          <strong>{{ detectedCardCount || 'Not checked yet' }}</strong>
          <small v-if="itemSelectorPreview?.error || !hasItemSelector">
            {{ itemSelectorPreview?.error || 'Train a selector, then preview it here.' }}
          </small>
          <small v-else-if="itemSelectorPreviewActive && itemSelectorPreview && itemSelectorPreview.highlightedCount < itemSelectorPreview.matchCount">
            Showing {{ itemSelectorPreview.highlightedCount }} visible cards now. Scroll the page and preview again to spot-check more.
          </small>
          <small v-else-if="selectedExampleCount">
            {{ selectedExampleCount }} example{{ selectedExampleCount === 1 ? '' : 's' }} selected in the current training pass
          </small>
        </div>
      </div>

      <details class="workflow-details">
        <summary>Advanced search source settings</summary>
        <div class="workflow-details__body">
          <label class="stack">
            <span>Start URLs</span>
            <textarea
              v-model="startUrlsText"
              rows="3"
              placeholder="Paste one results page URL per line"
            />
          </label>
        </div>
      </details>
    </WorkflowStepCard>

    <WorkflowStepCard
      :step="3"
      title="Review search fields"
      subtitle="Each mapping can preview live on the page. Hover a card or click Show on page before you edit anything."
      :status="workflowSteps[2]?.status ?? 'upcoming'"
      :note="workflowSteps[2]?.note"
    >
      <FieldRuleList
        v-model="extension.itemFields.value"
        title="Search-page field suggestions"
        subtitle="These are scraped from the result cards before the helper follows any detail links."
        scope="item"
        :pending-picker="extension.pendingPicker.value"
        :preview="extension.fieldPreview.value"
        @pick-field="pickField"
        @add-field="extension.addField"
        @remove-field="(index) => extension.removeField('item', index)"
        @preview-field="extension.previewField"
        @clear-preview="extension.clearFieldPreview"
      />
    </WorkflowStepCard>

    <WorkflowStepCard
      :step="4"
      title="Capture pagination"
      subtitle="Tell the helper how to move through result pages, or lock it to a single page if there is no next button."
      :status="workflowSteps[3]?.status ?? 'upcoming'"
      :note="workflowSteps[3]?.note"
    >
      <template #actions>
        <button
          type="button"
          class="secondary"
          @click="pickNextPageSelector"
        >
          Pick next-page button
        </button>
        <button
          type="button"
          class="ghost"
          @click="setSinglePageMode"
        >
          Use one page only
        </button>
      </template>

      <div class="metrics-grid metrics-grid--two">
        <label class="stack">
          <span>Next-page selector</span>
          <input
            v-model="draft.config.nextPageSelector"
            type="text"
            placeholder="a[rel='next']"
          >
        </label>

        <label class="stack">
          <span>Max pages</span>
          <input
            v-model.number="draft.config.maxPages"
            type="number"
            min="1"
            max="25"
          >
        </label>
      </div>

      <label class="stack stack--inline">
        <span>Max items per run</span>
        <input
          v-model.number="draft.config.maxItemsPerRun"
          type="number"
          min="1"
          max="250"
        >
      </label>
    </WorkflowStepCard>

    <WorkflowStepCard
      :step="5"
      title="Open and scan a detail page"
      subtitle="Open one sample listing and the helper will auto-scan it once it finishes loading. Re-scan manually if you change pages."
      :status="workflowSteps[4]?.status ?? 'upcoming'"
      :note="workflowSteps[4]?.note"
    >
      <template #actions>
        <button
          type="button"
          class="secondary"
          @click="extension.openSampleDetailPage"
        >
          Open and scan sample detail page
        </button>
        <button
          type="button"
          @click="extension.analyzeCurrentPage"
        >
          Re-scan current tab
        </button>
      </template>

      <div class="metrics-grid metrics-grid--three">
        <div class="metric-card">
          <span>Current tab</span>
          <strong>{{ currentTabPageType }}</strong>
        </div>
        <div class="metric-card">
          <span>Sample detail page</span>
          <strong>{{ hasSampleDetail ? 'Ready' : 'Not found yet' }}</strong>
        </div>
        <div class="metric-card">
          <span>Detail fields detected</span>
          <strong>{{ detailFieldCount }}</strong>
        </div>
      </div>

      <p
        v-if="!detailContextReady"
        class="context-note context-note--warning"
      >
        The current tab does not look like a listing detail page yet. Open the sample detail page
        or switch to any <code>/yacht/...</code> listing before you review detail mappings.
      </p>
      <p
        v-else
        class="context-note"
      >
        You are on a listing detail page now. Step 6 previews will run against this page.
      </p>
    </WorkflowStepCard>

    <WorkflowStepCard
      :step="6"
      title="Review detail fields and export"
      subtitle="Preview each detail mapping against the open listing page, then run the scrape in Chrome and upload the finished records into Boat Search."
      :status="workflowSteps[5]?.status ?? 'upcoming'"
      :note="workflowSteps[5]?.note"
    >
      <template #actions>
        <button
          type="button"
          class="secondary"
          @click="extension.analyzeCurrentPage"
        >
          Re-scan current detail page
        </button>
        <button
          type="button"
          :disabled="!exportReady || startingRemoteRun"
          @click="extension.startScrapeInBoatSearch"
        >
          {{ startingRemoteRun ? 'Running browser scrape…' : 'Start browser scrape' }}
        </button>
        <button
          type="button"
          class="secondary"
          :disabled="startingRemoteRun"
          @click="extension.handoffToBoatSearch"
        >
          Open builder
        </button>
      </template>

      <div class="metrics-grid metrics-grid--two">
        <label class="stack">
          <span>Pipeline name</span>
          <input
            v-model="draft.name"
            type="text"
            placeholder="YachtWorld saltwater fishing workflow"
          >
        </label>

        <label class="stack">
          <span>Source name</span>
          <input
            v-model="draft.boatSource"
            type="text"
            placeholder="yachtworld.com"
          >
        </label>
      </div>

      <label class="stack">
        <span>Notes for the Boat Search pipeline</span>
        <textarea
          v-model="draft.description"
          rows="3"
          placeholder="What this search covers, how pagination behaves, or anything that still needs human review."
        />
      </label>

      <div
        class="detail-review-banner"
        :class="{ 'detail-review-banner--warning': !detailContextReady }"
      >
        <strong>
          {{ detailContextReady ? 'Reviewing the open detail page' : 'Open a detail page before reviewing these mappings' }}
        </strong>
        <p>
          {{
            detailContextReady
              ? 'Use Show on page to verify title, price, location, description, and images against the listing that is open right now.'
              : 'The current tab still looks like a search page or something else. Open the sample listing from step 5, then come back here.'
          }}
        </p>
        <div
          v-if="detailFieldLabels.length"
          class="detail-review-banner__chips"
        >
          <span
            v-for="label in detailFieldLabels"
            :key="label"
            class="detail-review-banner__chip"
          >
            {{ label }}
          </span>
        </div>
      </div>

      <div
        v-if="browserRunProgress"
        class="remote-run-card"
      >
        <div class="remote-run-card__grid">
          <div>
            <span>Stage</span>
            <strong>{{ browserRunProgress.stage }}</strong>
          </div>
          <div>
            <span>Search pages</span>
            <strong>{{ browserRunProgress.pagesVisited }}</strong>
          </div>
          <div>
            <span>Listings seen</span>
            <strong>{{ browserRunProgress.itemsSeen }}</strong>
          </div>
          <div>
            <span>Listings extracted</span>
            <strong>{{ browserRunProgress.itemsExtracted }}</strong>
          </div>
          <div>
            <span>Detail pages</span>
            <strong>{{ browserRunProgress.detailPagesCompleted }} / {{ browserRunProgress.detailPagesTotal }}</strong>
          </div>
          <div>
            <span>Current URL</span>
            <strong>{{ browserRunProgress.currentUrl || 'Uploading results' }}</strong>
          </div>
        </div>
      </div>

      <div
        v-if="remoteRun"
        class="remote-run-card"
      >
        <div class="remote-run-card__grid">
          <div>
            <span>Pipeline ID</span>
            <strong>{{ remoteRun.pipelineId }}</strong>
          </div>
          <div>
            <span>Job ID</span>
            <strong>{{ remoteRun.jobId ?? 'Not recorded' }}</strong>
          </div>
          <div>
            <span>Visited pages</span>
            <strong>{{ remoteRun.summary.pagesVisited }}</strong>
          </div>
          <div>
            <span>Listings extracted</span>
            <strong>{{ remoteRun.summary.itemsExtracted }}</strong>
          </div>
          <div>
            <span>Inserted</span>
            <strong>{{ remoteRun.summary.inserted }}</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong>{{ remoteRun.summary.updated }}</strong>
          </div>
        </div>

        <p
          v-if="remoteRun.summary.warnings.length"
          class="remote-run-card__warnings"
        >
          {{ remoteRun.summary.warnings.join(' · ') }}
        </p>
      </div>

      <FieldRuleList
        v-model="extension.detailFields.value"
        title="Detail-page field suggestions"
        subtitle="These fields run after the helper follows the item URL into the detail page."
        scope="detail"
        :pending-picker="extension.pendingPicker.value"
        :preview="extension.fieldPreview.value"
        @pick-field="pickField"
        @add-field="extension.addField"
        @remove-field="(index) => extension.removeField('detail', index)"
        @preview-field="extension.previewField"
        @clear-preview="extension.clearFieldPreview"
      />

      <details class="workflow-details">
        <summary>Connection settings</summary>
        <div class="workflow-details__body">
          <label class="stack">
            <span>Boat Search app URL</span>
            <input
              v-model="extension.session.value.appBaseUrl"
              type="url"
              placeholder="https://boat-search.nard.uk"
            >
          </label>
        </div>
      </details>
    </WorkflowStepCard>
  </main>
</template>

<style scoped>
.panel {
  --panel-border: rgba(148, 163, 184, 0.24);
  --panel-text: #0f172a;
  --panel-muted: #475569;
  --panel-soft: #64748b;
  min-height: 100vh;
  padding: 1rem;
  display: grid;
  gap: 1rem;
  color: var(--panel-text);
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.18), transparent 28rem),
    linear-gradient(180deg, #f7fbff 0%, #eef4ff 52%, #fdfefe 100%);
  font-family:
    "Avenir Next",
    "SF Pro Display",
    "Segoe UI",
    ui-sans-serif,
    system-ui,
    sans-serif;
}

.hero,
.workflow-rail,
.warning-strip {
  border-radius: 1.35rem;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.hero {
  display: grid;
  gap: 1rem;
  padding: 1.2rem;
}

.eyebrow {
  margin: 0;
  font-size: 0.74rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #0369a1;
}

.hero h1 {
  margin: 0.25rem 0 0;
  font-size: 1.8rem;
  line-height: 1;
}

.lede,
.hero__focus-copy {
  margin: 0.45rem 0 0;
  color: var(--panel-muted);
  line-height: 1.55;
}

.hero__metrics {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.hero-pill,
.metric-card {
  min-width: 0;
  border-radius: 1rem;
  border: 1px solid rgba(191, 219, 254, 0.9);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.92));
  padding: 0.9rem 1rem;
  display: grid;
  gap: 0.35rem;
}

.hero-pill__label,
.metric-card span,
.hero__focus-label {
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0369a1;
}

.hero-pill strong,
.metric-card strong {
  font-size: 0.94rem;
  line-height: 1.45;
  word-break: break-word;
}

.hero__focus {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  padding: 1rem;
  border-radius: 1.1rem;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(191, 219, 254, 0.28));
}

.hero__focus-title {
  display: block;
  margin-top: 0.15rem;
  font-size: 1.05rem;
  line-height: 1.35;
}

.hero__error {
  margin: 0.55rem 0 0;
  color: #b91c1c;
  line-height: 1.5;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.6rem;
}

.workflow-rail {
  padding: 0.85rem;
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.workflow-rail__step {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  padding: 0.85rem;
  border-radius: 1rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(248, 250, 252, 0.9);
}

.workflow-rail__number {
  flex: 0 0 auto;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-weight: 700;
  background: rgba(226, 232, 240, 0.95);
}

.workflow-rail__body {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.workflow-rail__body strong {
  font-size: 0.82rem;
  line-height: 1.3;
}

.workflow-rail__body span {
  font-size: 0.74rem;
  color: var(--panel-soft);
}

.workflow-rail__step--complete {
  border-color: rgba(16, 185, 129, 0.2);
  background: rgba(236, 253, 245, 0.86);
}

.workflow-rail__step--complete .workflow-rail__number {
  background: rgba(110, 231, 183, 0.95);
}

.workflow-rail__step--active {
  border-color: rgba(2, 132, 199, 0.18);
  background: rgba(239, 246, 255, 0.95);
}

.workflow-rail__step--active .workflow-rail__number {
  background: rgba(191, 219, 254, 0.95);
}

.workflow-rail__step--ready {
  border-color: rgba(245, 158, 11, 0.2);
  background: rgba(255, 247, 237, 0.92);
}

.workflow-rail__step--ready .workflow-rail__number {
  background: rgba(253, 230, 138, 0.95);
}

.warning-strip {
  padding: 1rem 1.1rem;
  display: grid;
  gap: 0.75rem;
}

.warning-strip h2 {
  margin: 0;
  font-size: 1rem;
}

.warning-strip__items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.warning-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  background: rgba(254, 243, 199, 0.95);
  color: #92400e;
  font-size: 0.82rem;
  line-height: 1.35;
}

.metrics-grid {
  display: grid;
  gap: 0.85rem;
}

.metrics-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.metrics-grid--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.stack {
  display: grid;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: #334155;
}

.stack--inline {
  max-width: 14rem;
}

input,
textarea,
button,
select {
  font: inherit;
}

input,
textarea,
select {
  width: 100%;
  box-sizing: border-box;
  border-radius: 0.9rem;
  border: 1px solid #cbd5e1;
  background: white;
  padding: 0.72rem 0.85rem;
  color: var(--panel-text);
}

textarea {
  resize: vertical;
}

button {
  border: none;
  border-radius: 999px;
  padding: 0.72rem 1rem;
  cursor: pointer;
  background: #0284c7;
  color: white;
  font-weight: 700;
}

button.secondary {
  background: #e2e8f0;
  color: #0f172a;
}

button.ghost {
  background: white;
  color: #0f172a;
  border: 1px solid #cbd5e1;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.workflow-details {
  border-radius: 1rem;
  border: 1px solid rgba(203, 213, 225, 0.92);
  background: rgba(248, 250, 252, 0.9);
  overflow: hidden;
}

.workflow-details summary {
  list-style: none;
  cursor: pointer;
  padding: 0.95rem 1rem;
  font-weight: 700;
}

.workflow-details summary::-webkit-details-marker {
  display: none;
}

.workflow-details__body {
  padding: 0 1rem 1rem;
  display: grid;
  gap: 0.85rem;
}

.context-note {
  margin: 0;
  border-radius: 1rem;
  background: rgba(240, 253, 250, 0.92);
  color: #065f46;
  padding: 0.85rem 1rem;
  font-size: 0.84rem;
  line-height: 1.5;
}

.context-note--warning {
  background: rgba(254, 249, 195, 0.92);
  color: #854d0e;
}

.detail-review-banner {
  display: grid;
  gap: 0.55rem;
  border-radius: 1rem;
  border: 1px solid rgba(187, 247, 208, 0.92);
  background: rgba(240, 253, 244, 0.92);
  padding: 0.95rem 1rem;
}

.detail-review-banner--warning {
  border-color: rgba(253, 224, 71, 0.75);
  background: rgba(254, 252, 232, 0.94);
}

.detail-review-banner strong {
  color: #0f172a;
  font-size: 0.92rem;
}

.detail-review-banner p {
  margin: 0;
  color: #334155;
  font-size: 0.84rem;
  line-height: 1.5;
}

.detail-review-banner__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.detail-review-banner__chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.9rem;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  background: rgba(191, 219, 254, 0.95);
  color: #1d4ed8;
  font-size: 0.78rem;
  font-weight: 700;
}

.remote-run-card {
  display: grid;
  gap: 0.7rem;
  border-radius: 1rem;
  border: 1px solid rgba(14, 165, 233, 0.28);
  background: rgba(239, 246, 255, 0.94);
  padding: 1rem;
}

.remote-run-card__grid {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.remote-run-card__grid div {
  display: grid;
  gap: 0.25rem;
}

.remote-run-card__grid span {
  color: #475569;
  font-size: 0.78rem;
}

.remote-run-card__grid strong {
  color: #0f172a;
  font-size: 0.98rem;
}

.remote-run-card__warnings {
  margin: 0;
  color: #92400e;
  font-size: 0.82rem;
  line-height: 1.45;
}

@media (max-width: 980px) {
  .workflow-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .hero__metrics,
  .metrics-grid--two,
  .metrics-grid--three,
  .remote-run-card__grid,
  .workflow-rail {
    grid-template-columns: 1fr;
  }

  .hero__focus {
    flex-direction: column;
  }

  .hero__actions {
    justify-content: flex-start;
  }
}
</style>

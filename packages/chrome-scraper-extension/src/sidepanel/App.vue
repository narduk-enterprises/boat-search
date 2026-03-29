<script setup lang="ts">
import { computed, onMounted, shallowRef, watch } from 'vue'
import FieldRuleList from './components/FieldRuleList.vue'
import WorkflowStepCard from './components/WorkflowStepCard.vue'
import { useExtensionSession } from './composables/useExtensionSession'
import type { ExtensionDebugEvent, ScraperFieldRule } from '@/shared/types'

type WorkflowStatus = 'active' | 'complete' | 'upcoming' | 'ready'

type WorkflowStep = {
  id: string
  step: number
  title: string
  status: WorkflowStatus
  note: string
  statusLabel: string
}

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
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())
}

const draft = computed(() => extension.session.value.draft)
const connection = computed(() => extension.session.value.connection)
const analysis = computed(() => extension.session.value.lastAnalysis)
const matchedPreset = computed(() => extension.matchedPreset.value)
const analysisWarnings = computed(() =>
  [analysis.value?.stateMessage, ...(analysis.value?.warnings ?? [])].filter(
    (warning): warning is string => Boolean(warning),
  ),
)
const trustedPresetActive = computed(() => extension.trustedPresetActive.value)
const presetValidationOptional = computed(() => extension.presetValidationOptional.value)
const shouldOfferMatchedPresetLoad = computed(() => extension.shouldOfferMatchedPresetLoad.value)
const hasApiKey = computed(() => Boolean(connection.value.apiKey.trim()))
const connectionVerified = computed(() => Boolean(connection.value.verifiedAt))
const usingDefaultApiKey = computed(() => connection.value.apiKeySource === 'local-default')
const usingDefaultAppBaseUrl = computed(
  () => extension.session.value.appBaseUrlSource === 'local-default',
)
const appliedPresetLabel = computed(
  () =>
    extension.session.value.preset.appliedPresetLabel ||
    matchedPreset.value?.label ||
    'Trusted preset',
)

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
const detailImageCount = computed(() =>
  analysis.value?.pageType === 'detail' ? analysis.value.stats.distinctImageCount : 0,
)

const isDetailStage = computed(() => extension.session.value.stage === 'detail')
const hasSearchAnalysis = computed(
  () =>
    (analysis.value?.pageType === 'search' && analysis.value.pageState === 'ok') ||
    draft.value.config.startUrls.length > 0,
)
const hasItemSelector = computed(() => Boolean(draft.value.config.itemSelector.trim()))
const hasSearchFields = computed(() => itemFieldCount.value > 0)
const paginationConfigured = computed(
  () => Boolean(draft.value.config.nextPageSelector.trim()) || draft.value.config.maxPages === 1,
)
const hasSampleDetail = computed(() => Boolean(extension.session.value.sampleDetailUrl))
const hasDetailAnalysis = computed(
  () => analysis.value?.pageType === 'detail' && analysis.value.pageState === 'ok',
)
const hasDetailFields = computed(() => detailFieldCount.value > 0)
const detailWorkflowReady = computed(
  () => hasDetailAnalysis.value || (presetValidationOptional.value && hasDetailFields.value),
)
const itemSelectorTraining = computed(() => extension.itemSelectorTraining.value)
const itemSelectorPreview = computed(() => extension.itemSelectorPreview.value)
const remoteRun = computed(() => extension.remoteRun.value)
const browserRunProgress = computed(() => extension.browserRunProgress.value)
const debugEvents = computed(() => extension.debugEvents.value)
const sampleDetailRun = computed(() => extension.sampleDetailRun.value)
const startingRemoteRun = computed(() => extension.startingRemoteRun.value)
const verifyingConnection = computed(() => extension.verifyingConnection.value)
const debugCopyLabel = shallowRef('Copy debug snapshot')
const detectedCardCount = computed(
  () => itemSelectorPreview.value?.matchCount || itemSelectorTraining.value?.matchCount || 0,
)
const selectedExampleCount = computed(() => itemSelectorTraining.value?.selectionCount || 0)
const itemSelectorPreviewActive = computed(() => Boolean(itemSelectorPreview.value?.active))
const currentTabPageType = computed(() =>
  inferPageTypeFromUrl(extension.session.value.currentTabUrl),
)
const detailContextReady = computed(() => currentTabPageType.value === 'detail')
const detailFieldLabels = computed(() =>
  extension.detailFields.value
    .filter((field) => field.selector.trim())
    .map((field) => formatFieldName(field.key)),
)
const paginationAutoDetected = computed(() => {
  const detectedSelector = analysis.value?.nextPageSelector?.trim()
  return Boolean(
    analysis.value?.pageType === 'search' &&
    analysis.value.pageState === 'ok' &&
    detectedSelector &&
    draft.value.config.nextPageSelector.trim() === detectedSelector,
  )
})
const recentDebugEvents = computed(() => [...debugEvents.value].slice(-8).reverse())
const analysisStateLabel = computed(() => {
  if (!analysis.value) {
    return 'Not scanned yet'
  }

  return analysis.value.pageState === 'ok'
    ? analysis.value.pageType
    : `${analysis.value.pageType} · ${analysis.value.pageState}`
})
const searchScanStatus = computed(() => {
  if (trustedPresetActive.value) {
    return `${appliedPresetLabel.value} is active. Search and detail rules were auto-loaded, and opening a sample detail page is optional validation only.`
  }

  if (!analysis.value) {
    return 'Scan the current page to lock the search workflow.'
  }

  if (analysis.value.pageType !== 'search') {
    return extension.statusMessage.value
  }

  if (analysis.value.pageState !== 'ok') {
    return analysis.value.stateMessage || extension.statusMessage.value
  }

  return `${analysis.value.stats.listingCardCount || 0} listing cards detected, ${analysis.value.stats.detailLinkCount} detail links found, and ${
    analysis.value.nextPageSelector
      ? 'pagination was auto-filled.'
      : 'pagination still needs review.'
  }`
})

const exportGaps = computed(() => {
  const gaps: string[] = []

  if (!draft.value.name.trim()) gaps.push('pipeline name')
  if (!draft.value.boatSource.trim()) gaps.push('source name')
  if (!hasApiKey.value) gaps.push('Boat Search API key')
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

const workflowSteps = computed<WorkflowStep[]>(() => {
  const steps = [
    {
      id: 'scan-search',
      step: 1,
      title: 'Scan search page',
      status: hasSearchAnalysis.value ? 'complete' : 'active',
      note:
        analysis.value && analysis.value.pageState !== 'ok'
          ? analysis.value.stateMessage || 'The page scan needs review before locking selectors.'
          : trustedPresetActive.value
            ? `${appliedPresetLabel.value} is active and already filled the search + detail workflow.`
            : hasSearchAnalysis.value
              ? `Detected ${analysis.value?.pageType ?? 'search'} page on ${analysis.value?.siteName ?? 'this site'}.`
              : 'Start on a YachtWorld results page and read the DOM before editing selectors.',
    },
    {
      id: 'listing-card',
      step: 2,
      title: 'Lock listing card',
      status: !hasSearchAnalysis.value ? 'upcoming' : hasItemSelector.value ? 'complete' : 'active',
      note: hasItemSelector.value
        ? `${draft.value.config.itemSelector}${detectedCardCount.value ? ` · ${detectedCardCount.value} cards on this page` : ''}`
        : 'Pick two cards so the shared listing container stays anchored to the full results set.',
    },
    {
      id: 'search-fields',
      step: 3,
      title: 'Review search fields',
      status: !hasItemSelector.value ? 'upcoming' : hasSearchFields.value ? 'complete' : 'active',
      note: hasSearchFields.value
        ? `${itemFieldCount.value} search field${itemFieldCount.value === 1 ? '' : 's'} captured.`
        : 'Keep only the search fields worth scraping before opening any detail pages.',
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
        ? paginationAutoDetected.value
          ? `Auto-detected next page selector: ${draft.value.config.nextPageSelector}`
          : draft.value.config.nextPageSelector
        : draft.value.config.maxPages === 1
          ? 'Single-page mode is on.'
          : 'Pick the next-page button or cap the run at one page.',
    },
    {
      id: 'detail-page',
      step: 5,
      title: 'Scan detail page',
      status: !paginationConfigured.value
        ? 'upcoming'
        : detailWorkflowReady.value
          ? 'complete'
          : 'active',
      note:
        sampleDetailRun.value?.message ||
        (presetValidationOptional.value && !hasDetailAnalysis.value
          ? `${appliedPresetLabel.value} detail rules are already loaded. Open a sample detail page only if you want to validate the live DOM.`
          : hasDetailAnalysis.value
            ? analysis.value?.pageUrl || 'Detail page scanned.'
            : extension.session.value.sampleDetailUrl ||
              'Open one sample listing and scan it again.'),
    },
    {
      id: 'detail-fields-export',
      step: 6,
      title: 'Review detail fields',
      status: !detailWorkflowReady.value ? 'upcoming' : exportReady.value ? 'ready' : 'active',
      note: exportReady.value
        ? 'The draft is ready for an active-tab browser scrape or handoff.'
        : exportGaps.value.length
          ? `Still needed: ${exportGaps.value.join(', ')}.`
          : 'Finalize the pipeline details and send the draft into Boat Search.',
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
    return 'Start the active-tab browser scrape or open the builder'
  }

  return 'Review the captured selectors and tighten the mappings'
})

const completedStepCount = computed(
  () => workflowSteps.value.filter((step) => step.status === 'complete').length,
)
const activeStepId = computed(
  () =>
    workflowSteps.value.find((step) => step.status === 'active')?.id ||
    workflowSteps.value.find((step) => step.status === 'ready')?.id ||
    workflowSteps.value[0]?.id ||
    null,
)
const openStepId = shallowRef<string | null>(null)

watch(
  workflowSteps,
  (steps) => {
    if (!steps.length) {
      openStepId.value = null
      return
    }

    if (!openStepId.value || !steps.some((step) => step.id === openStepId.value)) {
      openStepId.value = activeStepId.value
    }
  },
  { immediate: true },
)

function openStep(stepId: string) {
  openStepId.value = stepId
}

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

function formatDebugTime(value: string) {
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return value
  }
}

function summarizeDebugDetail(detail: ExtensionDebugEvent['detail']) {
  if (!detail) {
    return ''
  }

  const parts = [
    typeof detail.method === 'string' ? detail.method : null,
    typeof detail.path === 'string' ? detail.path : null,
    typeof detail.status === 'number' ? `status ${detail.status}` : null,
    typeof detail.phase === 'string' ? detail.phase : null,
    typeof detail.pipelineId === 'number' ? `pipeline ${detail.pipelineId}` : null,
    typeof detail.jobId === 'number' ? `job ${detail.jobId}` : null,
    typeof detail.tabId === 'number' ? `tab ${detail.tabId}` : null,
    typeof detail.pagesVisited === 'number' ? `pages ${detail.pagesVisited}` : null,
    typeof detail.itemsSeen === 'number' ? `seen ${detail.itemsSeen}` : null,
    typeof detail.itemsExtracted === 'number' ? `extracted ${detail.itemsExtracted}` : null,
    typeof detail.recordsPersisted === 'number'
      ? `written ${detail.recordsPersisted}`
      : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(' · ')
}

async function copyDebugSnapshot() {
  const payload = {
    statusMessage: extension.statusMessage.value,
    errorMessage: extension.errorMessage.value,
    browserRunProgress: browserRunProgress.value,
    remoteRun: remoteRun.value,
    session: extension.session.value,
    events: debugEvents.value,
  }

  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    debugCopyLabel.value = 'Copied debug snapshot'
  } catch {
    debugCopyLabel.value = 'Could not copy debug snapshot'
  }

  window.setTimeout(() => {
    debugCopyLabel.value = 'Copy debug snapshot'
  }, 1800)
}

onMounted(async () => {
  await extension.initializeForCurrentTab()
})
</script>

<template>
  <main class="panel">
    <header class="toolbar">
      <div class="toolbar__top">
        <div class="toolbar__identity">
          <div class="toolbar__meta">
            <p class="eyebrow">
              Boat Search pipeline helper
            </p>
            <span class="context-pill">{{ analysis?.siteName || 'Waiting for scan' }}</span>
            <span
              class="context-pill context-pill--muted"
              data-testid="analysis-state-pill"
            >
              {{ analysisStateLabel }}
            </span>
          </div>
          <h1>Scraper workflow</h1>
          <p
            class="toolbar__summary"
            data-testid="toolbar-status"
          >
            <span class="toolbar__summary-label">Next</span>
            <strong>{{ nextAction }}</strong>
            <span>{{
              extension.statusMessage.value || 'Scan the current page to start locking selectors.'
            }}</span>
          </p>
          <p
            v-if="extension.errorMessage.value"
            class="toolbar__error"
          >
            {{ extension.errorMessage.value }}
          </p>
        </div>

        <div class="toolbar__actions">
          <button
            type="button"
            data-testid="scan-current-page"
            @click="extension.analyzeCurrentPage"
          >
            {{ isDetailStage ? 'Re-scan detail page' : 'Scan current page' }}
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

      <div class="status-strip">
        <article class="status-pill status-pill--wide">
          <span>Active tab</span>
          <strong>{{ extension.session.value.currentTabUrl || 'No active tab yet' }}</strong>
        </article>
        <article class="status-pill">
          <span>Progress</span>
          <strong>{{ completedStepCount }}/{{ workflowSteps.length }} complete</strong>
        </article>
        <article class="status-pill">
          <span>Sample detail</span>
          <strong>{{ hasSampleDetail ? 'Ready' : 'Not set' }}</strong>
        </article>
        <article class="status-pill">
          <span>Extension auth</span>
          <strong>
            {{
              connectionVerified
                ? connection.verifiedEmail || 'Connected'
                : hasApiKey
                  ? 'Ready to verify'
                  : 'API key needed'
            }}
          </strong>
        </article>
        <article class="status-pill">
          <span>Export</span>
          <strong>{{ exportReady ? 'Ready' : `${exportGaps.length} gaps` }}</strong>
        </article>
      </div>
    </header>

    <nav
      class="progress-nav"
      aria-label="Workflow steps"
    >
      <button
        v-for="step in workflowSteps"
        :key="step.id"
        type="button"
        :data-testid="`workflow-step-${step.id}`"
        class="progress-nav__step"
        :class="[
          `progress-nav__step--${step.status}`,
          { 'progress-nav__step--open': openStepId === step.id },
        ]"
        @click="openStep(step.id)"
      >
        <span class="progress-nav__number">{{ step.step }}</span>
        <span class="progress-nav__copy">
          <strong>{{ step.title }}</strong>
          <span>{{ step.statusLabel }}</span>
        </span>
      </button>
    </nav>

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

    <section
      v-if="matchedPreset"
      class="preset-banner"
      data-testid="preset-banner"
    >
      <div class="preset-banner__copy">
        <p class="eyebrow">
          Site preset
        </p>
        <strong>
          {{
            trustedPresetActive
              ? `${appliedPresetLabel} active`
              : `${matchedPreset.label} available`
          }}
        </strong>
        <p>
          {{
            trustedPresetActive
              ? 'YachtWorld search and detail rules were loaded into the draft. The detail step is optional validation now.'
              : matchedPreset.context === 'detail'
                ? 'This tab matches the YachtWorld detail context. Open a YachtWorld results page to auto-load the full search preset.'
                : 'This page matches the YachtWorld search preset. Load it to replace the current draft if you do not want to keep the current manual configuration.'
          }}
        </p>
      </div>

      <button
        v-if="shouldOfferMatchedPresetLoad"
        type="button"
        class="secondary"
        data-testid="load-matched-preset-button"
        @click="extension.applyMatchedPreset('manual')"
      >
        Load YachtWorld preset
      </button>
    </section>

    <WorkflowStepCard
      :step="0"
      title="Connect the extension"
      subtitle="Store a Boat Search API key in the plugin so scraping and writes stay inside the extension instead of depending on the website session."
      :status="connectionVerified ? 'complete' : hasApiKey ? 'ready' : 'active'"
      :note="
        connectionVerified
          ? `Connected as ${connection.verifiedEmail || 'an authenticated user'}.`
          : hasApiKey
            ? 'The API key is saved. You can test it now or launch the browser scrape and the extension will verify it first.'
            : 'Paste a Boat Search API key, test it, then the plugin can write boats and images directly.'
      "
      :open="true"
    >
      <template #actions>
        <button
          type="button"
          class="ghost"
          @click="extension.openBoatSearchAccountSettings"
        >
          Open account settings
        </button>
        <button
          type="button"
          data-testid="connection-test-button"
          class="secondary"
          :disabled="verifyingConnection"
          @click="extension.verifyBoatSearchConnection(true)"
        >
          {{ verifyingConnection ? 'Testing…' : 'Test connection' }}
        </button>
      </template>

      <div class="task-grid task-grid--two">
        <label class="stack">
          <span>Boat Search app URL</span>
          <input
            :value="extension.session.value.appBaseUrl"
            data-testid="app-base-url-input"
            type="url"
            placeholder="https://boat-search.nard.uk"
            @input="extension.updateAppBaseUrl(String(($event.target as HTMLInputElement).value))"
          >
        </label>

        <label class="stack">
          <span>Boat Search API key</span>
          <input
            :value="connection.apiKey"
            data-testid="api-key-input"
            type="password"
            placeholder="nk_..."
            @input="
              extension.updateConnectionApiKey(String(($event.target as HTMLInputElement).value))
            "
          >
        </label>
      </div>

      <p class="context-note">
        Create this key in Boat Search account settings. The extension stores it locally, uses it to
        upload images into R2, and streams boats into the database while the scrape runs.
      </p>
      <p
        v-if="usingDefaultApiKey || usingDefaultAppBaseUrl"
        class="context-note"
        data-testid="dev-default-connection-note"
      >
        {{
          usingDefaultApiKey && usingDefaultAppBaseUrl
            ? 'The extension is currently using local dev defaults for the API key and the Boat Search app URL.'
            : usingDefaultApiKey
              ? 'The extension is currently using a local dev default API key.'
              : 'The extension is currently using a local dev default Boat Search app URL.'
        }}
      </p>
      <p
        v-if="connection.verifiedAt"
        class="context-note"
      >
        Last verified {{ connection.verifiedAt }}.
      </p>
    </WorkflowStepCard>

    <WorkflowStepCard
      :step="1"
      title="Scan the search page"
      subtitle="Read the results DOM before changing any selectors."
      :status="workflowSteps[0]?.status ?? 'active'"
      :note="workflowSteps[0]?.note"
      :open="openStepId === 'scan-search'"
      @toggle="openStep('scan-search')"
    >
      <template #actions>
        <button
          type="button"
          @click="extension.analyzeCurrentPage"
        >
          Auto-detect page
        </button>
      </template>

      <div class="task-grid task-grid--three">
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

      <p
        class="context-note"
        data-testid="search-scan-status"
      >
        {{ searchScanStatus }}
      </p>
    </WorkflowStepCard>

    <WorkflowStepCard
      :step="2"
      title="Confirm the listing card"
      subtitle="Train one stable card selector, then preview the matches."
      :status="workflowSteps[1]?.status ?? 'upcoming'"
      :note="workflowSteps[1]?.note"
      :open="openStepId === 'listing-card'"
      @toggle="openStep('listing-card')"
    >
      <template #actions>
        <button
          type="button"
          class="ghost"
          @click="extension.detectItemSelector"
        >
          Detect cards
        </button>
        <button
          type="button"
          class="secondary"
          @click="pickItemSelector"
        >
          Train selector
        </button>
        <button
          v-if="hasItemSelector"
          type="button"
          class="ghost"
          @click="
            itemSelectorPreviewActive
              ? extension.clearItemSelectorPreview()
              : extension.previewItemSelector()
          "
        >
          {{ itemSelectorPreviewActive ? 'Hide cards' : 'Show cards' }}
        </button>
        <button
          v-if="hasItemSelector || selectedExampleCount"
          type="button"
          class="danger danger--ghost"
          @click="extension.resetItemSelector"
        >
          Reset selector
        </button>
      </template>

      <div class="task-grid task-grid--three">
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
          <span>Cards on page</span>
          <strong>{{ detectedCardCount || 'Not checked yet' }}</strong>
          <small v-if="itemSelectorPreview?.error || !hasItemSelector">
            {{ itemSelectorPreview?.error || 'Train a selector, then preview it here.' }}
          </small>
          <small
            v-else-if="
              itemSelectorPreviewActive &&
                itemSelectorPreview &&
                itemSelectorPreview.highlightedCount < itemSelectorPreview.matchCount
            "
          >
            Showing {{ itemSelectorPreview.highlightedCount }} visible cards now. Scroll and preview
            again to spot-check more.
          </small>
          <small v-else-if="selectedExampleCount">
            {{ selectedExampleCount }} example{{ selectedExampleCount === 1 ? '' : 's' }} selected.
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
      subtitle="Keep the search mappings fast to scan and easy to preview."
      :status="workflowSteps[2]?.status ?? 'upcoming'"
      :note="workflowSteps[2]?.note"
      :open="openStepId === 'search-fields'"
      @toggle="openStep('search-fields')"
    >
      <FieldRuleList
        v-model="extension.itemFields.value"
        title="Search-page field suggestions"
        subtitle="These fields come from the result cards before the helper opens detail links."
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
      subtitle="Tell the helper how to move between result pages or keep the run single-page."
      :status="workflowSteps[3]?.status ?? 'upcoming'"
      :note="workflowSteps[3]?.note"
      :open="openStepId === 'pagination'"
      @toggle="openStep('pagination')"
    >
      <template #actions>
        <button
          type="button"
          class="secondary"
          data-testid="pick-next-page-button"
          @click="pickNextPageSelector"
        >
          Pick next page
        </button>
        <button
          type="button"
          class="ghost"
          @click="setSinglePageMode"
        >
          Use one page
        </button>
      </template>

      <div class="task-grid task-grid--three">
        <label class="stack">
          <span>Next-page selector</span>
          <input
            v-model="draft.config.nextPageSelector"
            data-testid="next-page-selector-input"
            type="text"
            placeholder="a[rel='next']"
          >
        </label>

        <label class="stack">
          <span>Max pages</span>
          <input
            v-model.number="draft.config.maxPages"
            data-testid="max-pages-input"
            type="number"
            min="1"
            max="25"
          >
        </label>

        <label class="stack">
          <span>Max items per run</span>
          <input
            v-model.number="draft.config.maxItemsPerRun"
            data-testid="max-items-per-run-input"
            type="number"
            min="1"
            max="250"
          >
        </label>
      </div>

      <p
        v-if="paginationAutoDetected"
        class="context-note"
        data-testid="pagination-auto-detected"
      >
        The helper detected the next-page control during the search scan and filled
        <code>{{ draft.config.nextPageSelector }}</code> for you. Replace it only if the site
        paginates differently than this page.
      </p>
    </WorkflowStepCard>

    <WorkflowStepCard
      :step="5"
      title="Open and scan a detail page"
      :subtitle="
        presetValidationOptional
          ? 'Detail rules are already loaded by the trusted YachtWorld preset. Open a real listing only if you want to validate the live DOM.'
          : 'Open one real listing so detail previews run against live DOM.'
      "
      :status="workflowSteps[4]?.status ?? 'upcoming'"
      :note="workflowSteps[4]?.note"
      :open="openStepId === 'detail-page'"
      @toggle="openStep('detail-page')"
    >
      <template #actions>
        <button
          type="button"
          class="secondary"
          data-testid="open-sample-detail-button"
          @click="extension.openSampleDetailPage"
        >
          Open sample detail
        </button>
        <button
          type="button"
          @click="extension.analyzeCurrentPage"
        >
          Re-scan tab
        </button>
      </template>

      <div class="task-grid task-grid--three">
        <div class="metric-card">
          <span>Current tab</span>
          <strong>{{ currentTabPageType }}</strong>
        </div>
        <div class="metric-card">
          <span>Sample detail</span>
          <strong>{{ hasSampleDetail ? 'Ready' : 'Not found yet' }}</strong>
        </div>
        <div class="metric-card">
          <span>Detail fields</span>
          <strong>{{ detailFieldCount }}</strong>
        </div>
      </div>

      <p
        class="context-note"
        data-testid="detail-image-count"
      >
        {{
          detailImageCount
            ? `Detected ${detailImageCount} gallery image${detailImageCount === 1 ? '' : 's'} on the current detail page.`
            : 'No gallery images have been confirmed on the current detail page yet.'
        }}
      </p>

      <div
        v-if="sampleDetailRun"
        class="detail-review-banner"
        data-testid="sample-detail-status"
        :class="{
          'detail-review-banner--warning':
            sampleDetailRun.status === 'opening' || sampleDetailRun.status === 'opened',
          'detail-review-banner--error': sampleDetailRun.status === 'error',
        }"
      >
        <strong>
          {{
            sampleDetailRun.status === 'scanned'
              ? 'Sample detail page opened and scanned'
              : sampleDetailRun.status === 'error'
                ? 'Sample detail scan failed'
                : sampleDetailRun.status === 'opening'
                  ? 'Opening sample detail page'
                  : 'Sample detail page opened'
          }}
        </strong>
        <p>{{ sampleDetailRun.message }}</p>
        <p v-if="sampleDetailRun.url">
          <code>{{ sampleDetailRun.url }}</code>
        </p>
        <p v-if="sampleDetailRun.imageCount">
          Gallery images detected: <strong>{{ sampleDetailRun.imageCount }}</strong>
        </p>
      </div>

      <p
        v-if="presetValidationOptional && !detailContextReady"
        class="context-note"
      >
        {{ appliedPresetLabel }} is trusted, so you can start the browser scrape without opening a
        sample detail page. Open one only if you want to preview the live DOM before running.
      </p>
      <p
        v-else-if="!detailContextReady"
        class="context-note context-note--warning"
      >
        The current tab does not look like a listing detail page yet. Open the sample listing or
        switch to any <code>/yacht/...</code> page before reviewing detail mappings.
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
      subtitle="Preview the detail mappings, then launch the browser scrape in the active tab or hand off the draft."
      :status="workflowSteps[5]?.status ?? 'upcoming'"
      :note="workflowSteps[5]?.note"
      :open="openStepId === 'detail-fields-export'"
      @toggle="openStep('detail-fields-export')"
    >
      <template #actions>
        <button
          type="button"
          class="secondary"
          @click="extension.analyzeCurrentPage"
        >
          Re-scan detail page
        </button>
        <button
          type="button"
          :disabled="!exportReady || !hasApiKey || startingRemoteRun || verifyingConnection"
          data-testid="start-browser-scrape-button"
          @click="extension.startScrapeInBoatSearch"
        >
          {{ startingRemoteRun ? 'Running scrape...' : 'Start browser scrape' }}
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

      <div class="task-grid task-grid--two">
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
        v-if="extension.errorMessage.value || recentDebugEvents.length"
        class="scrape-debug-card"
        data-testid="browser-scrape-debug"
      >
        <div class="scrape-debug-card__header">
          <div class="scrape-debug-card__copy">
            <strong>{{
              extension.errorMessage.value ? 'Last scrape failure' : 'Recent scrape events'
            }}</strong>
            <p>Use this block to see the last tab or Boat Search step before the run stopped.</p>
          </div>
          <button
            type="button"
            class="secondary"
            @click="copyDebugSnapshot"
          >
            {{ debugCopyLabel }}
          </button>
        </div>

        <p
          v-if="extension.errorMessage.value"
          class="scrape-debug-card__error"
        >
          {{ extension.errorMessage.value }}
        </p>

        <div class="scrape-debug-list">
          <article
            v-for="event in recentDebugEvents"
            :key="`${event.at}-${event.type}`"
            class="scrape-debug-list__item"
          >
            <div class="scrape-debug-list__meta">
              <span>{{ formatDebugTime(event.at) }}</span>
              <code>{{ event.type }}</code>
            </div>
            <strong>{{ event.message }}</strong>
            <p v-if="summarizeDebugDetail(event.detail)">
              {{ summarizeDebugDetail(event.detail) }}
            </p>
          </article>
        </div>
      </div>

      <div
        class="detail-review-banner"
        :class="{
          'detail-review-banner--warning': !detailContextReady && !presetValidationOptional,
        }"
      >
        <strong>{{
          detailContextReady
            ? 'Reviewing the open detail page'
            : presetValidationOptional
              ? 'Preset detail rules loaded'
              : 'Open a detail page first'
        }}</strong>
        <p>
          {{
            detailContextReady
              ? 'Use Show on page to verify title, price, location, description, and images against the listing open right now.'
              : presetValidationOptional
                ? 'This preset can run without a live detail preview. Open the sample listing from step 5 only if you want to spot-check the selectors on the real page.'
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
        data-testid="browser-scrape-progress"
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
            <strong>
              {{ browserRunProgress.detailPagesCompleted }} /
              {{ browserRunProgress.detailPagesTotal }}
            </strong>
          </div>
          <div>
            <span>Records written</span>
            <strong>{{ browserRunProgress.recordsPersisted }}</strong>
          </div>
          <div>
            <span>Images uploaded</span>
            <strong>{{ browserRunProgress.imagesUploaded }}</strong>
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
        data-testid="browser-scrape-result"
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
              :value="extension.session.value.appBaseUrl"
              type="url"
              placeholder="https://boat-search.nard.uk"
              @input="extension.updateAppBaseUrl(String(($event.target as HTMLInputElement).value))"
            >
          </label>
        </div>
      </details>
    </WorkflowStepCard>
  </main>
</template>

<style scoped>
.panel {
  --panel-border: rgba(148, 163, 184, 0.22);
  --panel-text: #0f172a;
  --panel-muted: #475569;
  --panel-soft: #64748b;
  min-height: 100vh;
  padding: 0.85rem;
  display: grid;
  gap: 0.85rem;
  color: var(--panel-text);
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.18), transparent 22rem),
    linear-gradient(180deg, #f7fbff 0%, #eef4ff 48%, #fdfefe 100%);
  font-family: 'Avenir Next', 'SF Pro Display', 'Segoe UI', ui-sans-serif, system-ui, sans-serif;
}

.toolbar,
.progress-nav,
.warning-strip {
  border-radius: 1.1rem;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.07);
}

.toolbar {
  display: grid;
  gap: 0.8rem;
  padding: 0.95rem;
}

.toolbar__top {
  display: flex;
  justify-content: space-between;
  gap: 0.85rem;
  align-items: flex-start;
}

.toolbar__identity {
  min-width: 0;
  display: grid;
  gap: 0.35rem;
}

.toolbar__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}

.eyebrow {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #0369a1;
}

.context-pill {
  display: inline-flex;
  align-items: center;
  min-height: 1.65rem;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.92);
  color: #075985;
  font-size: 0.74rem;
  font-weight: 700;
}

.context-pill--muted {
  background: rgba(241, 245, 249, 0.95);
  color: #334155;
}

.toolbar h1 {
  margin: 0;
  font-size: 1.35rem;
  line-height: 1.05;
}

.toolbar__summary {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.55rem;
  align-items: center;
  color: var(--panel-muted);
  line-height: 1.45;
  font-size: 0.84rem;
}

.toolbar__summary strong {
  color: var(--panel-text);
  font-size: 0.94rem;
}

.toolbar__summary-label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #0369a1;
  font-size: 0.72rem;
  font-weight: 700;
}

.toolbar__error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.82rem;
  line-height: 1.45;
}

.toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.55rem;
}

.status-strip {
  display: grid;
  gap: 0.65rem;
  grid-template-columns: 2fr repeat(3, minmax(0, 1fr));
}

.status-pill,
.metric-card {
  min-width: 0;
  border-radius: 0.95rem;
  border: 1px solid rgba(191, 219, 254, 0.88);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.92));
  padding: 0.75rem 0.85rem;
  display: grid;
  gap: 0.25rem;
}

.status-pill span,
.metric-card span {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0369a1;
}

.status-pill strong,
.metric-card strong {
  font-size: 0.87rem;
  line-height: 1.4;
  word-break: break-word;
}

.progress-nav {
  padding: 0.6rem;
  display: grid;
  gap: 0.55rem;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.progress-nav__step {
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 0.95rem;
  background: rgba(248, 250, 252, 0.92);
  padding: 0.65rem;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  text-align: left;
  cursor: pointer;
}

.progress-nav__number {
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-weight: 700;
  background: rgba(226, 232, 240, 0.95);
  flex: 0 0 auto;
}

.progress-nav__copy {
  min-width: 0;
  display: grid;
  gap: 0.12rem;
}

.progress-nav__copy strong {
  font-size: 0.76rem;
  line-height: 1.3;
}

.progress-nav__copy span {
  font-size: 0.72rem;
  color: var(--panel-soft);
}

.progress-nav__step--open {
  box-shadow: inset 0 0 0 1px rgba(14, 165, 233, 0.16);
}

.progress-nav__step--complete {
  border-color: rgba(16, 185, 129, 0.2);
  background: rgba(236, 253, 245, 0.88);
}

.progress-nav__step--complete .progress-nav__number {
  background: rgba(110, 231, 183, 0.95);
}

.progress-nav__step--active {
  border-color: rgba(2, 132, 199, 0.18);
  background: rgba(239, 246, 255, 0.96);
}

.progress-nav__step--active .progress-nav__number {
  background: rgba(191, 219, 254, 0.95);
}

.progress-nav__step--ready {
  border-color: rgba(245, 158, 11, 0.2);
  background: rgba(255, 247, 237, 0.94);
}

.progress-nav__step--ready .progress-nav__number {
  background: rgba(253, 230, 138, 0.95);
}

.warning-strip {
  padding: 0.85rem 0.95rem;
  display: grid;
  gap: 0.6rem;
}

.warning-strip h2 {
  margin: 0;
  font-size: 0.92rem;
}

.warning-strip__items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.warning-pill {
  display: inline-flex;
  align-items: center;
  min-height: 1.8rem;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  background: rgba(254, 243, 199, 0.95);
  color: #92400e;
  font-size: 0.78rem;
  line-height: 1.35;
}

.preset-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 0.9rem 0.95rem;
  border-radius: 1.1rem;
  border: 1px solid rgba(16, 185, 129, 0.22);
  background: rgba(236, 253, 245, 0.94);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.05);
}

.preset-banner__copy {
  display: grid;
  gap: 0.24rem;
}

.preset-banner__copy strong {
  color: var(--panel-text);
  font-size: 0.92rem;
}

.preset-banner__copy p {
  margin: 0;
  color: var(--panel-muted);
  font-size: 0.8rem;
  line-height: 1.45;
}

.task-grid {
  display: grid;
  gap: 0.7rem;
}

.task-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.task-grid--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.stack {
  display: grid;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #334155;
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
  border-radius: 0.85rem;
  border: 1px solid #cbd5e1;
  background: white;
  padding: 0.68rem 0.8rem;
  color: var(--panel-text);
}

textarea {
  resize: vertical;
}

button {
  border: none;
  border-radius: 999px;
  padding: 0.68rem 0.95rem;
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

button.danger {
  background: #dc2626;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.danger--ghost {
  background: rgba(254, 242, 242, 0.96);
  color: #b91c1c;
}

.metric-card small {
  color: var(--panel-soft);
  font-size: 0.76rem;
  line-height: 1.35;
}

.workflow-details {
  border-radius: 0.95rem;
  border: 1px solid rgba(203, 213, 225, 0.92);
  background: rgba(248, 250, 252, 0.9);
  overflow: hidden;
}

.workflow-details summary {
  list-style: none;
  cursor: pointer;
  padding: 0.85rem 0.95rem;
  font-weight: 700;
}

.workflow-details summary::-webkit-details-marker {
  display: none;
}

.workflow-details__body {
  padding: 0 0.95rem 0.95rem;
  display: grid;
  gap: 0.75rem;
}

.context-note {
  margin: 0;
  border-radius: 0.95rem;
  background: rgba(240, 253, 250, 0.92);
  color: #065f46;
  padding: 0.75rem 0.9rem;
  font-size: 0.8rem;
  line-height: 1.45;
}

.context-note--warning {
  background: rgba(254, 249, 195, 0.92);
  color: #854d0e;
}

.detail-review-banner {
  display: grid;
  gap: 0.45rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(187, 247, 208, 0.92);
  background: rgba(240, 253, 244, 0.92);
  padding: 0.85rem 0.95rem;
}

.detail-review-banner--warning {
  border-color: rgba(253, 224, 71, 0.75);
  background: rgba(254, 252, 232, 0.94);
}

.detail-review-banner--error {
  border-color: rgba(252, 165, 165, 0.82);
  background: rgba(254, 242, 242, 0.96);
}

.detail-review-banner strong {
  color: #0f172a;
  font-size: 0.88rem;
}

.detail-review-banner p {
  margin: 0;
  color: #334155;
  font-size: 0.8rem;
  line-height: 1.45;
}

.detail-review-banner__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.detail-review-banner__chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.75rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  background: rgba(191, 219, 254, 0.95);
  color: #1d4ed8;
  font-size: 0.74rem;
  font-weight: 700;
}

.remote-run-card {
  display: grid;
  gap: 0.65rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(14, 165, 233, 0.28);
  background: rgba(239, 246, 255, 0.94);
  padding: 0.9rem;
}

.remote-run-card__grid {
  display: grid;
  gap: 0.7rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.remote-run-card__grid div {
  display: grid;
  gap: 0.2rem;
}

.remote-run-card__grid span {
  color: #475569;
  font-size: 0.74rem;
}

.remote-run-card__grid strong {
  color: #0f172a;
  font-size: 0.9rem;
  word-break: break-word;
}

.remote-run-card__warnings {
  margin: 0;
  color: #92400e;
  font-size: 0.8rem;
  line-height: 1.4;
}

.scrape-debug-card {
  display: grid;
  gap: 0.75rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(248, 113, 113, 0.3);
  background: rgba(254, 242, 242, 0.95);
  padding: 0.95rem;
}

.scrape-debug-card__header {
  display: flex;
  gap: 0.8rem;
  justify-content: space-between;
  align-items: flex-start;
}

.scrape-debug-card__copy {
  display: grid;
  gap: 0.2rem;
}

.scrape-debug-card__copy strong {
  color: #7f1d1d;
  font-size: 0.9rem;
}

.scrape-debug-card__copy p,
.scrape-debug-card__error,
.scrape-debug-list__item p {
  margin: 0;
  color: #7f1d1d;
  font-size: 0.78rem;
  line-height: 1.45;
}

.scrape-debug-card__error {
  border-radius: 0.8rem;
  background: rgba(254, 226, 226, 0.96);
  padding: 0.7rem 0.8rem;
  font-weight: 700;
}

.scrape-debug-list {
  display: grid;
  gap: 0.55rem;
  max-height: 16rem;
  overflow: auto;
}

.scrape-debug-list__item {
  display: grid;
  gap: 0.2rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(248, 113, 113, 0.22);
  background: rgba(255, 255, 255, 0.85);
  padding: 0.7rem 0.8rem;
}

.scrape-debug-list__item strong {
  color: #111827;
  font-size: 0.82rem;
}

.scrape-debug-list__meta {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  justify-content: space-between;
}

.scrape-debug-list__meta span,
.scrape-debug-list__meta code {
  color: #991b1b;
  font-size: 0.72rem;
}

@media (max-width: 980px) {
  .status-strip,
  .progress-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .toolbar__top,
  .toolbar__actions,
  .preset-banner,
  .scrape-debug-card__header {
    flex-direction: column;
  }

  .toolbar__actions {
    align-items: stretch;
  }

  .status-strip,
  .progress-nav,
  .task-grid--two,
  .task-grid--three,
  .remote-run-card__grid {
    grid-template-columns: 1fr;
  }
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import WorkflowStepCard from './components/WorkflowStepCard.vue'
import { useExtensionSession } from './composables/useExtensionSession'
import {
  DEFAULT_BROWSER_DETAIL_TAB_CONCURRENCY,
  MAX_BROWSER_DETAIL_TAB_CONCURRENCY,
} from '@/shared/defaults'
import type { ExtensionDebugEvent } from '@/shared/types'

type WorkflowStatus = 'active' | 'complete' | 'upcoming' | 'ready'

const extension = useExtensionSession()

const session = computed(() => extension.session.value)
const connection = computed(() => session.value.connection)
const analysis = computed(() => session.value.lastAnalysis)
const matchedPreset = computed(() => extension.matchedPreset.value)
const trustedPresetActive = computed(() => extension.trustedPresetActive.value)
const shouldOfferMatchedPresetLoad = computed(() => extension.shouldOfferMatchedPresetLoad.value)
const sampleDetailRun = computed(() => extension.sampleDetailRun.value)
const browserRunProgress = computed(() => extension.browserRunProgress.value)
const remoteRun = computed(() => extension.remoteRun.value)
const debugEvents = computed(() => extension.debugEvents.value)
const tabTarget = computed(() => session.value.tabTarget)
const startingRemoteRun = computed(() => extension.startingRemoteRun.value)
const stoppingRemoteRun = computed(() => extension.stoppingRemoteRun.value)
const verifyingConnection = computed(() => extension.verifyingConnection.value)
const debugCopyLabel = shallowRef('Copy debug snapshot')
const expandedCompleteStepId = shallowRef<string | null>(null)
const showApiKey = ref(false)
const detailTabConcurrencyOptions = Array.from(
  { length: MAX_BROWSER_DETAIL_TAB_CONCURRENCY },
  (_, index) => index + 1,
)

const hasApiKey = computed(() => Boolean(connection.value.apiKey.trim()))
const connectionVerified = computed(() => Boolean(connection.value.verifiedAt))
const usingDefaultApiKey = computed(() => connection.value.apiKeySource === 'local-default')
const usingDefaultAppBaseUrl = computed(() => session.value.appBaseUrlSource === 'local-default')
const trackingLockedTab = computed(() => tabTarget.value.mode === 'locked')
const detailTabConcurrency = computed(() => session.value.browserSettings.detailTabConcurrency)
const runSettingsLocked = computed(
  () => Boolean(startingRemoteRun.value || browserRunProgress.value),
)
const hasResettableSettings = computed(() => {
  return (
    trackingLockedTab.value ||
    detailTabConcurrency.value !== DEFAULT_BROWSER_DETAIL_TAB_CONCURRENCY ||
    session.value.appBaseUrlSource === 'manual' ||
    Boolean(
      connection.value.apiKey.trim() ||
        connection.value.verifiedAt ||
        connection.value.verifiedEmail ||
        connection.value.verifiedName,
    )
  )
})
const trackedTabLabel = computed(() => (trackingLockedTab.value ? 'Locked tab' : 'Tracked tab'))
const tabTrackingStatusLabel = computed(() =>
  trackingLockedTab.value ? 'Locked' : 'Following active',
)
const trackedTabSummary = computed(
  () => tabTarget.value.title || session.value.currentTabUrl || 'No tracked tab yet',
)
const tabTrackingNote = computed(() => {
  if (trackingLockedTab.value) {
    return 'The workflow stays on the selected tab until you lock a different tab or return to follow-active mode.'
  }

  return 'The workflow follows whichever browser tab is active in this window.'
})
const hasSampleDetail = computed(() =>
  Boolean(session.value.sampleDetailUrl || analysis.value?.sampleDetailUrl),
)
const appliedPresetLabel = computed(
  () => session.value.preset.appliedPresetLabel || matchedPreset.value?.label || 'Trusted preset',
)
const analysisWarnings = computed(() =>
  [analysis.value?.stateMessage, ...(analysis.value?.warnings ?? [])].filter(
    (warning): warning is string => Boolean(warning),
  ),
)
const recentDebugEvents = computed(() => [...debugEvents.value].slice(-8).reverse())
const analysisStateLabel = computed(() => {
  if (!analysis.value) {
    return 'Not scanned yet'
  }

  return `${analysis.value.pageType} · ${analysis.value.pageState}`
})
const activePresetLabel = computed(() => {
  if (trustedPresetActive.value) {
    return appliedPresetLabel.value
  }

  return matchedPreset.value?.label || 'Not loaded'
})
const connectionStatus = computed<WorkflowStatus>(() => {
  if (connectionVerified.value) {
    return 'complete'
  }

  if (hasApiKey.value) {
    return 'ready'
  }

  return 'active'
})
const connectionNote = computed(() => {
  if (connectionVerified.value) {
    return `Connected as ${connection.value.verifiedEmail || 'an authenticated user'}. This connection is saved locally, so only clear settings when rotating keys or switching accounts.`
  }

  if (hasApiKey.value) {
    return 'The API key is already saved locally. For normal rescans, use Scan current page. Only clear settings when rotating keys or switching accounts.'
  }

  return 'Paste a Boat Search API key so the extension can write boats and images directly without relying on the website session.'
})
const presetStatus = computed<WorkflowStatus>(() => {
  if (trustedPresetActive.value) {
    return 'complete'
  }

  if (matchedPreset.value?.context === 'search') {
    return 'active'
  }

  return 'active'
})
const presetNote = computed(() => {
  if (trustedPresetActive.value) {
    return `${appliedPresetLabel.value} is active. Search and detail selectors are locked, and the detail page is optional validation only.`
  }

  if (matchedPreset.value?.context === 'search') {
    return `${matchedPreset.value.label} matches this search page. Load it to enable preset scraping.`
  }

  if (matchedPreset.value?.context === 'detail') {
    return `${matchedPreset.value.label} detail page detected. Open a supported search results page to load the full preset before scraping.`
  }

  if (analysis.value) {
    return 'The current page was scanned, but no trusted preset matches it yet.'
  }

  return 'Open a supported search results page, then scan it to load a trusted preset.'
})
const runStatus = computed<WorkflowStatus>(() => {
  if (remoteRun.value) {
    return 'complete'
  }

  if (startingRemoteRun.value || browserRunProgress.value) {
    return 'active'
  }

  if (!trustedPresetActive.value) {
    return 'upcoming'
  }

  if (!hasApiKey.value) {
    return 'active'
  }

  return 'ready'
})
const canStopRun = computed(() => Boolean(startingRemoteRun.value || browserRunProgress.value))
const runNote = computed(() => {
  if (remoteRun.value) {
    return `Last run ${formatRunOutcome(remoteRun.value.summary)} boats.`
  }

  if (browserRunProgress.value) {
    if (stoppingRemoteRun.value) {
      return 'Stop requested. The scraper will halt after the current page step finishes.'
    }
    if (browserRunProgress.value.stage === 'detail_backfill') {
      return `Detail backfill: ${browserRunProgress.value.detailPagesCompleted}/${browserRunProgress.value.detailPagesTotal} URLs, ${browserRunProgress.value.recordsPersisted} records written so far.`
    }
    const skippedSuffix =
      browserRunProgress.value.skippedExisting > 0
        ? ` and ${browserRunProgress.value.skippedExisting} existing skipped`
        : ''
    return `Scrape running on ${browserRunProgress.value.pagesVisited} page${browserRunProgress.value.pagesVisited === 1 ? '' : 's'} with ${browserRunProgress.value.itemsExtracted} new listing${browserRunProgress.value.itemsExtracted === 1 ? '' : 's'} extracted so far${skippedSuffix}.`
  }

  if (!trustedPresetActive.value) {
    return 'Load a trusted preset before starting the browser scrape or opening the preset draft in Boat Search.'
  }

  if (!hasApiKey.value) {
    return 'Add a Boat Search API key before starting the browser scrape.'
  }

  if (stoppingRemoteRun.value) {
    return 'Stop requested. Waiting for the current browser step to finish cleanly.'
  }

  return 'The preset draft is ready. Start the tracked-tab scrape, or open the same draft in Boat Search for a closer look.'
})

function formatRunOutcome(summary: { inserted: number; updated: number; skippedExisting: number }) {
  const parts = [`inserted ${summary.inserted}`, `updated ${summary.updated}`]

  if (summary.skippedExisting > 0) {
    parts.push(`skipped ${summary.skippedExisting} existing`)
  }

  return parts.join(', ')
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

const yachtWorldPresetReady = computed(
  () =>
    session.value.preset.appliedPresetId === 'yachtworld-search' ||
    matchedPreset.value?.id === 'yachtworld-search',
)

const detailBackfillStartUrlsText = computed({
  get: () => session.value.draft.config.startUrls.join('\n'),
  set: (text: string) => {
    session.value.draft.config.startUrls = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  },
})

function onDetailBackfillToggle(checked: boolean) {
  session.value.draft.config.detailBackfillMode = checked
  if (checked) {
    session.value.draft.config.fetchDetailPages = true
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
    typeof detail.skippedExisting === 'number' ? `skipped ${detail.skippedExisting}` : null,
    typeof detail.recordsPersisted === 'number' ? `written ${detail.recordsPersisted}` : null,
  ].filter((value): value is string => Boolean(value))

  return parts.join(' · ')
}

async function copyDebugSnapshot() {
  const payload = {
    statusMessage: extension.statusMessage.value,
    errorMessage: extension.errorMessage.value,
    browserRunProgress: browserRunProgress.value,
    remoteRun: remoteRun.value,
    session: session.value,
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

function onAppBaseUrlInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  extension.updateAppBaseUrl(target.value)
}

function onApiKeyInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  extension.updateConnectionApiKey(target.value)
}

function setDetailTabConcurrency(count: number) {
  extension.updateDetailTabConcurrency(count)
}

function isStepOpen(stepId: string, status: WorkflowStatus) {
  return status !== 'complete' || expandedCompleteStepId.value === stepId
}

function isStepToggleable(status: WorkflowStatus) {
  return status === 'complete'
}

function toggleStep(stepId: string, status: WorkflowStatus) {
  if (status !== 'complete') {
    return
  }

  expandedCompleteStepId.value = expandedCompleteStepId.value === stepId ? null : stepId
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
              Preset scrape helper
            </p>
            <span class="context-pill">{{ activePresetLabel }}</span>
            <span
              class="context-pill context-pill--muted"
              data-testid="analysis-state-pill"
            >
              {{ analysisStateLabel }}
            </span>
          </div>

          <h1>Trusted preset workflow</h1>

          <p
            class="toolbar__summary"
            data-testid="toolbar-status"
          >
            <strong>{{ extension.statusMessage.value || 'Ready' }}</strong>
            <span>{{ presetNote }}</span>
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
            Scan current page
          </button>
          <button
            type="button"
            class="secondary"
            @click="extension.clearScrapeState"
          >
            Clear scrape state
          </button>
          <button
            type="button"
            class="ghost"
            data-testid="clear-settings-button"
            :disabled="!hasResettableSettings"
            @click="extension.clearSettings"
          >
            Clear settings
          </button>
        </div>
      </div>

      <div class="tab-target-card">
        <div class="tab-target-card__copy">
          <p class="eyebrow">
            Tab targeting
          </p>
          <strong>{{ trackingLockedTab ? 'Locked to one tab' : 'Following the active tab' }}</strong>
          <p>{{ tabTrackingNote }}</p>
        </div>

        <div class="tab-target-card__actions">
          <button
            type="button"
            class="secondary"
            :disabled="!trackingLockedTab"
            @click="extension.followActiveTab"
          >
            Follow active tab
          </button>
          <button
            type="button"
            @click="extension.lockCurrentTab"
          >
            {{ trackingLockedTab ? 'Use current tab instead' : 'Lock current tab' }}
          </button>
        </div>
      </div>

      <div class="status-strip">
        <article class="status-pill">
          <span>{{ trackedTabLabel }}</span>
          <strong>{{ trackedTabSummary }}</strong>
        </article>
        <article class="status-pill">
          <span>Mode</span>
          <strong>{{ tabTrackingStatusLabel }}</strong>
        </article>
        <article class="status-pill">
          <span>Preset</span>
          <strong>{{ activePresetLabel }}</strong>
        </article>
        <article class="status-pill">
          <span>Connection</span>
          <strong>{{ connectionVerified ? 'Verified' : hasApiKey ? 'Saved' : 'Missing' }}</strong>
        </article>
      </div>

      <p class="toolbar__hint">
        Use Scan current page for normal rescans. Lock the current tab if you want to keep the
        workflow stable while opening or switching to other tabs. Clear settings resets the saved
        Boat Search connection, detail-tab concurrency, and tab targeting mode.
      </p>
    </header>

    <WorkflowStepCard
      :step="1"
      title="Connect Boat Search"
      subtitle="The extension stores the app URL and API key locally so it can verify auth and write results directly."
      :status="connectionStatus"
      :note="connectionNote"
      :open="isStepOpen('connection', connectionStatus)"
      :toggleable="isStepToggleable(connectionStatus)"
      @toggle="toggleStep('connection', connectionStatus)"
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
          class="secondary"
          data-testid="connection-test-button"
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
            :value="session.appBaseUrl"
            data-testid="app-base-url-input"
            type="url"
            placeholder="https://boat-search.nard.uk"
            @input="onAppBaseUrlInput"
          >
        </label>

        <label class="stack">
          <span>Boat Search API key</span>
          <div class="input-reveal">
            <input
              :value="connection.apiKey"
              data-testid="api-key-input"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="nk_..."
              @input="onApiKeyInput"
            >
            <button
              type="button"
              class="input-reveal__toggle"
              data-testid="toggle-api-key-visibility"
              :title="showApiKey ? 'Hide API key' : 'Show API key'"
              @click="showApiKey = !showApiKey"
            >
              {{ showApiKey ? '🙈' : '👁' }}
            </button>
          </div>
        </label>
      </div>

      <p
        v-if="usingDefaultApiKey || usingDefaultAppBaseUrl"
        class="context-note"
        data-testid="dev-default-connection-note"
      >
        {{
          usingDefaultApiKey && usingDefaultAppBaseUrl
            ? 'The extension is using local dev defaults for both the API key and the Boat Search app URL.'
            : usingDefaultApiKey
              ? 'The extension is using a local dev default API key.'
              : 'The extension is using a local dev default Boat Search app URL.'
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
      :step="2"
      title="Load a trusted preset"
      subtitle="For normal rescans, scan the tracked tab, let the extension match the site preset, and optionally open one sample detail page for validation."
      :status="presetStatus"
      :note="presetNote"
      :open="isStepOpen('preset', presetStatus)"
      :toggleable="isStepToggleable(presetStatus)"
      @toggle="toggleStep('preset', presetStatus)"
    >
      <template #actions>
        <button
          type="button"
          class="secondary"
          @click="extension.analyzeCurrentPage"
        >
          Scan current page
        </button>
        <button
          v-if="
            matchedPreset?.context === 'search' &&
              (!trustedPresetActive || shouldOfferMatchedPresetLoad)
          "
          type="button"
          data-testid="load-matched-preset-button"
          @click="extension.applyMatchedPreset('manual')"
        >
          Load {{ matchedPreset.label }}
        </button>
        <button
          v-if="hasSampleDetail"
          type="button"
          class="ghost"
          data-testid="open-sample-detail-button"
          @click="extension.openSampleDetailPage"
        >
          Open sample detail
        </button>
      </template>

      <div class="task-grid task-grid--four">
        <article class="metric-card">
          <span>Site</span>
          <strong>{{ analysis?.siteName || 'Waiting for scan' }}</strong>
        </article>
        <article class="metric-card">
          <span>Page state</span>
          <strong>{{ analysisStateLabel }}</strong>
        </article>
        <article class="metric-card">
          <span>Listing cards</span>
          <strong>{{ analysis?.stats.listingCardCount ?? 0 }}</strong>
        </article>
        <article class="metric-card">
          <span>Images</span>
          <strong>{{ analysis?.stats.distinctImageCount ?? 0 }}</strong>
        </article>
      </div>

      <p class="context-note">
        {{ presetNote }}
      </p>

      <div
        v-if="analysisWarnings.length"
        class="warning-strip"
      >
        <span
          v-for="warning in analysisWarnings"
          :key="warning"
          class="warning-pill"
        >
          {{ warning }}
        </span>
      </div>

      <div
        v-if="sampleDetailRun"
        class="detail-review-banner"
        :class="{
          'detail-review-banner--warning':
            sampleDetailRun.status === 'opening' || sampleDetailRun.status === 'opened',
          'detail-review-banner--error': sampleDetailRun.status === 'error',
        }"
        data-testid="sample-detail-status"
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
    </WorkflowStepCard>

    <WorkflowStepCard
      :step="3"
      title="Run the preset scrape"
      subtitle="Search pages stay in the tracked tab while detail pages can fan out across background tabs."
      :status="runStatus"
      :note="runNote"
      :open="isStepOpen('run', runStatus)"
      :toggleable="isStepToggleable(runStatus)"
      @toggle="toggleStep('run', runStatus)"
    >
      <template #actions>
        <button
          type="button"
          :disabled="!trustedPresetActive || !hasApiKey || startingRemoteRun || verifyingConnection"
          data-testid="start-browser-scrape-button"
          @click="extension.startScrapeInBoatSearch"
        >
          {{ startingRemoteRun ? 'Running scrape…' : 'Start browser scrape' }}
        </button>
        <button
          type="button"
          class="secondary"
          :disabled="!canStopRun || stoppingRemoteRun"
          data-testid="stop-browser-scrape-button"
          @click="extension.stopScrapeInBoatSearch"
        >
          {{ stoppingRemoteRun ? 'Stopping…' : 'Stop scrape' }}
        </button>
        <button
          type="button"
          class="secondary"
          :disabled="!trustedPresetActive || startingRemoteRun"
          @click="extension.handoffToBoatSearch"
        >
          Open builder
        </button>
      </template>

      <p
        class="context-note"
        :class="{ 'context-note--warning': !trustedPresetActive || !hasApiKey }"
      >
        {{ runNote }}
      </p>

      <div class="run-settings-card">
        <div class="run-settings-card__copy">
          <span>Detail tab concurrency</span>
          <strong>
            {{ detailTabConcurrency }} detail tab{{ detailTabConcurrency === 1 ? '' : 's' }}
          </strong>
          <p>
            Search pagination stays on the tracked tab. Detail pages run in these background tabs.
          </p>
        </div>

        <div class="run-settings-card__actions">
          <button
            v-for="count in detailTabConcurrencyOptions"
            :key="count"
            type="button"
            class="secondary run-settings-card__option"
            :class="{ 'run-settings-card__option--active': detailTabConcurrency === count }"
            :disabled="runSettingsLocked"
            @click="setDetailTabConcurrency(count)"
          >
            {{ count }}
          </button>
        </div>
      </div>

      <div
        v-if="yachtWorldPresetReady"
        class="detail-backfill-panel"
        data-testid="yachtworld-detail-backfill"
      >
        <label class="detail-backfill-panel__toggle">
          <input
            type="checkbox"
            :checked="session.draft.config.detailBackfillMode"
            @change="onDetailBackfillToggle(($event.target as HTMLInputElement).checked)"
          >
          <span>YachtWorld detail URL backfill</span>
        </label>
        <p class="context-note">
          Skip search pages: each line below is opened as a listing detail page (max
          {{ session.draft.config.maxItemsPerRun }} per run). Syncs with the Boat Search pipeline
          draft.
        </p>
        <textarea
          v-if="session.draft.config.detailBackfillMode"
          v-model="detailBackfillStartUrlsText"
          class="detail-backfill-panel__urls"
          rows="6"
          placeholder="https://www.yachtworld.com/yacht/2024-example-boat-1234567/"
          aria-label="YachtWorld detail URLs, one per line"
        />
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
            <span>{{
              browserRunProgress.stage === 'detail_backfill'
                ? 'Search pages (unused)'
                : 'Search pages'
            }}</span>
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
            <span>Skipped existing</span>
            <strong>{{ browserRunProgress.skippedExisting }}</strong>
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
          <div>
            <span>Skipped existing</span>
            <strong>{{ remoteRun.summary.skippedExisting }}</strong>
          </div>
        </div>

        <p
          v-if="remoteRun.summary.warnings.length"
          class="remote-run-card__warnings"
        >
          {{ remoteRun.summary.warnings.join(' · ') }}
        </p>
      </div>

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
            <p>Keep this block when a run fails so you can see the last extension and API steps.</p>
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
  padding: 0.75rem;
  display: grid;
  gap: 0.75rem;
  color: var(--panel-text);
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.16), transparent 22rem),
    linear-gradient(180deg, #f7fbff 0%, #eef4ff 48%, #fdfefe 100%);
  font-family: 'Avenir Next', 'SF Pro Display', 'Segoe UI', ui-sans-serif, system-ui, sans-serif;
}

.toolbar {
  border-radius: 1.1rem;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.07);
  display: grid;
  gap: 0.7rem;
  padding: 0.85rem;
}

.toolbar__top {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
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
  display: grid;
  gap: 0.2rem;
  color: var(--panel-muted);
  line-height: 1.45;
  font-size: 0.84rem;
}

.toolbar__summary strong {
  color: var(--panel-text);
  font-size: 0.94rem;
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
  gap: 0.45rem;
}

.toolbar__actions button {
  white-space: nowrap;
}

.toolbar__hint {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: var(--panel-muted);
}

.tab-target-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: flex-start;
  border-radius: 1rem;
  border: 1px solid rgba(125, 211, 252, 0.48);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.94));
  padding: 0.8rem 0.85rem;
}

.tab-target-card__copy {
  min-width: 0;
  display: grid;
  gap: 0.25rem;
}

.tab-target-card__copy strong {
  color: var(--panel-text);
  font-size: 0.95rem;
}

.tab-target-card__copy p {
  margin: 0;
  color: var(--panel-muted);
  font-size: 0.8rem;
  line-height: 1.45;
}

.tab-target-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.4rem;
}

.run-settings-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  border-radius: 0.95rem;
  border: 1px solid rgba(191, 219, 254, 0.88);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.72), rgba(255, 255, 255, 0.94));
  padding: 0.8rem 0.9rem;
}

.run-settings-card__copy {
  display: grid;
  gap: 0.18rem;
  min-width: 0;
}

.run-settings-card__copy span {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0369a1;
}

.run-settings-card__copy strong {
  font-size: 0.92rem;
  color: var(--panel-text);
}

.run-settings-card__copy p {
  margin: 0;
  font-size: 0.79rem;
  line-height: 1.45;
  color: var(--panel-muted);
}

.run-settings-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
}

.run-settings-card__option {
  min-width: 2.4rem;
  padding-inline: 0.78rem;
}

.run-settings-card__option--active {
  background: #0f172a;
  color: white;
}

.status-strip,
.task-grid,
.remote-run-card__grid {
  display: grid;
  gap: 0.7rem;
}

.status-strip {
  grid-template-columns: 2fr repeat(3, minmax(0, 1fr));
}

.task-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.task-grid--four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.status-pill,
.metric-card {
  min-width: 0;
  border-radius: 0.95rem;
  border: 1px solid rgba(191, 219, 254, 0.88);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.92));
  padding: 0.65rem 0.75rem;
  display: grid;
  gap: 0.2rem;
}

.status-pill span,
.metric-card span,
.remote-run-card__grid span {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0369a1;
}

.status-pill strong,
.metric-card strong,
.remote-run-card__grid strong {
  font-size: 0.88rem;
  line-height: 1.4;
  word-break: break-word;
  color: var(--panel-text);
}

.stack {
  display: grid;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #334155;
}

.input-reveal {
  position: relative;
  display: flex;
  align-items: center;
}

.input-reveal input {
  padding-right: 2.6rem;
}

.input-reveal__toggle {
  position: absolute;
  right: 0.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: 0.55rem;
  background: transparent;
  color: var(--panel-muted);
  font-size: 1rem;
  cursor: pointer;
  line-height: 1;
}

.input-reveal__toggle:hover {
  background: rgba(148, 163, 184, 0.15);
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
  padding: 0.62rem 0.75rem;
  color: var(--panel-text);
}

button {
  border: none;
  border-radius: 999px;
  padding: 0.62rem 0.9rem;
  cursor: pointer;
  background: #0284c7;
  color: white;
  font-weight: 700;
  line-height: 1.2;
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

.warning-strip {
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

.remote-run-card {
  display: grid;
  gap: 0.65rem;
  border-radius: 0.95rem;
  border: 1px solid rgba(14, 165, 233, 0.28);
  background: rgba(239, 246, 255, 0.94);
  padding: 0.9rem;
}

.remote-run-card__grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.remote-run-card__grid div {
  display: grid;
  gap: 0.2rem;
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

.detail-backfill-panel {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.6rem;
  padding: 0.7rem 0.9rem;
  border-radius: 0.85rem;
  border: 1px solid rgba(59, 130, 246, 0.25);
  background: rgba(239, 246, 255, 0.6);
}

.detail-backfill-panel__toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  cursor: pointer;
}

.detail-backfill-panel__urls {
  width: 100%;
  box-sizing: border-box;
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  border-radius: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.5);
  padding: 0.5rem 0.65rem;
  resize: vertical;
}

code {
  word-break: break-word;
}

@media (max-width: 900px) {
  .status-strip,
  .task-grid--four,
  .remote-run-card__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .toolbar__top,
  .tab-target-card__actions,
  .run-settings-card__actions,
  .toolbar__actions,
  .scrape-debug-card__header {
    flex-direction: column;
  }

  .tab-target-card,
  .run-settings-card {
    grid-template-columns: 1fr;
  }

  .run-settings-card__actions,
  .tab-target-card__actions,
  .toolbar__actions {
    align-items: stretch;
  }

  .status-strip,
  .task-grid--two,
  .task-grid--four,
  .remote-run-card__grid {
    grid-template-columns: 1fr;
  }
}
</style>

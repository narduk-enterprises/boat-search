<script setup lang="ts">
import { computed } from 'vue'
import {
  evaluateFixtureCaptureTemplate,
  getFixtureCaptureTemplateDefinition,
  resolveFixtureLabel,
} from '@/shared/fixtureCapture'
import type {
  AutoDetectedAnalysis,
  FixtureCaptureSessionState,
  FixtureCaptureTemplate,
} from '@/shared/types'

type MatchTone = 'match' | 'mismatch' | 'unknown'

type FixtureCaptureCard = ReturnType<typeof getFixtureCaptureTemplateDefinition> & {
  capturedAt: string | null
  currentUrl: string | null
  files: string[]
  fileStem: string | null
  matchStatus: MatchTone
  matchNote: string
  resolvedLabel: string
  selected: boolean
  pendingOverride: boolean
}

const props = defineProps<{
  fixtureCapture: FixtureCaptureSessionState
  currentTabUrl: string | null
  analysis: AutoDetectedAnalysis | null
  capturing: boolean
  pendingOverrideTemplate: FixtureCaptureTemplate | null
}>()

const emit = defineEmits<{
  selectTemplate: [template: FixtureCaptureTemplate]
  updateCustomLabel: [value: string]
  captureTemplate: [template: FixtureCaptureTemplate]
  captureAnyway: [template: FixtureCaptureTemplate]
}>()

const templates = computed<FixtureCaptureCard[]>(() =>
  (['search-ok', 'search-no-results', 'detail-ok', 'detail-gallery-noise', 'custom'] as const).map(
    (template) => {
      const definition = getFixtureCaptureTemplateDefinition(template)
      const validation = evaluateFixtureCaptureTemplate(
        template,
        props.analysis,
        props.currentTabUrl,
      )
      const record = props.fixtureCapture.captured[template]
      const resolvedLabel = resolveFixtureLabel(template, props.fixtureCapture.customLabel)

      return {
        ...definition,
        capturedAt: record.capturedAt,
        currentUrl: record.currentUrl,
        files: record.files,
        fileStem: record.fileStem,
        matchStatus: validation.status,
        matchNote: validation.note,
        resolvedLabel,
        selected: props.fixtureCapture.selectedTemplate === template,
        pendingOverride: props.pendingOverrideTemplate === template,
      }
    },
  ),
)

const lastCaptureLabel = computed(() => {
  const lastCapture = props.fixtureCapture.lastCapture
  if (!lastCapture) {
    return null
  }

  return `${lastCapture.fileStem} · ${lastCapture.pageType}/${lastCapture.pageState}`
})

function matchLabel(status: MatchTone) {
  if (status === 'match') {
    return 'Matches current page'
  }

  if (status === 'mismatch') {
    return 'Needs override'
  }

  return 'Needs re-scan'
}

function emitCapture(template: FixtureCaptureTemplate) {
  emit('selectTemplate', template)
  emit('captureTemplate', template)
}

function emitCaptureAnyway(template: FixtureCaptureTemplate) {
  emit('selectTemplate', template)
  emit('captureAnyway', template)
}

function onCustomLabelInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }

  emit('updateCustomLabel', target.value)
}
</script>

<template>
  <section class="fixture-capture">
    <div class="fixture-capture__intro">
      <strong>Trusted capture flow</strong>
      <p>
        Solve challenges, dismiss banners, and scroll the active tab into the exact state you want.
        Then capture the current page to download HTML, PNG, and metadata fixtures.
      </p>
    </div>

    <div class="fixture-capture__grid">
      <article
        v-for="template in templates"
        :key="template.id"
        class="fixture-card"
        :class="{
          'fixture-card--selected': template.selected,
          'fixture-card--captured': Boolean(template.capturedAt),
        }"
        @click="emit('selectTemplate', template.id)"
      >
        <header class="fixture-card__header">
          <div class="fixture-card__copy">
            <div class="fixture-card__meta">
              <h3>{{ template.label }}</h3>
              <span
                class="fixture-card__status"
                :class="`fixture-card__status--${template.matchStatus}`"
              >
                {{ matchLabel(template.matchStatus) }}
              </span>
            </div>
            <p class="fixture-card__description">
              {{ template.description }}
            </p>
            <p class="fixture-card__shape">
              {{ template.expectedShape }}
            </p>
            <p class="fixture-card__match-note">
              {{ template.matchNote }}
            </p>
          </div>
        </header>

        <div v-if="template.id === 'custom'" class="fixture-card__custom">
          <label class="fixture-card__label">
            <span class="fixture-card__label-text">Custom label</span>
            <input
              class="fixture-card__input"
              :value="props.fixtureCapture.customLabel"
              data-testid="fixture-custom-label-input"
              type="text"
              placeholder="search-consent-banner"
              @focus="emit('selectTemplate', 'custom')"
              @input="onCustomLabelInput"
            />
          </label>
          <p class="fixture-card__resolved">
            Downloads as <code>{{ template.resolvedLabel }}</code>
          </p>
        </div>

        <div v-if="template.capturedAt" class="fixture-card__capture-summary">
          <strong>Captured</strong>
          <p>{{ template.fileStem }}</p>
          <p>{{ template.capturedAt }}</p>
          <p v-if="template.currentUrl">
            <code>{{ template.currentUrl }}</code>
          </p>
        </div>

        <div class="fixture-card__actions">
          <button
            type="button"
            class="secondary"
            :data-testid="`fixture-capture-button-${template.id}`"
            :disabled="props.capturing"
            @click.stop="emitCapture(template.id)"
          >
            {{ props.capturing && template.selected ? 'Capturing...' : 'Capture current page' }}
          </button>
          <button
            v-if="template.pendingOverride"
            type="button"
            class="ghost"
            :data-testid="`fixture-capture-anyway-button-${template.id}`"
            :disabled="props.capturing"
            @click.stop="emitCaptureAnyway(template.id)"
          >
            Capture anyway
          </button>
        </div>
      </article>
    </div>

    <div v-if="lastCaptureLabel" class="fixture-capture__last">
      <strong>Last capture</strong>
      <p>{{ lastCaptureLabel }}</p>
      <p>
        {{ props.fixtureCapture.lastCapture?.files.join(', ') }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.fixture-capture {
  display: grid;
  gap: 0.8rem;
}

.fixture-capture__intro,
.fixture-capture__last {
  display: grid;
  gap: 0.3rem;
  padding: 0.85rem 0.95rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(248, 250, 252, 0.9);
}

.fixture-capture__intro p,
.fixture-capture__last p {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: #475569;
}

.fixture-capture__grid {
  display: grid;
  gap: 0.8rem;
}

.fixture-card {
  display: grid;
  gap: 0.7rem;
  padding: 0.95rem;
  border-radius: 1rem;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.94);
  cursor: pointer;
}

.fixture-card--selected {
  border-color: rgba(14, 116, 144, 0.4);
  box-shadow: 0 16px 34px rgba(14, 116, 144, 0.08);
}

.fixture-card--captured {
  background: rgba(240, 253, 250, 0.95);
}

.fixture-card__header,
.fixture-card__copy,
.fixture-card__custom,
.fixture-card__capture-summary {
  display: grid;
  gap: 0.35rem;
}

.fixture-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
}

.fixture-card__meta h3,
.fixture-card__description,
.fixture-card__shape,
.fixture-card__match-note,
.fixture-card__capture-summary p,
.fixture-card__resolved {
  margin: 0;
}

.fixture-card__description,
.fixture-card__shape,
.fixture-card__match-note,
.fixture-card__capture-summary p,
.fixture-card__resolved,
.fixture-card__label-text {
  font-size: 0.84rem;
  line-height: 1.45;
  color: #475569;
}

.fixture-card__shape {
  color: #0f172a;
}

.fixture-card__status {
  display: inline-flex;
  align-items: center;
  min-height: 1.75rem;
  padding: 0.22rem 0.6rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
}

.fixture-card__status--match {
  background: rgba(220, 252, 231, 0.9);
  color: #166534;
}

.fixture-card__status--mismatch {
  background: rgba(254, 242, 242, 0.92);
  color: #b91c1c;
}

.fixture-card__status--unknown {
  background: rgba(241, 245, 249, 0.95);
  color: #334155;
}

.fixture-card__label {
  display: grid;
  gap: 0.35rem;
}

.fixture-card__input {
  width: 100%;
  box-sizing: border-box;
  border-radius: 0.85rem;
  border: 1px solid #cbd5e1;
  background: white;
  padding: 0.68rem 0.8rem;
  color: #0f172a;
}

.fixture-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.fixture-card__actions button {
  border: none;
  border-radius: 999px;
  padding: 0.68rem 0.95rem;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  background: #0284c7;
  color: white;
}

.fixture-card__actions button.secondary {
  background: #e2e8f0;
  color: #0f172a;
}

.fixture-card__actions button.ghost {
  background: white;
  color: #0f172a;
  border: 1px solid #cbd5e1;
}

.fixture-card__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
</style>

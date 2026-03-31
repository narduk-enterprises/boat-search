<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { FIELD_EXTRACT_TYPES, FIELD_KEYS, FIELD_TRANSFORMS } from '@/shared/types'
import type { PickerRequest, ScraperFieldRule, ScraperFieldScope } from '@/shared/types'

type FieldPreviewState = {
  fieldId: string
  status: 'loading' | 'ready' | 'error'
  matchCount: number
  highlightedCount: number
  sampleValues: string[]
  error: string
} | null

const props = defineProps<{
  title: string
  subtitle: string
  scope: ScraperFieldScope
  pendingPicker: PickerRequest | null
  preview: FieldPreviewState
}>()

const fields = defineModel<ScraperFieldRule[]>({ required: true })
const expandedIndex = shallowRef<number | null>(null)

const emit = defineEmits<{
  pickField: [field: ScraperFieldRule]
  addField: [scope: ScraperFieldScope]
  removeField: [index: number]
  previewField: [field: ScraperFieldRule]
  clearPreview: []
}>()

function fieldId(field: ScraperFieldRule) {
  return `${field.scope}:${field.key}`
}

function isPending(field: ScraperFieldRule) {
  return (
    props.pendingPicker?.kind === 'field' &&
    props.pendingPicker.fieldKey === field.key &&
    props.pendingPicker.scope === field.scope
  )
}

function isPreviewed(field: ScraperFieldRule) {
  return props.preview?.fieldId === fieldId(field)
}

function formatFieldName(key: ScraperFieldRule['key']) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())
}

function summarizeField(field: ScraperFieldRule) {
  if (!field.selector.trim()) {
    return 'No selector captured yet.'
  }

  const extraction =
    field.extract === 'attr' && field.attribute
      ? `${field.extract} ${field.attribute}`
      : field.extract

  return `${extraction} from ${field.selector}`
}

function previewStatus(field: ScraperFieldRule) {
  if (!isPreviewed(field) || !props.preview) {
    return 'Hover or click Show on page to highlight this mapping.'
  }

  if (props.preview.status === 'loading') {
    return 'Checking the current page for matches...'
  }

  if (props.preview.error) {
    return props.preview.error
  }

  return `${props.preview.highlightedCount} highlighted now, ${props.preview.matchCount} total match${props.preview.matchCount === 1 ? '' : 'es'} on this page.`
}

function toggleField(index: number) {
  expandedIndex.value = expandedIndex.value === index ? null : index
}

function togglePreview(field: ScraperFieldRule) {
  if (isPreviewed(field)) {
    emit('clearPreview')
    return
  }

  emit('previewField', field)
}

watch(
  () => fields.value.length,
  (nextLength, previousLength = 0) => {
    if (nextLength > previousLength) {
      expandedIndex.value = nextLength - 1
      return
    }

    if (expandedIndex.value != null && expandedIndex.value >= nextLength) {
      expandedIndex.value = nextLength > 0 ? nextLength - 1 : null
    }
  },
  { immediate: true },
)
</script>

<template>
  <section class="field-list">
    <div class="field-list__header">
      <div>
        <h3>{{ props.title }}</h3>
        <p>{{ props.subtitle }}</p>
        <p class="field-list__summary">
          {{ fields.length }} mapping{{ fields.length === 1 ? '' : 's' }}. Use
          <strong>Show on page</strong> for fast spot checks.
        </p>
      </div>
      <button type="button" class="secondary" @click="emit('addField', props.scope)">
        Add mapping
      </button>
    </div>

    <div v-if="!fields.length" class="field-list__empty">
      <strong>No fields yet</strong>
      <p>Add a field manually or run detection on the current page to generate suggestions.</p>
    </div>

    <div v-else class="field-list__items">
      <article
        v-for="(field, index) in fields"
        :key="`${field.scope}-${field.key}-${index}`"
        class="field-card"
        :class="{
          'field-card--previewed': isPreviewed(field),
          'field-card--open': expandedIndex === index,
        }"
        @mouseenter="emit('previewField', field)"
      >
        <div class="field-card__head">
          <div class="field-card__intro">
            <div class="field-card__chips">
              <span class="field-chip field-chip--primary">{{ formatFieldName(field.key) }}</span>
              <span class="field-chip">{{ field.extract }}</span>
              <span class="field-chip">{{ field.transform }}</span>
              <span v-if="field.required" class="field-chip field-chip--required"> Required </span>
              <span v-if="field.multiple" class="field-chip"> Multiple </span>
            </div>

            <p class="field-card__selector">
              {{ summarizeField(field) }}
            </p>

            <p
              class="field-card__preview"
              :class="{ 'field-card__preview--error': isPreviewed(field) && props.preview?.error }"
            >
              {{ previewStatus(field) }}
            </p>

            <div
              v-if="isPreviewed(field) && props.preview?.sampleValues.length"
              class="field-card__samples"
            >
              <span v-for="sample in props.preview.sampleValues" :key="sample" class="sample-chip">
                {{ sample }}
              </span>
            </div>
          </div>

          <div class="field-card__quick-actions">
            <button type="button" class="secondary" @click="togglePreview(field)">
              {{ isPreviewed(field) ? 'Hide preview' : 'Show on page' }}
            </button>
            <button type="button" class="ghost" @click="toggleField(index)">
              {{ expandedIndex === index ? 'Hide editor' : 'Edit mapping' }}
            </button>
            <button type="button" class="secondary" @click="emit('pickField', field)">
              {{ isPending(field) ? 'Click page...' : 'Pick again' }}
            </button>
            <button type="button" class="danger danger--ghost" @click="emit('removeField', index)">
              Remove
            </button>
          </div>
        </div>

        <div v-if="expandedIndex === index" class="field-card__editor">
          <div class="field-card__row">
            <label>
              <span>Field</span>
              <select v-model="field.key">
                <option v-for="key in FIELD_KEYS" :key="key" :value="key">{{ key }}</option>
              </select>
            </label>

            <label>
              <span>Extract</span>
              <select v-model="field.extract">
                <option v-for="extract in FIELD_EXTRACT_TYPES" :key="extract" :value="extract">
                  {{ extract }}
                </option>
              </select>
            </label>

            <label>
              <span>Transform</span>
              <select v-model="field.transform">
                <option v-for="transform in FIELD_TRANSFORMS" :key="transform" :value="transform">
                  {{ transform }}
                </option>
              </select>
            </label>
          </div>

          <label class="field-card__stack">
            <span>Selector</span>
            <input v-model="field.selector" type="text" placeholder=".price, h1, a[href]" />
          </label>

          <div class="field-card__row field-card__row--secondary">
            <label>
              <span>Attribute</span>
              <input v-model="field.attribute" type="text" placeholder="href, src, content" />
            </label>

            <label>
              <span>Regex</span>
              <input v-model="field.regex" type="text" placeholder="(\\d{4})" />
            </label>
          </div>

          <div class="field-card__footer">
            <label class="checkbox">
              <input v-model="field.multiple" type="checkbox" />
              <span>Multiple values</span>
            </label>

            <label class="checkbox">
              <input v-model="field.required" type="checkbox" />
              <span>Required for import</span>
            </label>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.field-list {
  display: grid;
  gap: 0.75rem;
}

.field-list__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.field-list__header h3 {
  margin: 0;
  font-size: 0.92rem;
}

.field-list__header p {
  margin: 0.3rem 0 0;
  color: #6b7280;
  font-size: 0.8rem;
  line-height: 1.35;
}

.field-list__summary {
  margin: 0.35rem 0 0;
  color: #0f172a;
  font-size: 0.8rem;
  font-weight: 600;
}

.field-list__empty {
  border: 1px dashed rgba(148, 163, 184, 0.45);
  border-radius: 1rem;
  padding: 1rem;
  display: grid;
  gap: 0.35rem;
  background: rgba(248, 250, 252, 0.8);
}

.field-list__empty strong,
.field-list__empty p {
  margin: 0;
}

.field-list__empty p {
  color: #64748b;
  font-size: 0.84rem;
  line-height: 1.5;
}

.field-list__items {
  display: grid;
  gap: 0.65rem;
}

.field-card {
  border: 1px solid #dbe4f0;
  border-radius: 0.95rem;
  padding: 0.75rem;
  display: grid;
  gap: 0.6rem;
  background: #f8fbff;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease;
}

.field-card--open {
  padding-bottom: 0.85rem;
}

.field-card:hover,
.field-card--previewed {
  border-color: rgba(14, 165, 233, 0.36);
  box-shadow: 0 16px 34px rgba(14, 165, 233, 0.1);
  transform: translateY(-1px);
}

.field-card__head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.field-card__intro {
  min-width: 0;
  display: grid;
  gap: 0.45rem;
}

.field-card__chips,
.field-card__samples {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.field-chip,
.sample-chip {
  display: inline-flex;
  align-items: center;
  min-height: 1.55rem;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.9);
  color: #334155;
  font-size: 0.72rem;
  font-weight: 600;
}

.field-chip--primary {
  background: rgba(191, 219, 254, 0.95);
  color: #1d4ed8;
}

.field-chip--required {
  background: rgba(219, 234, 254, 0.9);
  color: #075985;
}

.sample-chip {
  background: rgba(224, 242, 254, 0.95);
  color: #0f172a;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-card__selector {
  margin: 0;
  color: #475569;
  font-size: 0.8rem;
  line-height: 1.4;
  word-break: break-word;
}

.field-card__preview {
  margin: 0;
  padding: 0.45rem 0.65rem;
  border-radius: 0.85rem;
  background: rgba(239, 246, 255, 0.92);
  border: 1px solid rgba(191, 219, 254, 0.8);
  color: #0f172a;
  font-size: 0.77rem;
  line-height: 1.35;
}

.field-card__preview--error {
  background: rgba(254, 242, 242, 0.96);
  border-color: rgba(252, 165, 165, 0.8);
}

.field-card__preview--error {
  color: #991b1b;
}

.field-card__quick-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
}

.danger--ghost {
  background: rgba(254, 242, 242, 0.96);
  color: #b91c1c;
}

.field-card__editor {
  display: grid;
  gap: 0.65rem;
  padding-top: 0.15rem;
  border-top: 1px solid rgba(203, 213, 225, 0.8);
}

.field-card__row {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.field-card__row--secondary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field-card__stack {
  display: grid;
  gap: 0.4rem;
}

.field-card__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
}

.checkbox {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  color: #334155;
  font-size: 0.82rem;
}

label {
  display: grid;
  gap: 0.4rem;
}

label span {
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
}

input,
select {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 0.85rem;
  min-height: 2.75rem;
  padding: 0 0.85rem;
  font: inherit;
  color: #0f172a;
  background: #fff;
}

input[type='checkbox'] {
  width: 1rem;
  min-height: 1rem;
  padding: 0;
  border-radius: 0.3rem;
}

@media (max-width: 900px) {
  .field-card__head,
  .field-list__header,
  .field-card__footer {
    grid-template-columns: 1fr;
    display: grid;
  }

  .field-card__row,
  .field-card__row--secondary {
    grid-template-columns: 1fr;
  }

  .field-card__quick-actions {
    justify-content: stretch;
  }

  .field-card__quick-actions button {
    width: 100%;
  }
}
</style>

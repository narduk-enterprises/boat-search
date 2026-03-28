<script setup lang="ts">
import {
  SCRAPER_FIELD_EXTRACT_TYPES,
  SCRAPER_FIELD_KEYS,
  SCRAPER_FIELD_SCOPES,
  SCRAPER_FIELD_TRANSFORMS,
  multilineToList,
  listToMultiline,
  type ScraperPipelineDraft,
} from '~~/lib/scraperPipeline'

const props = defineProps<{
  pipelineItems: Array<{ label: string; value: string }>
  selectedPipelineId: number | null
  saving: boolean
  previewing: boolean
  running: boolean
}>()

const emit = defineEmits<{
  selectPipeline: [pipelineId: number | null]
  createNewPipeline: []
  addFieldRule: []
  duplicateFieldRule: [index: number]
  removeFieldRule: [index: number]
  save: []
  preview: []
  run: []
}>()

const draft = defineModel<ScraperPipelineDraft>({ required: true })

const selectedPipelineValue = computed({
  get: () => (props.selectedPipelineId == null ? undefined : String(props.selectedPipelineId)),
  set: (value: string | undefined) => {
    emit('selectPipeline', value ? Number.parseInt(value, 10) : null)
  },
})

const startUrlsText = computed({
  get: () => listToMultiline(draft.value.config.startUrls),
  set: (value: string) => {
    draft.value.config.startUrls = multilineToList(value)
  },
})

const allowedDomainsText = computed({
  get: () => listToMultiline(draft.value.config.allowedDomains),
  set: (value: string) => {
    draft.value.config.allowedDomains = multilineToList(value)
  },
})
</script>

<template>
  <div class="space-y-6">
    <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-5' }">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 class="text-xl font-semibold text-default">Pipeline editor</h2>
          <p class="mt-1 text-sm text-muted">
            Configure selectors, preview extraction, then ingest directly into the boat inventory.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            label="New pipeline"
            icon="i-lucide-plus"
            color="neutral"
            variant="soft"
            @click="emit('createNewPipeline')"
          />
          <UButton
            label="Preview"
            icon="i-lucide-scan-search"
            color="neutral"
            variant="soft"
            :loading="props.previewing"
            @click="emit('preview')"
          />
          <UButton
            label="Save"
            icon="i-lucide-save"
            color="neutral"
            variant="soft"
            :loading="props.saving"
            @click="emit('save')"
          />
          <UButton
            label="Run pipeline"
            icon="i-lucide-play"
            :loading="props.running"
            @click="emit('run')"
          />
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Saved pipelines">
          <USelectMenu
            v-model="selectedPipelineValue"
            :items="props.pipelineItems"
            value-key="value"
            label-key="label"
            class="w-full"
            placeholder="Select an existing pipeline"
          />
        </UFormField>

        <UFormField label="Boat source" required>
          <UInput
            v-model="draft.boatSource"
            class="w-full"
            placeholder="e.g. boats.com or galveston-brokers"
          />
        </UFormField>

        <UFormField label="Pipeline name" required>
          <UInput v-model="draft.name" class="w-full" placeholder="Gulf coast sportfish listings" />
        </UFormField>

        <UFormField label="Status">
          <div class="flex h-10 items-center rounded-xl border border-default px-3">
            <UCheckbox v-model="draft.active" label="Active" />
          </div>
        </UFormField>
      </div>

      <UFormField label="Description">
        <UTextarea
          v-model="draft.description"
          class="w-full"
          autoresize
          placeholder="Describe the target source, coverage, or normalization quirks."
        />
      </UFormField>
    </UCard>

    <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-5' }">
      <div>
        <h3 class="text-lg font-semibold text-default">Page discovery</h3>
        <p class="mt-1 text-sm text-muted">
          One start URL or hostname per line. Pagination is optional and stops at the page cap.
        </p>
      </div>

      <div class="grid gap-4 xl:grid-cols-2">
        <UFormField label="Start URLs" required>
          <UTextarea
            v-model="startUrlsText"
            class="w-full min-h-32"
            autoresize
            placeholder="https://example.com/boats-for-sale"
          />
        </UFormField>

        <UFormField label="Allowed domains">
          <UTextarea
            v-model="allowedDomainsText"
            class="w-full min-h-32"
            autoresize
            placeholder="example.com&#10;listings.examplecdn.com"
          />
        </UFormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <UFormField label="Item selector" required>
          <UInput v-model="draft.config.itemSelector" class="w-full" placeholder=".listing-card" />
        </UFormField>

        <UFormField label="Next-page selector">
          <UInput
            v-model="draft.config.nextPageSelector"
            class="w-full"
            placeholder="a[rel='next']"
          />
        </UFormField>

        <UFormField label="Max pages">
          <UInput v-model.number="draft.config.maxPages" class="w-full" type="number" min="1" />
        </UFormField>

        <UFormField label="Max items per run">
          <UInput
            v-model.number="draft.config.maxItemsPerRun"
            class="w-full"
            type="number"
            min="1"
          />
        </UFormField>
      </div>

      <div class="rounded-xl border border-default bg-elevated px-4 py-3">
        <UCheckbox
          v-model="draft.config.fetchDetailPages"
          label="Fetch detail pages for any rule using detail scope"
        />
      </div>
    </UCard>

    <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-4' }">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-default">Field rules</h3>
          <p class="mt-1 text-sm text-muted">
            The URL rule is required. Use `:root` when a rule should target the current item or
            detail document itself.
          </p>
        </div>

        <UButton
          label="Add field"
          icon="i-lucide-plus"
          color="neutral"
          variant="soft"
          @click="emit('addFieldRule')"
        />
      </div>

      <div class="space-y-4">
        <div
          v-for="(field, index) in draft.config.fields"
          :key="`${field.key}-${index}`"
          class="rounded-2xl border border-default bg-elevated/50 p-4 space-y-4"
        >
          <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p class="text-sm font-semibold text-default">Rule {{ index + 1 }}</p>
              <p class="text-xs text-muted">
                Map one selector to one boat field, then decide whether it reads from the listing or
                its detail page.
              </p>
            </div>

            <div class="flex flex-wrap gap-2">
              <UButton
                label="Duplicate"
                icon="i-lucide-copy"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="emit('duplicateFieldRule', index)"
              />
              <UButton
                label="Remove"
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="sm"
                :disabled="draft.config.fields.length <= 1"
                @click="emit('removeFieldRule', index)"
              />
            </div>
          </div>

          <div class="grid gap-4 xl:grid-cols-4">
            <UFormField label="Field key" required>
              <USelectMenu v-model="field.key" :items="[...SCRAPER_FIELD_KEYS]" class="w-full" />
            </UFormField>

            <UFormField label="Scope" required>
              <USelectMenu
                v-model="field.scope"
                :items="[...SCRAPER_FIELD_SCOPES]"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Extract mode" required>
              <USelectMenu
                v-model="field.extract"
                :items="[...SCRAPER_FIELD_EXTRACT_TYPES]"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Transform">
              <USelectMenu
                v-model="field.transform"
                :items="[...SCRAPER_FIELD_TRANSFORMS]"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid gap-4 xl:grid-cols-3">
            <UFormField label="Selector" required class="xl:col-span-2">
              <UInput v-model="field.selector" class="w-full" placeholder="a, .price, :root" />
            </UFormField>

            <UFormField label="Attribute">
              <UInput v-model="field.attribute" class="w-full" placeholder="href, src, content" />
            </UFormField>
          </div>

          <div class="grid gap-4 xl:grid-cols-3">
            <UFormField label="Regex capture (optional)">
              <UInput v-model="field.regex" class="w-full" placeholder="\\$(\\d[\\d,]+)" />
            </UFormField>

            <UFormField label="Join with">
              <UInput v-model="field.joinWith" class="w-full" placeholder="\\n" />
            </UFormField>

            <div class="flex flex-col gap-3 justify-end lg:flex-row lg:items-center">
              <div class="rounded-xl border border-default px-3 py-2">
                <UCheckbox v-model="field.multiple" label="Multiple matches" />
              </div>
              <div class="rounded-xl border border-default px-3 py-2">
                <UCheckbox v-model="field.required" label="Required" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

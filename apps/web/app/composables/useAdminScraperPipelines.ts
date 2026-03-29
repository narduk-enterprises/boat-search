import {
  createDefaultScraperFieldRules,
  createEmptyScraperPipelineDraft,
  decodeScraperDraftFromTransfer,
  listToMultiline,
  multilineToList,
  scraperPipelineMutationSchema,
  type ScraperFieldRule,
  type ScraperPipelineDraft,
  type ScraperPipelineRecord,
  type ScraperRunSummary,
} from '~~/lib/scraperPipeline'

interface PipelineListResponse {
  pipelines: ScraperPipelineRecord[]
}

function toDraft(record: ScraperPipelineRecord): ScraperPipelineDraft {
  return {
    name: record.name,
    boatSource: record.boatSource,
    description: record.description,
    active: record.active,
    config: structuredClone(record.config),
  }
}

function createEmptyFieldRule(): ScraperFieldRule {
  return {
    key: 'description',
    scope: 'detail',
    selector: '',
    extract: 'text',
    attribute: '',
    multiple: false,
    joinWith: '\n',
    transform: 'text',
    regex: '',
    required: false,
  }
}

export function useAdminScraperPipelines() {
  const toast = useToast()
  const appFetch = useAppFetch()
  const route = useRoute()
  const router = useRouter()
  const selectedPipelineId = shallowRef<number | null>(null)
  const draft = ref<ScraperPipelineDraft>(createEmptyScraperPipelineDraft())
  const previewSummary = ref<ScraperRunSummary | null>(null)
  const runSummary = ref<ScraperRunSummary | null>(null)
  const runningJobId = shallowRef<number | null>(null)
  const preserveImportedDraft = shallowRef(false)
  const saving = shallowRef(false)
  const previewing = shallowRef(false)
  const running = shallowRef(false)

  const { data, status, refresh } = useFetch<PipelineListResponse>('/api/admin/scraper-pipelines', {
    key: 'admin-scraper-pipelines',
  })

  const pipelines = computed(() => data.value?.pipelines ?? [])
  const selectedPipeline = computed(
    () => pipelines.value.find((pipeline) => pipeline.id === selectedPipelineId.value) ?? null,
  )
  const pipelineItems = computed(() =>
    pipelines.value.map((pipeline) => ({
      label: pipeline.name,
      value: String(pipeline.id),
    })),
  )

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

  watch(
    () => route.query.draft,
    async (encodedDraft) => {
      if (!import.meta.client) return
      if (!encodedDraft || typeof encodedDraft !== 'string') return

      try {
        draft.value = decodeScraperDraftFromTransfer(encodedDraft)
        selectedPipelineId.value = null
        previewSummary.value = null
        runSummary.value = null
        runningJobId.value = null
        preserveImportedDraft.value = true
        const shouldAutoRun = route.query.autorun === '1' || route.query.autorun === 'true'
        const nextQuery = { ...route.query }
        delete nextQuery.draft
        delete nextQuery.autorun
        await router.replace({ query: nextQuery })

        if (shouldAutoRun) {
          toast.add({
            title: 'Draft imported',
            description: 'Starting the scrape with the imported Chrome helper draft.',
            color: 'success',
          })
          await runPipeline()
          return
        }

        toast.add({
          title: 'Draft imported',
          description: 'Selector draft loaded from the Chrome helper.',
          color: 'success',
        })
      } catch (error: unknown) {
        const err = error as { message?: string }
        toast.add({
          title: 'Could not import draft',
          description: err.message || 'The extension handoff was not valid JSON.',
          color: 'error',
        })
      }
    },
    { immediate: true },
  )

  watch(
    pipelines,
    (nextPipelines) => {
      if (preserveImportedDraft.value && selectedPipelineId.value == null) {
        return
      }

      if (!nextPipelines.length) {
        if (selectedPipelineId.value === null) {
          draft.value = createEmptyScraperPipelineDraft()
          previewSummary.value = null
          runSummary.value = null
        }
        return
      }

      const pipelineStillExists = nextPipelines.some(
        (pipeline) => pipeline.id === selectedPipelineId.value,
      )

      if (!pipelineStillExists) {
        selectPipeline(nextPipelines[0]?.id ?? null)
      }
    },
    { immediate: true },
  )

  function selectPipeline(pipelineId: number | null) {
    preserveImportedDraft.value = false
    selectedPipelineId.value = pipelineId

    if (pipelineId == null) {
      draft.value = createEmptyScraperPipelineDraft()
      previewSummary.value = null
      runSummary.value = null
      runningJobId.value = null
      return
    }

    const pipeline = pipelines.value.find((entry) => entry.id === pipelineId)
    if (!pipeline) return

    draft.value = toDraft(pipeline)
    previewSummary.value = pipeline.lastJob?.summary ?? null
    runSummary.value = pipeline.lastJob?.summary ?? null
    runningJobId.value = pipeline.lastJob?.id ?? null
  }

  function createNewPipeline() {
    preserveImportedDraft.value = false
    const previousSource = draft.value.boatSource
    selectPipeline(null)
    draft.value.boatSource = previousSource
    if (!draft.value.config.fields.length) {
      draft.value.config.fields = createDefaultScraperFieldRules()
    }
  }

  function addFieldRule() {
    draft.value.config.fields.push(createEmptyFieldRule())
  }

  function duplicateFieldRule(index: number) {
    const existing = draft.value.config.fields[index]
    if (!existing) return
    draft.value.config.fields.splice(index + 1, 0, structuredClone(existing))
  }

  function removeFieldRule(index: number) {
    if (draft.value.config.fields.length <= 1) return
    draft.value.config.fields.splice(index, 1)
  }

  async function persistDraft() {
    const payload = scraperPipelineMutationSchema.parse(draft.value)
    const isUpdate = selectedPipelineId.value != null
    saving.value = true

    try {
      const response = selectedPipelineId.value
        ? await appFetch<{ pipeline: ScraperPipelineRecord }>(
            `/api/admin/scraper-pipelines/${selectedPipelineId.value}`,
            {
              method: 'PUT',
              body: payload,
            },
          )
        : await appFetch<{ pipeline: ScraperPipelineRecord }>('/api/admin/scraper-pipelines', {
            method: 'POST',
            body: payload,
          })

      await refresh()
      selectedPipelineId.value = response.pipeline.id
      preserveImportedDraft.value = false
      draft.value = toDraft(response.pipeline)
      toast.add({
        title: isUpdate ? 'Pipeline saved' : 'Pipeline created',
        color: 'success',
      })
      return response.pipeline
    } catch (error: unknown) {
      const err = error as { data?: { statusMessage?: string }; message?: string }
      toast.add({
        title: 'Could not save pipeline',
        description: err.data?.statusMessage || err.message || 'Try again.',
        color: 'error',
      })
      throw error
    } finally {
      saving.value = false
    }
  }

  async function previewDraft() {
    previewing.value = true
    previewSummary.value = null

    try {
      const payload = scraperPipelineMutationSchema.parse(draft.value)
      const response = await appFetch<{ summary: ScraperRunSummary }>(
        '/api/admin/scraper-pipelines/preview',
        {
          method: 'POST',
          body: payload,
        },
      )
      previewSummary.value = response.summary
      toast.add({
        title: 'Preview complete',
        description:
          response.summary.skippedExisting > 0
            ? `Extracted ${response.summary.itemsExtracted} listing candidates and skipped ${response.summary.skippedExisting} existing boats.`
            : `Extracted ${response.summary.itemsExtracted} listing candidates.`,
        color: 'success',
      })
    } catch (error: unknown) {
      const err = error as { data?: { statusMessage?: string }; message?: string }
      toast.add({
        title: 'Preview failed',
        description: err.data?.statusMessage || err.message || 'Try again.',
        color: 'error',
      })
    } finally {
      previewing.value = false
    }
  }

  async function runPipeline() {
    running.value = true

    try {
      const pipeline =
        selectedPipelineId.value == null
          ? await persistDraft()
          : (selectedPipeline.value as ScraperPipelineRecord | null)

      if (!pipeline) {
        throw new Error('Save the pipeline before running it.')
      }

      const response = await appFetch<{ jobId: number | null; summary: ScraperRunSummary }>(
        `/api/admin/scraper-pipelines/${pipeline.id}/run`,
        {
          method: 'POST',
        },
      )

      runningJobId.value = response.jobId
      runSummary.value = response.summary
      previewSummary.value = response.summary
      await refresh()
      toast.add({
        title: 'Pipeline run complete',
        description:
          response.summary.skippedExisting > 0
            ? `Inserted ${response.summary.inserted}, updated ${response.summary.updated}, and skipped ${response.summary.skippedExisting} existing boats.`
            : `Inserted ${response.summary.inserted} and updated ${response.summary.updated} boats.`,
        color: 'success',
      })
    } catch (error: unknown) {
      const err = error as { data?: { statusMessage?: string }; message?: string }
      toast.add({
        title: 'Pipeline run failed',
        description: err.data?.statusMessage || err.message || 'Try again.',
        color: 'error',
      })
    } finally {
      running.value = false
    }
  }

  return {
    status,
    pipelines,
    pipelineItems,
    selectedPipelineId,
    selectedPipeline,
    draft,
    startUrlsText,
    allowedDomainsText,
    previewSummary,
    runSummary,
    runningJobId,
    saving,
    previewing,
    running,
    selectPipeline,
    createNewPipeline,
    addFieldRule,
    duplicateFieldRule,
    removeFieldRule,
    persistDraft,
    previewDraft,
    runPipeline,
    refresh,
  }
}

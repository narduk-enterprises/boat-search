import type { Ref } from 'vue'
import type {
  ScraperDetailStatus,
  ScraperDuplicateDecision,
  ScraperJobAuditDetail,
  ScraperJobAuditListing,
  ScraperJobAuditListingFilters,
  ScraperPersistenceStatus,
} from '~~/lib/scraperPipeline'

type JobAuditStatus = 'idle' | 'pending' | 'success' | 'error'

function createDefaultFilters(): ScraperJobAuditListingFilters {
  return {
    duplicateDecision: 'all',
    detailStatus: 'all',
    persistenceStatus: 'all',
    weakFingerprintOnly: false,
    errorsOnly: false,
    page: 1,
    pageSize: 25,
  }
}

export function useScraperJobAudit(jobId: Ref<number | null>) {
  const appFetch = useAppFetch()
  const status = shallowRef<JobAuditStatus>('idle')
  const errorMessage = shallowRef('')
  const audit = shallowRef<ScraperJobAuditDetail | null>(null)
  const filters = ref<ScraperJobAuditListingFilters>(createDefaultFilters())
  const selectedListing = shallowRef<ScraperJobAuditListing | null>(null)
  const listingModalOpen = shallowRef(false)

  async function loadAudit() {
    if (!jobId.value) {
      audit.value = null
      status.value = 'idle'
      errorMessage.value = ''
      return
    }

    status.value = 'pending'
    errorMessage.value = ''

    try {
      audit.value = await appFetch<ScraperJobAuditDetail>(
        `/api/admin/scraper-jobs/${jobId.value}`,
        {
          method: 'GET',
          query: {
            duplicateDecision: filters.value.duplicateDecision,
            detailStatus: filters.value.detailStatus,
            persistenceStatus: filters.value.persistenceStatus,
            weakFingerprintOnly: filters.value.weakFingerprintOnly ? '1' : '0',
            errorsOnly: filters.value.errorsOnly ? '1' : '0',
            page: filters.value.page,
            pageSize: filters.value.pageSize,
          },
        },
      )
      status.value = 'success'
    } catch (error: unknown) {
      const err = error as { data?: { statusMessage?: string }; message?: string }
      audit.value = null
      status.value = 'error'
      errorMessage.value = err.data?.statusMessage || err.message || 'Could not load run details.'
    }
  }

  function updateFilter<Key extends keyof ScraperJobAuditListingFilters>(
    key: Key,
    value: ScraperJobAuditListingFilters[Key],
  ) {
    if (key !== 'page') {
      filters.value.page = 1
    }
    filters.value = {
      ...filters.value,
      [key]: value,
    }
  }

  function setDuplicateDecision(value: ScraperDuplicateDecision | 'all') {
    updateFilter('duplicateDecision', value)
  }

  function setDetailStatus(value: ScraperDetailStatus | 'all') {
    updateFilter('detailStatus', value)
  }

  function setPersistenceStatus(value: ScraperPersistenceStatus | 'all') {
    updateFilter('persistenceStatus', value)
  }

  function setWeakFingerprintOnly(value: boolean) {
    updateFilter('weakFingerprintOnly', value)
  }

  function setErrorsOnly(value: boolean) {
    updateFilter('errorsOnly', value)
  }

  function setPage(value: number) {
    updateFilter('page', value)
  }

  function openListing(listing: ScraperJobAuditListing) {
    selectedListing.value = listing
    listingModalOpen.value = true
  }

  function closeListing() {
    listingModalOpen.value = false
    selectedListing.value = null
  }

  watch(
    jobId,
    () => {
      filters.value = createDefaultFilters()
      void loadAudit()
    },
    { immediate: true },
  )

  watch(
    filters,
    () => {
      void loadAudit()
    },
    { deep: true },
  )

  return {
    status,
    errorMessage,
    audit,
    filters,
    selectedListing,
    listingModalOpen,
    loadAudit,
    setDuplicateDecision,
    setDetailStatus,
    setPersistenceStatus,
    setWeakFingerprintOnly,
    setErrorsOnly,
    setPage,
    openListing,
    closeListing,
  }
}

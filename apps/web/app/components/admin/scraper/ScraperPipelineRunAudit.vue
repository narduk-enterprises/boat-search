<script setup lang="ts">
import type {
  ScraperDetailStatus,
  ScraperDuplicateDecision,
  ScraperJobAuditEvent,
  ScraperPersistenceStatus,
} from '~~/lib/scraperPipeline'

const props = defineProps<{
  jobId: number | null
}>()

const auditState = useScraperJobAudit(toRef(props, 'jobId'))

const duplicateDecisionItems = [
  { label: 'All duplicate states', value: 'all' },
  { label: 'New listings', value: 'new' },
  { label: 'Skipped duplicates', value: 'known_duplicate_skipped' },
  { label: 'Weak refreshes', value: 'weak_existing_refresh' },
] satisfies Array<{ label: string; value: ScraperDuplicateDecision | 'all' }>

const detailStatusItems = [
  { label: 'All detail states', value: 'all' },
  { label: 'Not attempted', value: 'not_attempted' },
  { label: 'Queued', value: 'queued' },
  { label: 'Scraped', value: 'scraped' },
  { label: 'Retry queued', value: 'retry_queued' },
  { label: 'Retry scraped', value: 'retry_scraped' },
  { label: 'Failed', value: 'failed' },
  { label: 'Stopped', value: 'stopped' },
] satisfies Array<{ label: string; value: ScraperDetailStatus | 'all' }>

const persistenceStatusItems = [
  { label: 'All persistence states', value: 'all' },
  { label: 'Not attempted', value: 'not_attempted' },
  { label: 'Inserted', value: 'inserted' },
  { label: 'Updated', value: 'updated' },
  { label: 'Unchanged', value: 'unchanged' },
  { label: 'Failed', value: 'failed' },
] satisfies Array<{ label: string; value: ScraperPersistenceStatus | 'all' }>

const overviewCards = computed(() => {
  const overview = auditState.audit.value?.overview
  if (!overview) {
    return []
  }

  return [
    { label: 'Tracked listings', value: overview.totalListings },
    { label: 'Skipped duplicates', value: overview.duplicateSkipped },
    { label: 'Weak refreshes', value: overview.weakRefreshes },
    { label: 'Retries queued', value: overview.retriesQueued },
    { label: 'Retries completed', value: overview.retriesCompleted },
    { label: 'Weak fingerprints', value: overview.weakFingerprintListings },
    { label: 'Detail failures', value: overview.detailFailed },
    { label: 'Persistence failures', value: overview.persistenceFailed },
  ]
})

const selectedListingAuditText = computed(() =>
  JSON.stringify(auditState.selectedListing.value?.audit || {}, null, 2),
)

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'N/A'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

function formatEventLabel(event: ScraperJobAuditEvent) {
  return event.eventType.replaceAll('_', ' ')
}

function formatListingTitle(listing: {
  listingId: string | null
  listingUrl: string | null
  source: string
}) {
  return listing.listingId || listing.listingUrl || `${listing.source} listing`
}

const hasPreviousPage = computed(() => (auditState.audit.value?.listings.page ?? 1) > 1)
const hasNextPage = computed(() => {
  const listings = auditState.audit.value?.listings
  if (!listings) {
    return false
  }

  return listings.page < listings.pageCount
})

function handleWeakFingerprintToggle(value: boolean | 'indeterminate') {
  auditState.setWeakFingerprintOnly(value === true)
}

function handleErrorsOnlyToggle(value: boolean | 'indeterminate') {
  auditState.setErrorsOnly(value === true)
}
</script>

<template>
  <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-6' }">
    <div class="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h3 class="text-lg font-semibold text-default">Run detail trail</h3>
        <p class="mt-1 text-sm text-muted">
          Each run now keeps a timeline plus one audit row per discovered listing, including skip,
          retry, and persistence outcomes.
        </p>
      </div>

      <UBadge
        v-if="props.jobId"
        :label="`Inspecting job #${props.jobId}`"
        color="neutral"
        variant="soft"
      />
    </div>

    <div
      v-if="!props.jobId"
      class="rounded-2xl border border-dashed border-default px-5 py-10 text-center text-sm text-muted"
    >
      Run a pipeline to inspect timeline and listing-level scrape history.
    </div>

    <template v-else>
      <div
        v-if="auditState.status.value === 'pending'"
        class="flex items-center justify-center rounded-2xl border border-default bg-elevated/40 px-5 py-12"
      >
        <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
      </div>

      <div
        v-else-if="auditState.status.value === 'error'"
        class="rounded-2xl border border-error/40 bg-error/10 px-5 py-4 text-sm text-default"
      >
        {{ auditState.errorMessage.value }}
      </div>

      <template v-else-if="auditState.audit.value">
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <UCard
            v-for="card in overviewCards"
            :key="card.label"
            class="border-default bg-elevated/50"
          >
            <p class="text-sm text-dimmed">{{ card.label }}</p>
            <p class="mt-2 text-3xl font-semibold text-default">{{ card.value }}</p>
          </UCard>
        </div>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <UCard class="border-default bg-elevated/30" :ui="{ body: 'p-4 space-y-4' }">
            <div>
              <h4 class="text-sm font-semibold text-default">Filters</h4>
              <p class="mt-1 text-sm text-muted">
                Narrow the listing audit rows to the failure or retry pattern you care about.
              </p>
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <UFormField label="Duplicate decision">
                <USelectMenu
                  :model-value="auditState.filters.value.duplicateDecision"
                  :items="duplicateDecisionItems"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                  @update:model-value="
                    auditState.setDuplicateDecision($event as ScraperDuplicateDecision | 'all')
                  "
                />
              </UFormField>

              <UFormField label="Detail status">
                <USelectMenu
                  :model-value="auditState.filters.value.detailStatus"
                  :items="detailStatusItems"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                  @update:model-value="
                    auditState.setDetailStatus($event as ScraperDetailStatus | 'all')
                  "
                />
              </UFormField>

              <UFormField label="Persistence status">
                <USelectMenu
                  :model-value="auditState.filters.value.persistenceStatus"
                  :items="persistenceStatusItems"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                  @update:model-value="
                    auditState.setPersistenceStatus($event as ScraperPersistenceStatus | 'all')
                  "
                />
              </UFormField>

              <div class="grid gap-3">
                <div class="flex h-10 items-center rounded-xl border border-default px-3">
                  <UCheckbox
                    :model-value="auditState.filters.value.weakFingerprintOnly"
                    label="Weak fingerprints only"
                    @update:model-value="handleWeakFingerprintToggle"
                  />
                </div>

                <div class="flex h-10 items-center rounded-xl border border-default px-3">
                  <UCheckbox
                    :model-value="auditState.filters.value.errorsOnly"
                    label="Errors only"
                    @update:model-value="handleErrorsOnlyToggle"
                  />
                </div>
              </div>
            </div>
          </UCard>

          <UCard class="border-default bg-elevated/30" :ui="{ body: 'p-4 space-y-4' }">
            <div>
              <h4 class="text-sm font-semibold text-default">Lifecycle timeline</h4>
              <p class="mt-1 text-sm text-muted">
                Progress, retry, stop, and completion markers for this run.
              </p>
            </div>

            <div v-if="auditState.audit.value.events.length" class="space-y-3">
              <div
                v-for="event in auditState.audit.value.events"
                :key="event.id"
                class="rounded-2xl border border-default px-4 py-3"
              >
                <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div class="space-y-1">
                    <p class="text-sm font-semibold text-default">{{ formatEventLabel(event) }}</p>
                    <p v-if="event.message" class="text-sm text-muted">{{ event.message }}</p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <UBadge :label="event.status" color="neutral" variant="subtle" />
                    <UBadge
                      v-if="event.pageNumber"
                      :label="`Page ${event.pageNumber}`"
                      color="neutral"
                      variant="soft"
                    />
                  </div>
                </div>
                <p class="mt-2 text-xs text-dimmed">{{ formatTimestamp(event.createdAt) }}</p>
              </div>
            </div>
            <div
              v-else
              class="rounded-2xl border border-dashed border-default px-4 py-8 text-center text-sm text-muted"
            >
              No lifecycle events were stored for this run.
            </div>
          </UCard>
        </div>

        <UCard class="border-default bg-elevated/30" :ui="{ body: 'p-4 space-y-4' }">
          <div class="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h4 class="text-sm font-semibold text-default">Listing audit rows</h4>
              <p class="mt-1 text-sm text-muted">
                {{ auditState.audit.value.listings.total }} listing rows match the current filter.
              </p>
            </div>

            <div class="flex items-center gap-2 text-sm text-muted">
              <span>
                Page {{ auditState.audit.value.listings.page }} of
                {{ auditState.audit.value.listings.pageCount }}
              </span>
              <UButton
                label="Previous"
                color="neutral"
                variant="soft"
                :disabled="!hasPreviousPage"
                @click="auditState.setPage(auditState.audit.value!.listings.page - 1)"
              />
              <UButton
                label="Next"
                color="neutral"
                variant="soft"
                :disabled="!hasNextPage"
                @click="auditState.setPage(auditState.audit.value!.listings.page + 1)"
              />
            </div>
          </div>

          <div v-if="auditState.audit.value.listings.items.length" class="space-y-4">
            <div
              v-for="listing in auditState.audit.value.listings.items"
              :key="listing.id"
              class="rounded-2xl border border-default px-4 py-4"
            >
              <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div class="space-y-1">
                  <p class="font-semibold text-default">{{ formatListingTitle(listing) }}</p>
                  <p class="text-sm text-muted break-all">
                    {{ listing.detailUrl || listing.listingUrl || 'No URL recorded' }}
                  </p>
                  <p class="text-xs text-dimmed">
                    First seen {{ formatTimestamp(listing.firstSeenAt) }}. Last updated
                    {{ formatTimestamp(listing.lastUpdatedAt) }}.
                  </p>
                </div>

                <div class="flex flex-wrap gap-2">
                  <UBadge :label="listing.duplicateDecision" color="neutral" variant="soft" />
                  <UBadge :label="listing.detailStatus" color="primary" variant="subtle" />
                  <UBadge :label="listing.persistenceStatus" color="neutral" variant="subtle" />
                  <UBadge
                    v-if="listing.weakFingerprint"
                    label="Weak fingerprint"
                    color="warning"
                    variant="soft"
                  />
                </div>
              </div>

              <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5 text-sm">
                <div class="rounded-xl bg-default px-3 py-2">
                  <p class="text-dimmed">Attempts</p>
                  <p class="mt-1 text-default">{{ listing.detailAttempts }}</p>
                </div>
                <div class="rounded-xl bg-default px-3 py-2">
                  <p class="text-dimmed">Images</p>
                  <p class="mt-1 text-default">{{ listing.finalImageCount ?? 'N/A' }}</p>
                </div>
                <div class="rounded-xl bg-default px-3 py-2">
                  <p class="text-dimmed">Structured details</p>
                  <p class="mt-1 text-default">
                    {{ listing.finalHasStructuredDetails ? 'Yes' : 'No' }}
                  </p>
                </div>
                <div class="rounded-xl bg-default px-3 py-2">
                  <p class="text-dimmed">Boat row</p>
                  <p class="mt-1 text-default">{{ listing.persistedBoatId ?? 'Not linked' }}</p>
                </div>
                <div class="rounded-xl bg-default px-3 py-2">
                  <p class="text-dimmed">Warnings</p>
                  <p class="mt-1 text-default">{{ listing.warnings.length }}</p>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <UButton
                  label="Inspect JSON"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-braces"
                  @click="auditState.openListing(listing)"
                />
                <UButton
                  v-if="listing.listingUrl"
                  :to="listing.listingUrl"
                  target="_blank"
                  label="Open listing"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-external-link"
                />
              </div>

              <p v-if="listing.errorMessage" class="mt-3 text-sm text-error">
                {{ listing.errorMessage }}
              </p>
            </div>
          </div>
          <div
            v-else
            class="rounded-2xl border border-dashed border-default px-4 py-10 text-center text-sm text-muted"
          >
            No listing audit rows match the current filter set.
          </div>
        </UCard>
      </template>
    </template>

    <UModal v-model:open="auditState.listingModalOpen.value">
      <template #header>
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Audit JSON</p>
          <h4 class="text-lg font-semibold text-default">
            {{
              auditState.selectedListing.value
                ? formatListingTitle(auditState.selectedListing.value)
                : 'Listing audit'
            }}
          </h4>
        </div>
      </template>

      <div class="space-y-4">
        <div
          v-if="auditState.selectedListing.value?.warnings.length"
          class="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-default"
        >
          {{ auditState.selectedListing.value.warnings.join(' | ') }}
        </div>

        <pre
          class="max-h-[28rem] overflow-auto rounded-2xl bg-default px-4 py-4 text-xs text-default"
        ><code>{{ selectedListingAuditText }}</code></pre>
      </div>

      <template #footer>
        <div class="flex w-full justify-end">
          <UButton color="neutral" variant="soft" label="Close" @click="auditState.closeListing" />
        </div>
      </template>
    </UModal>
  </UCard>
</template>

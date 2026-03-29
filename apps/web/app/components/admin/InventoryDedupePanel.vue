<script setup lang="ts">
import type { InventoryDedupeResponse } from '~~/app/composables/useInventoryDedupe'

const props = defineProps<{
  data: InventoryDedupeResponse
}>()

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatBoatLabel(boat: InventoryDedupeResponse['entities'][number]['boats'][number]) {
  const parts = [boat.year, boat.make, boat.model].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : `Boat #${boat.id}`
}

function formatPrice(value: string | null) {
  if (!value) return 'Price unlisted'
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return value
  return `$${parsed.toLocaleString()}`
}

function formatLocation(boat: InventoryDedupeResponse['entities'][number]['boats'][number]) {
  return [boat.city, boat.state].filter(Boolean).join(', ') || 'Location unlisted'
}

function formatRuleHit(value: string) {
  return value
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((segment) => `${segment[0]?.toUpperCase() || ''}${segment.slice(1)}`)
    .join(' ')
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <UCard
        v-for="card in [
          {
            label: 'Active listings',
            value: props.data.summary.activeListings,
            detail: 'Source listings currently visible to inventory queries.',
          },
          {
            label: 'Superseded duplicates',
            value: props.data.summary.supersededListings,
            detail: 'Historical exact duplicates retained only for ID compatibility.',
          },
          {
            label: 'Canonical entities',
            value: props.data.summary.canonicalEntities,
            detail: `${props.data.summary.multiListingEntities} entities currently span multiple sources.`,
          },
          {
            label: 'Open candidate pairs',
            value: props.data.summary.openCandidatePairs,
            detail: 'Conservative fuzzy matches stored for diagnostics only.',
          },
        ]"
        :key="card.label"
        class="card-base border-default"
      >
        <div class="space-y-2">
          <p class="text-sm text-dimmed">{{ card.label }}</p>
          <p class="text-3xl font-semibold text-default">{{ card.value }}</p>
          <p class="text-sm text-muted">{{ card.detail }}</p>
        </div>
      </UCard>
    </div>

    <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-4' }">
      <div class="space-y-1">
        <h2 class="text-lg font-semibold text-default">Canonical groups</h2>
        <p class="text-sm text-muted">
          Multi-source clusters that were auto-linked by the conservative contact-based rule.
        </p>
      </div>

      <div
        v-if="props.data.entities.length === 0"
        class="rounded-xl bg-muted px-4 py-6 text-sm text-muted"
      >
        No multi-source canonical groups yet.
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="entity in props.data.entities"
          :key="entity.entityId"
          class="rounded-2xl border border-default px-4 py-4 space-y-3"
        >
          <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="primary" variant="subtle" :label="`Entity #${entity.entityId}`" />
                <UBadge color="neutral" variant="soft" :label="`${entity.memberCount} listings`" />
                <UBadge
                  v-if="entity.representativeBoatId"
                  color="neutral"
                  variant="outline"
                  :label="`Representative boat #${entity.representativeBoatId}`"
                />
              </div>
              <p class="text-sm text-muted">
                These listings stay separate rows, but share one internal canonical entity.
              </p>
            </div>
          </div>

          <div class="grid gap-3 xl:grid-cols-2">
            <div
              v-for="boat in entity.boats"
              :key="boat.id"
              class="rounded-xl bg-muted px-4 py-3 space-y-2"
            >
              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="neutral" variant="subtle" :label="boat.source" />
                <span class="text-sm text-dimmed">Boat #{{ boat.id }}</span>
              </div>
              <p class="font-semibold text-default">{{ formatBoatLabel(boat) }}</p>
              <p class="text-sm text-muted">
                {{ formatLocation(boat) }} · {{ boat.length || 'Length unlisted' }} ·
                {{ formatPrice(boat.price) }}
              </p>
              <p class="text-xs text-dimmed">Updated {{ formatDate(boat.updatedAt) }}</p>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard class="card-base border-default" :ui="{ body: 'p-5 space-y-4' }">
      <div class="space-y-1">
        <h2 class="text-lg font-semibold text-default">Uncertain candidate pairs</h2>
        <p class="text-sm text-muted">
          High-similarity pairs that did not clear the auto-link threshold and are stored for
          diagnostics only.
        </p>
      </div>

      <div
        v-if="props.data.candidates.length === 0"
        class="rounded-xl bg-muted px-4 py-6 text-sm text-muted"
      >
        No uncertain candidate pairs are currently stored.
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="candidate in props.data.candidates"
          :key="candidate.id"
          class="rounded-2xl border border-default px-4 py-4 space-y-4"
        >
          <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                color="warning"
                variant="subtle"
                :label="`${candidate.confidenceScore}/100`"
              />
              <UBadge
                v-for="ruleHit in candidate.ruleHits"
                :key="ruleHit"
                color="neutral"
                variant="outline"
                :label="formatRuleHit(ruleHit)"
              />
            </div>
            <p class="text-xs text-dimmed">Updated {{ formatDate(candidate.updatedAt) }}</p>
          </div>

          <div class="grid gap-3 xl:grid-cols-2">
            <div
              v-for="boat in [candidate.leftBoat, candidate.rightBoat]"
              :key="boat.id"
              class="rounded-xl bg-muted px-4 py-3 space-y-2"
            >
              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="neutral" variant="subtle" :label="boat.source" />
                <span class="text-sm text-dimmed">Boat #{{ boat.id }}</span>
              </div>
              <p class="font-semibold text-default">{{ formatBoatLabel(boat) }}</p>
              <p class="text-sm text-muted">
                {{ formatLocation(boat) }} · {{ boat.length || 'Length unlisted' }} ·
                {{ formatPrice(boat.price) }}
              </p>
              <p class="text-xs text-dimmed">Updated {{ formatDate(boat.updatedAt) }}</p>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { BoatInventoryBoat } from '~~/app/types/boat-inventory'

type MapBoat = {
  id: string
  boatId: number
  boat: BoatInventoryBoat
  lat: number
  lng: number
}

const props = withDefaults(
  defineProps<{
    boats: BoatInventoryBoat[]
    status: 'idle' | 'pending' | 'success' | 'error'
    errorMessage?: string | null
    total: number
    currentPage: number
    pageCount: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }>(),
  {
    errorMessage: null,
  },
)

const emit = defineEmits<{
  clearFilters: []
  changePage: [page: number]
}>()

const {
  formatPrice,
  formatListingTitle,
  formatLocation,
  getSourceLabel,
  getSourceCta,
  getSourceColor,
} = useBoatListingDisplay()

const selectedMapBoatId = ref<string | null>(null)

const mappableBoats = computed<MapBoat[]>(() =>
  props.boats
    .filter(
      (boat): boat is BoatInventoryBoat & { geoLat: number; geoLng: number } =>
        typeof boat.geoLat === 'number' && typeof boat.geoLng === 'number',
    )
    .map((boat) => ({
      id: String(boat.id),
      boatId: boat.id,
      boat,
      lat: boat.geoLat,
      lng: boat.geoLng,
    })),
)

const visiblePages = computed(() => {
  const start = Math.max(1, props.currentPage - 2)
  const end = Math.min(props.pageCount, props.currentPage + 2)

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

watch(
  mappableBoats,
  (boats) => {
    if (!boats.length) {
      selectedMapBoatId.value = null
      return
    }

    if (selectedMapBoatId.value && boats.some((boat) => boat.id === selectedMapBoatId.value)) {
      return
    }

    selectedMapBoatId.value = boats[0]?.id ?? null
  },
  { immediate: true },
)

function getVesselIcon(boat: BoatInventoryBoat): string {
  const make = (boat.make || '').toLowerCase()
  const model = (boat.model || '').toLowerCase()
  const combined = `${make} ${model}`

  if (
    combined.includes('sail') ||
    combined.includes('sloop') ||
    combined.includes('ketch') ||
    combined.includes('cutter') ||
    combined.includes('yawl') ||
    combined.includes('schooner')
  ) {
    return '⛵'
  }

  return '🚤'
}

function createPinElement(boat: MapBoat, isSelected: boolean) {
  const element = document.createElement('div')
  element.className = `boat-map-pin ${isSelected ? 'boat-map-pin-selected' : ''}`

  const price = formatPrice(boat.boat.price)
  const icon = getVesselIcon(boat.boat)
  const priceLabel = price === 'Price on request' ? 'POR' : price

  element.innerHTML = `
    <span class="boat-map-pin-icon">${icon}</span>
    <span class="boat-map-pin-label">${priceLabel}</span>
  `

  return { element }
}

function createClusterElement(
  _cluster: { memberAnnotations: unknown[]; coordinate: unknown },
  count: number,
) {
  const el = document.createElement('div')
  el.className = 'boat-map-cluster'
  el.innerHTML = `
    <div class="boat-map-cluster-ring"></div>
    <div class="boat-map-cluster-bubble">
      <span class="boat-map-cluster-count">${count}</span>
      <span class="boat-map-cluster-label">boats</span>
    </div>
  `
  return el
}

function selectBoat(boat: MapBoat) {
  selectedMapBoatId.value = boat.id
}

function detailTo(boatId: number) {
  return { path: `/boats/${boatId}` }
}
</script>

<template>
  <div class="flex min-w-0 w-full flex-col gap-3 sm:gap-4">
    <!-- ═══ Error state ═══ -->
    <UCard
      v-if="props.errorMessage"
      class="brand-surface"
      :ui="{ body: 'p-8 space-y-4 text-center' }"
    >
      <UIcon name="i-lucide-alert-circle" class="mx-auto text-4xl text-warning" />
      <div class="space-y-2">
        <h3 class="text-lg font-semibold text-default">Could not load map inventory</h3>
        <p class="mx-auto max-w-2xl text-sm text-muted">{{ props.errorMessage }}</p>
      </div>
    </UCard>

    <!-- ═══ Main map layout ═══ -->
    <div v-else class="boat-map-layout">
      <!-- ── Map surface (top on mobile, right on desktop) ── -->
      <div class="boat-map-surface brand-surface overflow-hidden">
        <div class="relative h-full w-full">
          <div
            v-if="props.status === 'pending' && !mappableBoats.length"
            class="absolute inset-0 z-10 flex items-center justify-center bg-default/75 backdrop-blur-sm"
          >
            <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
          </div>

          <AppMapKit
            v-if="mappableBoats.length"
            v-model:selected-id="selectedMapBoatId"
            :items="mappableBoats"
            :create-pin-element="createPinElement"
            :create-cluster-element="createClusterElement"
            clustering-identifier="boats"
            :annotation-size="{ width: 128, height: 52 }"
            :zoom-span="{ lat: 0.18, lng: 0.2 }"
            :bounding-padding="0.18"
            :min-span-delta="0.12"
            class="h-full w-full"
          />

          <div
            v-else
            class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-elevated/60 px-6 text-center"
          >
            <UIcon name="i-lucide-map-off" class="size-10 text-warning" />
            <div class="space-y-2">
              <h3 class="text-lg font-semibold text-default">Map pins unavailable</h3>
              <p class="max-w-xl text-sm text-muted">
                This page of results does not have enough verified coordinates yet. Try a broader
                location filter or return after the next geo refresh.
              </p>
            </div>
          </div>

          <!-- ─── Floating legend ─── -->
          <div v-if="mappableBoats.length" class="boat-map-legend">
            <div class="flex items-center gap-3">
              <span class="flex items-center gap-1 text-xs">
                <span class="text-sm">🚤</span>
                <span class="text-muted">Power</span>
              </span>
              <span class="flex items-center gap-1 text-xs">
                <span class="text-sm">⛵</span>
                <span class="text-muted">Sail</span>
              </span>
              <span class="flex items-center gap-1 text-xs">
                <span class="boat-map-legend-cluster-dot" />
                <span class="text-muted">Cluster</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Sidebar list (below map on mobile, left on desktop) ── -->
      <div class="boat-map-sidebar">
        <!-- Header strip -->
        <div class="boat-map-sidebar-header">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div
                class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10"
              >
                <UIcon name="i-lucide-map-pin" class="text-xs text-primary" />
              </div>
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-dimmed">
                {{ mappableBoats.length }} of {{ props.total }} mapped
              </p>
            </div>
          </div>
        </div>

        <!-- Scrollable boat list -->
        <div class="boat-map-sidebar-body">
          <div v-if="mappableBoats.length" class="space-y-1">
            <div
              v-for="boat in mappableBoats"
              :key="boat.id"
              class="boat-map-sidebar-item"
              :class="{ 'boat-map-sidebar-item-active': selectedMapBoatId === boat.id }"
              role="button"
              tabindex="0"
              @click="selectBoat(boat)"
              @keydown.enter="selectBoat(boat)"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <p class="min-w-0 truncate text-sm font-semibold text-default">
                    {{ formatListingTitle(boat.boat) }}
                  </p>
                  <span class="shrink-0 text-sm font-bold text-primary">
                    {{ formatPrice(boat.boat.price) }}
                  </span>
                </div>
                <div class="mt-0.5 flex items-center gap-2">
                  <p class="min-w-0 truncate text-xs text-muted">
                    {{ formatLocation(boat.boat) }}
                  </p>
                  <UBadge
                    :label="getSourceLabel(boat.boat.source)"
                    :color="getSourceColor(boat.boat.source)"
                    variant="subtle"
                    size="xs"
                    class="shrink-0"
                  />
                </div>
                <!-- Action row for selected boat -->
                <div v-if="selectedMapBoatId === boat.id" class="mt-2 flex items-center gap-2">
                  <UButton
                    :to="detailTo(boat.boatId)"
                    label="View details"
                    icon="i-lucide-ship-wheel"
                    size="xs"
                  />
                  <UButton
                    v-if="boat.boat.url"
                    :to="boat.boat.url"
                    :label="getSourceCta(boat.boat.source)"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-arrow-up-right"
                    target="_blank"
                    size="xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            v-else
            class="rounded-2xl border border-default bg-elevated/70 px-4 py-5 text-sm text-muted"
          >
            None of the current results have verified coordinates yet. Adjust filters or return
            after the next geo backfill.
          </div>
        </div>

        <!-- Pagination footer -->
        <div v-if="props.pageCount > 1" class="boat-map-sidebar-footer">
          <div class="flex items-center justify-between gap-2">
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!props.hasPreviousPage"
              @click="emit('changePage', props.currentPage - 1)"
            />
            <div class="flex items-center gap-1">
              <UButton
                v-for="page in visiblePages"
                :key="page"
                :label="String(page)"
                :color="page === props.currentPage ? 'primary' : 'neutral'"
                :variant="page === props.currentPage ? 'solid' : 'ghost'"
                size="xs"
                class="min-w-7 justify-center rounded-full"
                @click="emit('changePage', page)"
              />
            </div>
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!props.hasNextPage"
              @click="emit('changePage', props.currentPage + 1)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* ═══════════════════════════════════════════════════
   Map Layout — mobile-first
   ═══════════════════════════════════════════════════

   Mobile: map on top (16:10 aspect), list below
   Desktop (xl): side-by-side, map is square, fits in viewport
*/

.boat-map-layout {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
  width: 100%;
}

@media (min-width: 1280px) {
  .boat-map-layout {
    flex-direction: row;
    /* Keep the full map visible without depending on parent flex heights. */
    height: calc(100dvh - var(--brand-header-total-height, 5.5rem) - 12.5rem);
    min-height: 28rem;
    gap: 1rem;
  }
}

/* ── Map surface ── */

.boat-map-surface {
  position: relative;
  aspect-ratio: 16 / 10;
  min-height: 14rem;
  border-radius: var(--radius-card);
}

@media (min-width: 640px) {
  .boat-map-surface {
    aspect-ratio: 16 / 9;
    min-height: 18rem;
  }
}

@media (min-width: 1280px) {
  .boat-map-surface {
    aspect-ratio: 1;
    flex: 1 1 0;
    min-height: 0;
    height: 100%;
  }
}

/* ── Sidebar ── */

.boat-map-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: var(--radius-card);
  border: 1px solid color-mix(in srgb, var(--ui-border) 50%, transparent);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 0.92), rgb(255 255 255 / 0.82)),
    rgb(255 255 255 / 0.88);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.dark .boat-map-sidebar {
  background:
    linear-gradient(180deg, rgb(15 23 42 / 0.92), rgb(15 23 42 / 0.84)), rgb(15 23 42 / 0.88);
}

@media (min-width: 1280px) {
  .boat-map-sidebar {
    width: 22rem;
    flex-shrink: 0;
    height: 100%;
    order: -1; /* sidebar on left */
  }
}

.boat-map-sidebar-header {
  flex-shrink: 0;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-border) 40%, transparent);
}

.boat-map-sidebar-body {
  flex: 1 1 0;
  padding: 0.5rem;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.boat-map-sidebar-body::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

/* On mobile, cap the list height so the page doesn't get excessively long */
@media (max-width: 1279px) {
  .boat-map-sidebar-body {
    max-height: 24rem;
  }
}

.boat-map-sidebar-footer {
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid color-mix(in srgb, var(--ui-border) 40%, transparent);
}

/* ═══════════════════════════════════════════════════
   Sidebar Items
   ═══════════════════════════════════════════════════ */

.boat-map-sidebar-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.55rem 0.65rem;
  border-radius: 0.75rem;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background-color 160ms cubic-bezier(0.33, 1, 0.68, 1),
    border-color 160ms cubic-bezier(0.33, 1, 0.68, 1),
    box-shadow 160ms cubic-bezier(0.33, 1, 0.68, 1);
}

.boat-map-sidebar-item:hover {
  background: color-mix(in srgb, var(--ui-bg-elevated) 60%, transparent);
}

.boat-map-sidebar-item-active {
  background: color-mix(in srgb, var(--ui-primary) 6%, var(--ui-bg-elevated) 94%);
  border-color: color-mix(in srgb, var(--ui-primary) 25%, var(--ui-border) 75%);
  box-shadow: inset 3px 0 0 0 var(--ui-primary);
}

/* ═══════════════════════════════════════════════════
   Map Pins
   ═══════════════════════════════════════════════════ */

.boat-map-pin {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 2.75rem;
  max-width: 8rem;
  padding: 0.35rem 0.6rem 0.35rem 0.45rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ui-border) 70%, transparent);
  background: color-mix(in srgb, var(--ui-bg) 88%, white 12%);
  box-shadow:
    0 4px 14px -4px rgb(0 0 0 / 0.18),
    0 1px 3px rgb(0 0 0 / 0.08);
  backdrop-filter: blur(12px);
  cursor: pointer;
  transition:
    transform 180ms cubic-bezier(0.33, 1, 0.68, 1),
    box-shadow 180ms cubic-bezier(0.33, 1, 0.68, 1),
    border-color 180ms cubic-bezier(0.33, 1, 0.68, 1);
}

.boat-map-pin::after {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid color-mix(in srgb, var(--ui-bg) 88%, white 12%);
  filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.08));
}

.boat-map-pin:hover {
  transform: translateY(-2px);
  box-shadow:
    0 8px 22px -6px rgb(0 0 0 / 0.22),
    0 2px 6px rgb(0 0 0 / 0.1);
}

.boat-map-pin-selected {
  background: color-mix(in srgb, var(--ui-primary) 14%, var(--ui-bg) 86%);
  border-color: color-mix(in srgb, var(--ui-primary) 55%, var(--ui-border) 45%);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--ui-primary) 18%, transparent),
    0 6px 18px -4px rgb(0 0 0 / 0.22),
    0 2px 4px rgb(0 0 0 / 0.08);
  transform: translateY(-3px) scale(1.06);
}

.boat-map-pin-selected::after {
  border-top-color: color-mix(in srgb, var(--ui-primary) 14%, var(--ui-bg) 86%);
}

.boat-map-pin-icon {
  font-size: 0.8rem;
  line-height: 1;
  flex-shrink: 0;
}

.boat-map-pin-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: var(--ui-text-highlighted);
}

/* ═══════════════════════════════════════════════════
   Cluster Bubbles
   ═══════════════════════════════════════════════════ */

.boat-map-cluster {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  cursor: pointer;
}

.boat-map-cluster-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--ui-primary) 30%, transparent);
  animation: cluster-pulse 2.4s ease-out infinite;
}

@keyframes cluster-pulse {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  70% {
    transform: scale(1.5);
    opacity: 0;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.boat-map-cluster-bubble {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--ui-primary) 40%, var(--ui-border) 60%);
  background: color-mix(in srgb, var(--ui-primary) 12%, var(--ui-bg) 88%);
  box-shadow:
    0 4px 16px -4px rgb(0 0 0 / 0.2),
    0 1px 3px rgb(0 0 0 / 0.1);
  backdrop-filter: blur(14px);
  transition:
    transform 180ms cubic-bezier(0.33, 1, 0.68, 1),
    box-shadow 180ms cubic-bezier(0.33, 1, 0.68, 1);
}

.boat-map-cluster:hover .boat-map-cluster-bubble {
  transform: scale(1.1);
  box-shadow:
    0 8px 24px -6px rgb(0 0 0 / 0.28),
    0 2px 6px rgb(0 0 0 / 0.12);
}

.boat-map-cluster-count {
  font-size: 0.82rem;
  font-weight: 800;
  line-height: 1;
  color: var(--ui-primary);
}

.boat-map-cluster-label {
  font-size: 0.48rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-text-muted);
  line-height: 1;
  margin-top: 1px;
}

/* ═══════════════════════════════════════════════════
   Floating Legend
   ═══════════════════════════════════════════════════ */

.boat-map-legend {
  position: absolute;
  bottom: 0.75rem;
  right: 0.75rem;
  z-index: 10;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ui-border) 50%, transparent);
  background: color-mix(in srgb, var(--ui-bg) 82%, transparent);
  backdrop-filter: blur(14px);
  box-shadow: 0 4px 12px -4px rgb(0 0 0 / 0.12);
}

.boat-map-legend-cluster-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ui-primary) 35%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--ui-primary) 50%, transparent);
}
</style>

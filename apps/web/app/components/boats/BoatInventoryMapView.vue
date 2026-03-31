<script setup lang="ts">
import type { BoatInventoryActiveFilterChip, BoatInventoryBoat } from '~~/app/types/boat-inventory'

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
    hasActiveFilters: boolean
    activeFilterChips: BoatInventoryActiveFilterChip[]
    resultsLabel: string
    resultsContext: string
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
  removeFilter: [key: BoatInventoryActiveFilterChip['key']]
  changePage: [page: number]
}>()

const {
  formatPrice,
  formatLength,
  formatListingTitle,
  formatLocation,
  getSourceLabel,
  getSourceCta,
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

const selectedBoat = computed(
  () => mappableBoats.value.find((boat) => boat.id === selectedMapBoatId.value) ?? null,
)

const unmappableCount = computed(() => Math.max(0, props.boats.length - mappableBoats.value.length))

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

function createPinElement(boat: MapBoat, isSelected: boolean) {
  const element = document.createElement('div')
  element.className = `boat-map-pin ${isSelected ? 'boat-map-pin-selected' : ''}`

  const price = formatPrice(boat.boat.price)
  element.innerHTML = `
    <span class="boat-map-pin-label">${price === 'Price on request' ? 'Boat' : price}</span>
  `

  return { element }
}

function selectBoat(boat: MapBoat) {
  selectedMapBoatId.value = boat.id
}

function detailTo(boatId: number) {
  return { path: `/boats/${boatId}` }
}
</script>

<template>
  <div class="space-y-5">
    <div class="space-y-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge label="Map view" color="primary" variant="subtle" icon="i-lucide-map" />
            <UBadge
              :label="`${mappableBoats.length} pinned on this page`"
              :color="mappableBoats.length ? 'primary' : 'neutral'"
              variant="soft"
            />
            <UBadge
              v-if="unmappableCount"
              :label="`${unmappableCount} without verified coordinates`"
              color="warning"
              variant="soft"
            />
          </div>
          <div class="space-y-2">
            <h1 class="text-3xl font-bold text-default sm:text-4xl">Boats for sale map</h1>
            <p class="max-w-3xl text-sm text-muted sm:text-base">
              {{ resultsContext }}
            </p>
          </div>
        </div>

        <UBadge
          :label="resultsLabel"
          :color="mappableBoats.length ? 'primary' : 'neutral'"
          variant="soft"
        />
      </div>

      <div
        v-if="props.activeFilterChips.length || props.hasActiveFilters"
        class="brand-surface-soft rounded-[1.4rem] p-4"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :label="`${props.total.toLocaleString()} total match${props.total === 1 ? '' : 'es'}`"
                color="neutral"
                variant="soft"
              />
            </div>

            <div
              v-if="props.activeFilterChips.length"
              class="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible"
            >
              <UButton
                v-for="chip in props.activeFilterChips"
                :key="chip.key"
                :label="`${chip.label}: ${chip.value}`"
                color="neutral"
                variant="soft"
                size="sm"
                class="shrink-0"
                trailing-icon="i-lucide-x"
                @click="emit('removeFilter', chip.key)"
              />
            </div>
          </div>

          <UButton
            v-if="props.hasActiveFilters"
            color="neutral"
            variant="ghost"
            icon="i-lucide-rotate-ccw"
            label="Clear all"
            @click="emit('clearFilters')"
          />
        </div>
      </div>
    </div>

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

    <div
      v-else
      class="grid h-[calc(100vh-14rem)] min-h-[40rem] gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]"
    >
      <UCard
        class="brand-surface flex flex-col overflow-hidden"
        :ui="{ body: 'p-0 h-full flex flex-col overflow-hidden' }"
      >
        <div class="flex min-h-0 flex-1 flex-col">
          <div class="border-b border-default px-5 py-4 shrink-0">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">Sidebar</p>
            <h2 class="mt-2 text-lg font-semibold text-default">
              {{ selectedBoat ? 'Selected boat' : 'Map-ready results' }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              Choose a pin or a row to center the map and open the detail page.
            </p>
          </div>

          <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <UCard
              v-if="selectedBoat"
              class="brand-surface-soft shrink-0 rounded-[1.25rem]"
              :ui="{ body: 'p-4 space-y-4' }"
            >
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge
                    :label="getSourceLabel(selectedBoat.boat.source)"
                    color="primary"
                    variant="soft"
                    size="sm"
                  />
                  <UBadge
                    :label="formatLength(selectedBoat.boat.length)"
                    color="neutral"
                    variant="soft"
                    size="sm"
                  />
                </div>
                <h3 class="text-lg font-semibold text-default">
                  {{ formatListingTitle(selectedBoat.boat) }}
                </h3>
                <p class="text-sm text-muted">{{ formatLocation(selectedBoat.boat) }}</p>
                <p class="text-xl font-semibold text-primary">
                  {{ formatPrice(selectedBoat.boat.price) }}
                </p>
              </div>

              <div class="flex flex-wrap gap-2">
                <UButton
                  :to="detailTo(selectedBoat.boatId)"
                  label="Open boat"
                  icon="i-lucide-ship-wheel"
                />
                <UButton
                  v-if="selectedBoat.boat.url"
                  :to="selectedBoat.boat.url"
                  :label="getSourceCta(selectedBoat.boat.source)"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-up-right"
                  target="_blank"
                />
              </div>
            </UCard>

            <div v-if="mappableBoats.length" class="space-y-2">
              <p class="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                Map-ready on this page
              </p>
              <UButton
                v-for="boat in mappableBoats"
                :key="boat.id"
                color="neutral"
                :variant="selectedMapBoatId === boat.id ? 'soft' : 'ghost'"
                class="h-auto w-full justify-start rounded-[1.25rem] px-4 py-4 text-left"
                @click="selectBoat(boat)"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-default">
                    {{ formatListingTitle(boat.boat) }}
                  </p>
                  <p class="truncate text-xs text-muted">{{ formatLocation(boat.boat) }}</p>
                  <p class="mt-1 text-sm font-medium text-primary">
                    {{ formatPrice(boat.boat.price) }}
                  </p>
                </div>
              </UButton>
            </div>

            <div
              v-else
              class="rounded-[1.25rem] border border-default bg-elevated/70 px-4 py-5 text-sm text-muted"
            >
              None of the current results have verified coordinates yet. Adjust filters or return
              after the next geo backfill.
            </div>
          </div>

          <div v-if="props.pageCount > 1" class="border-t border-default shrink-0 px-4 py-4">
            <div class="space-y-3">
              <p class="text-sm text-muted">
                Page {{ props.currentPage }} of {{ props.pageCount }}
              </p>
              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  label="Previous"
                  icon="i-lucide-arrow-left"
                  color="neutral"
                  variant="soft"
                  :disabled="!props.hasPreviousPage"
                  @click="emit('changePage', props.currentPage - 1)"
                />
                <UButton
                  v-for="page in visiblePages"
                  :key="page"
                  :label="String(page)"
                  :color="page === props.currentPage ? 'primary' : 'neutral'"
                  :variant="page === props.currentPage ? 'soft' : 'ghost'"
                  @click="emit('changePage', page)"
                />
                <UButton
                  label="Next"
                  trailing-icon="i-lucide-arrow-right"
                  color="neutral"
                  variant="soft"
                  :disabled="!props.hasNextPage"
                  @click="emit('changePage', props.currentPage + 1)"
                />
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <UCard class="brand-surface h-full overflow-hidden" :ui="{ body: 'p-0 h-full' }">
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
            clustering-identifier="boats"
            :annotation-size="{ width: 112, height: 52 }"
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
        </div>
      </UCard>
    </div>
  </div>
</template>

<style>
.boat-map-pin {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 3rem;
  max-width: 7rem;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ui-border) 80%, transparent);
  background: color-mix(in srgb, var(--ui-bg) 86%, white 14%);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(12px);
}

.boat-map-pin-selected {
  background: color-mix(in srgb, var(--ui-primary) 18%, var(--ui-bg) 82%);
  border-color: color-mix(in srgb, var(--ui-primary) 60%, var(--ui-border) 40%);
  transform: translateY(-1px);
}

.boat-map-pin-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ui-text-highlighted);
}
</style>

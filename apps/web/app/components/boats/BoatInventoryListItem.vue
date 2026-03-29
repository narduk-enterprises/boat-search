<script setup lang="ts">
import type { BoatInventoryBoat } from '~~/app/types/boat-inventory'
import BoatMediaImage from '~~/app/components/boats/BoatMediaImage.vue'

const props = defineProps<{
  boat: BoatInventoryBoat
}>()

const {
  formatPrice,
  formatLength,
  formatLocation,
  formatListingTitle,
  getSourceColor,
  getSourceCta,
  getSourceLabel,
} = useBoatListingDisplay()

const detailTo = computed(() => ({
  path: `/boats/${props.boat.id}`,
}))
const externalListingUrl = computed(() => props.boat.url?.trim() || null)
const titleText = computed(() => formatListingTitle(props.boat))
const locationText = computed(() => formatLocation(props.boat))
const lengthText = computed(() => formatLength(props.boat.length))
const yearText = computed(() => (props.boat.year ? String(props.boat.year) : 'Year unlisted'))
const priceText = computed(() => formatPrice(props.boat.price))
const boatDescription = computed(
  () =>
    props.boat.description?.trim() ||
    'Open the detail view or source listing to inspect the listing, media, and seller context.',
)
</script>

<template>
  <UCard class="brand-surface overflow-hidden border-default" :ui="{ body: 'p-0' }">
    <div class="grid gap-0 md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)]">
      <BoatMediaImage
        :src="props.boat.images?.[0]"
        :alt="titleText"
        :width="800"
        :height="600"
        sizes="100vw md:15rem xl:16rem"
        :quality="68"
        class="aspect-[4/3] w-full border-b border-default bg-muted md:h-full md:border-b-0 md:border-r"
        img-class="h-full w-full object-cover"
      >
        <div class="absolute left-3 top-3">
          <UBadge
            :label="getSourceLabel(props.boat.source)"
            :color="getSourceColor(props.boat.source)"
            variant="solid"
            size="xs"
          />
        </div>
      </BoatMediaImage>

      <div class="min-w-0 space-y-4 p-4 sm:p-5 lg:p-6">
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div class="min-w-0 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :label="yearText" color="neutral" variant="soft" size="sm" />
              <UBadge :label="lengthText" color="neutral" variant="soft" size="sm" />
              <UBadge
                v-if="props.boat.sellerType"
                :label="props.boat.sellerType"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>

            <div class="min-w-0 space-y-1.5">
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
                {{ locationText }}
              </p>
              <h2 class="text-balance text-xl font-semibold leading-tight text-default sm:text-2xl">
                {{ titleText }}
              </h2>
            </div>
          </div>

          <div class="space-y-1 lg:min-w-fit lg:text-right">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-dimmed">
              Asking price
            </p>
            <p class="text-xl font-semibold text-primary sm:text-2xl">
              {{ priceText }}
            </p>
          </div>
        </div>

        <p class="line-clamp-3 max-w-4xl text-sm leading-6 text-muted">
          {{ boatDescription }}
        </p>

        <div class="flex flex-wrap gap-3">
          <UButton :to="detailTo" label="Open boat" icon="i-lucide-ship-wheel" />
          <UButton
            v-if="externalListingUrl"
            :to="externalListingUrl"
            :label="getSourceCta(props.boat.source)"
            color="neutral"
            variant="soft"
            icon="i-lucide-arrow-up-right"
            target="_blank"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>

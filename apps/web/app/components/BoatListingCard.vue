<script setup lang="ts">
interface Boat {
  id: number
  year: number | null
  make: string | null
  model: string | null
  length: string | null
  city: string | null
  state: string | null
  location: string | null
  price: number | null
  description: string | null
  sellerType: string | null
  source: string
  images: string[]
}

defineProps<{
  boat: Boat
}>()

const { formatPrice, getSourceColor, getSourceLabel } = useBoatListingDisplay()
</script>

<template>
  <NuxtLink
    :to="`/boats/${boat.id}`"
    class="card-base rounded-xl overflow-hidden transition-base hover:shadow-elevated group"
  >
    <div class="aspect-video bg-muted overflow-hidden relative">
      <img
        v-if="boat.images && boat.images.length > 0"
        :src="boat.images[0]"
        :alt="`${boat.year || ''} ${boat.make || ''} ${boat.model || ''}`"
        class="w-full h-full object-cover group-hover:scale-105 transition-slow"
        loading="lazy"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-dimmed">
        <UIcon name="i-lucide-ship" class="text-4xl" />
      </div>
      <div class="absolute top-2 left-2">
        <UBadge
          :label="getSourceLabel(boat.source)"
          :color="getSourceColor(boat.source)"
          variant="solid"
          size="xs"
        />
      </div>
    </div>

    <div class="p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="font-semibold text-default truncate">
            {{ boat.year }} {{ boat.make }} {{ boat.model }}
          </h3>
          <p class="text-sm text-muted truncate">
            {{ boat.length }}ft · {{ boat.city || boat.state || boat.location || 'US' }}
          </p>
        </div>
        <span class="text-lg font-bold text-primary whitespace-nowrap">
          {{ formatPrice(boat.price) }}
        </span>
      </div>
      <p v-if="boat.description" class="mt-2 text-xs text-dimmed line-clamp-2">
        {{ boat.description }}
      </p>
      <div v-if="boat.sellerType" class="mt-2 flex items-center gap-2">
        <UBadge :label="boat.sellerType" variant="subtle" size="sm" />
      </div>
    </div>
  </NuxtLink>
</template>

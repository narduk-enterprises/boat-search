<script setup lang="ts">
import type {
  BoatInventoryVesselMode,
  BoatInventoryVesselSubtype,
} from '~~/app/types/boat-inventory'
import {
  BOAT_INVENTORY_VESSEL_MODE_OPTIONS,
  BOAT_INVENTORY_VESSEL_SUBTYPE_OPTIONS,
  BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE,
} from '~~/app/types/boat-inventory'

const props = withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

const vesselMode = defineModel<'' | BoatInventoryVesselMode>('vesselMode', { default: '' })
const vesselSubtype = defineModel<'' | BoatInventoryVesselSubtype>('vesselSubtype', { default: '' })

const activeSubtypeOptions = computed(() =>
  vesselMode.value ? BOAT_INVENTORY_VESSEL_SUBTYPE_OPTIONS[vesselMode.value] : [],
)

function toggleVesselMode(nextMode: BoatInventoryVesselMode) {
  if (vesselMode.value === nextMode) {
    vesselMode.value = ''
    vesselSubtype.value = ''
    return
  }

  vesselMode.value = nextMode

  if (
    vesselSubtype.value &&
    BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE[vesselSubtype.value] !== nextMode
  ) {
    vesselSubtype.value = ''
  }
}

function toggleSubtype(nextSubtype: BoatInventoryVesselSubtype) {
  const subtypeMode = BOAT_INVENTORY_VESSEL_SUBTYPE_TO_MODE[nextSubtype]

  if (vesselMode.value !== subtypeMode) {
    vesselMode.value = subtypeMode
  }

  vesselSubtype.value = vesselSubtype.value === nextSubtype ? '' : nextSubtype
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap gap-2">
      <UButton
        v-for="option in BOAT_INVENTORY_VESSEL_MODE_OPTIONS"
        :key="option.value"
        :label="option.label"
        :icon="option.icon"
        :size="props.compact ? 'sm' : 'md'"
        :color="vesselMode === option.value ? 'primary' : 'neutral'"
        :variant="vesselMode === option.value ? 'solid' : 'soft'"
        type="button"
        class="rounded-full"
        @click="toggleVesselMode(option.value)"
      />
    </div>

    <div
      v-if="activeSubtypeOptions.length"
      class="flex flex-wrap gap-2 rounded-[1.2rem] border border-default/70 bg-default/60 p-2.5"
    >
      <UButton
        v-for="option in activeSubtypeOptions"
        :key="option.value"
        :label="option.label"
        :size="props.compact ? 'xs' : 'sm'"
        :color="vesselSubtype === option.value ? 'primary' : 'neutral'"
        :variant="vesselSubtype === option.value ? 'soft' : 'ghost'"
        type="button"
        class="rounded-full"
        @click="toggleSubtype(option.value)"
      />
    </div>
  </div>
</template>

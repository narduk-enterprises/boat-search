<script setup lang="ts">
import {
  CREW_SIZE_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  MAINTENANCE_APPETITE_OPTIONS,
  PRIMARY_USE_OPTIONS,
  listToTextarea,
  textareaToList,
  type BuyerProfileDraft,
} from '~~/lib/boatFinder'

type SectionKey = 'brief' | 'budget' | 'preferences'

const props = withDefaults(
  defineProps<{
    sections?: SectionKey[]
  }>(),
  {
    sections: () => ['brief', 'budget', 'preferences'],
  },
)

const profile = defineModel<BuyerProfileDraft>({ required: true })
const primaryUseItems = [...PRIMARY_USE_OPTIONS]
const crewSizeItems = [...CREW_SIZE_OPTIONS]
const experienceLevelItems = [...EXPERIENCE_LEVEL_OPTIONS]
const maintenanceAppetiteItems = [...MAINTENANCE_APPETITE_OPTIONS]
const primaryUse = computed({
  get: () => profile.value.primaryUse || undefined,
  set: (value: (typeof PRIMARY_USE_OPTIONS)[number] | undefined) => {
    profile.value.primaryUse = value ?? ''
  },
})
const crewSize = computed({
  get: () => profile.value.crewSize || undefined,
  set: (value: (typeof CREW_SIZE_OPTIONS)[number] | undefined) => {
    profile.value.crewSize = value ?? ''
  },
})
const experienceLevel = computed({
  get: () => profile.value.experienceLevel || undefined,
  set: (value: (typeof EXPERIENCE_LEVEL_OPTIONS)[number] | undefined) => {
    profile.value.experienceLevel = value ?? ''
  },
})
const maintenanceAppetite = computed({
  get: () => profile.value.maintenanceAppetite || undefined,
  set: (value: (typeof MAINTENANCE_APPETITE_OPTIONS)[number] | undefined) => {
    profile.value.maintenanceAppetite = value ?? ''
  },
})

const mustHavesText = computed({
  get: () => listToTextarea(profile.value.mustHaves),
  set: (value: string) => {
    profile.value.mustHaves = textareaToList(value)
  },
})

const dealBreakersText = computed({
  get: () => listToTextarea(profile.value.dealBreakers),
  set: (value: string) => {
    profile.value.dealBreakers = textareaToList(value)
  },
})

function includesSection(section: SectionKey) {
  return props.sections.includes(section)
}
</script>

<template>
  <div class="space-y-8">
    <section v-if="includesSection('brief')" class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-default">Fishing brief</h2>
        <p class="mt-1 text-sm text-muted">
          Tell us how you fish so the shortlist reflects your actual use, not just raw filters.
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Primary use" required>
          <USelectMenu v-model="primaryUse" :items="primaryUseItems" class="w-full" />
        </UFormField>
        <UFormField label="Target waters or region" required>
          <UInput
            v-model="profile.targetWatersOrRegion"
            class="w-full"
            placeholder="e.g. Gulf Coast / Galveston"
          />
        </UFormField>
        <UFormField label="Crew size" required>
          <USelectMenu v-model="crewSize" :items="crewSizeItems" class="w-full" />
        </UFormField>
        <UFormField label="Experience level" required>
          <USelectMenu v-model="experienceLevel" :items="experienceLevelItems" class="w-full" />
        </UFormField>
      </div>
    </section>

    <section v-if="includesSection('budget')" class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-default">Budget and ownership limits</h2>
        <p class="mt-1 text-sm text-muted">
          These fields drive the structured inventory pass before AI reranks the shortlist.
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Budget floor (optional)">
          <UInput
            v-model.number="profile.budgetMin"
            class="w-full"
            type="number"
            placeholder="100000"
          />
        </UFormField>
        <UFormField label="Budget ceiling" required>
          <UInput
            v-model.number="profile.budgetMax"
            class="w-full"
            type="number"
            placeholder="400000"
          />
        </UFormField>
        <UFormField label="Minimum length (optional)">
          <UInput
            v-model.number="profile.lengthMin"
            class="w-full"
            type="number"
            placeholder="30"
          />
        </UFormField>
        <UFormField label="Maximum length (optional)">
          <UInput
            v-model.number="profile.lengthMax"
            class="w-full"
            type="number"
            placeholder="50"
          />
        </UFormField>
        <UFormField label="Maintenance appetite" required>
          <USelectMenu
            v-model="maintenanceAppetite"
            :items="maintenanceAppetiteItems"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Storage or towing constraints" required>
          <UInput
            v-model="profile.storageOrTowingConstraints"
            class="w-full"
            placeholder="e.g. slip-ready, no trailer requirement"
          />
        </UFormField>
      </div>
    </section>

    <section v-if="includesSection('preferences')" class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-default">Must-haves and deal-breakers</h2>
        <p class="mt-1 text-sm text-muted">
          One item per line works best. These checklist items are used for ranking and boat-level
          commentary.
        </p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Must-haves">
          <UTextarea
            v-model="mustHavesText"
            class="w-full min-h-32"
            autoresize
            placeholder="Diesel power&#10;Tower or bridge visibility&#10;Cockpit layout for tuna gear"
          />
        </UFormField>
        <UFormField label="Deal-breakers">
          <UTextarea
            v-model="dealBreakersText"
            class="w-full min-h-32"
            autoresize
            placeholder="Project boat&#10;Gas engines&#10;Too far from the Gulf"
          />
        </UFormField>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { BoatInventoryFilters } from '~~/app/types/boat-inventory'

defineProps<{
  loading?: boolean
  hasActiveFilters: boolean
}>()

const filters = defineModel<BoatInventoryFilters>({ required: true })

const emit = defineEmits<{
  submit: []
  clear: []
}>()
</script>

<template>
  <UCard class="card-base border-default" :ui="{ body: 'p-6 space-y-5' }">
    <div class="space-y-2">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-semibold text-default">Filter inventory</h2>
        <UBadge
          :label="hasActiveFilters ? 'Custom filters active' : 'All inventory'"
          :color="hasActiveFilters ? 'primary' : 'neutral'"
          variant="subtle"
        />
      </div>
      <p class="text-sm text-muted">
        Apply structured filters, then scan the listings grid below for source-attributed matches.
      </p>
    </div>

    <UForm :state="filters" class="space-y-5" @submit.prevent="emit('submit')">
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField name="make" label="Make">
          <UInput
            v-model="filters.make"
            class="w-full"
            placeholder="Grady-White, Boston Whaler, Sea Ray"
          />
        </UFormField>

        <UFormField name="location" label="Location">
          <UInput v-model="filters.location" class="w-full" placeholder="FL, Miami, Gulf Coast" />
        </UFormField>

        <UFormField name="minPrice" label="Minimum price">
          <UInput
            v-model="filters.minPrice"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="25000"
          />
        </UFormField>

        <UFormField name="maxPrice" label="Maximum price">
          <UInput
            v-model="filters.maxPrice"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="100000"
          />
        </UFormField>

        <UFormField name="minLength" label="Minimum length (ft)">
          <UInput
            v-model="filters.minLength"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="20"
          />
        </UFormField>

        <UFormField name="maxLength" label="Maximum length (ft)">
          <UInput
            v-model="filters.maxLength"
            class="w-full"
            type="number"
            inputmode="numeric"
            placeholder="42"
          />
        </UFormField>
      </div>

      <div class="flex flex-wrap gap-3">
        <UButton type="submit" label="Apply filters" icon="i-lucide-search" :loading="loading" />
        <UButton
          label="Clear filters"
          icon="i-lucide-rotate-ccw"
          color="neutral"
          variant="soft"
          :disabled="!hasActiveFilters"
          @click="emit('clear')"
        />
      </div>
    </UForm>
  </UCard>
</template>

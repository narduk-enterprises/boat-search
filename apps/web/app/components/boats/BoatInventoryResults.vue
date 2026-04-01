<script setup lang="ts">
import type {
  BoatInventoryBoat,
} from '~~/app/types/boat-inventory'
import BoatInventoryListItem from '~~/app/components/boats/BoatInventoryListItem.vue'

const props = withDefaults(
  defineProps<{
    boats: BoatInventoryBoat[]
    status: 'idle' | 'pending' | 'success' | 'error'
    errorMessage?: string | null
    hasActiveFilters: boolean
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
  retry: []
}>()

const visiblePages = computed(() => {
  const start = Math.max(1, props.currentPage - 2)
  const end = Math.min(props.pageCount, props.currentPage + 2)

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

const emptyMessage = computed(() =>
  props.hasActiveFilters
    ? 'Widen the budget or hull-size band, or clear one of the applied filters below.'
    : 'Inventory is still filling in. Check back after the next import run.',
)

</script>

<template>
  <div class="space-y-3 sm:space-y-5">
    <div v-if="status === 'pending' && !boats.length" class="space-y-4">
      <UCard
        v-for="index in 5"
        :key="index"
        class="brand-surface overflow-hidden"
        :ui="{ body: 'p-0' }"
      >
        <div class="grid gap-0 md:grid-cols-[16rem_minmax(0,1fr)]">
          <USkeleton class="aspect-[16/10] w-full md:h-full" />
          <div class="space-y-4 p-4 sm:p-5">
            <div class="flex flex-wrap gap-2">
              <USkeleton class="h-6 w-20 rounded-full" />
              <USkeleton class="h-6 w-24 rounded-full" />
              <USkeleton class="h-6 w-24 rounded-full" />
            </div>
            <USkeleton class="h-4 w-28" />
            <USkeleton class="h-7 w-3/4" />
            <USkeleton class="h-4 w-full" />
            <USkeleton class="h-4 w-11/12" />
            <div class="flex gap-2">
              <USkeleton class="h-10 w-28 rounded-full" />
              <USkeleton class="h-10 w-36 rounded-full" />
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <UCard
      v-else-if="errorMessage"
      class="brand-surface"
      :ui="{ body: 'p-8 space-y-4 text-center' }"
    >
      <UIcon name="i-lucide-alert-circle" class="mx-auto text-4xl text-warning" />
      <div class="space-y-2">
        <h3 class="text-lg font-semibold text-default">Could not load inventory</h3>
        <p class="mx-auto max-w-2xl text-sm text-muted">{{ errorMessage }}</p>
      </div>
      <div class="flex flex-wrap justify-center gap-2">
        <UButton
          label="Retry"
          icon="i-lucide-refresh-cw"
          class="w-full justify-center sm:w-auto"
          @click="emit('retry')"
        />
        <UButton
          v-if="hasActiveFilters"
          color="neutral"
          variant="soft"
          label="Clear filters"
          icon="i-lucide-rotate-ccw"
          class="w-full justify-center sm:w-auto"
          @click="emit('clearFilters')"
        />
      </div>
    </UCard>

    <div v-else-if="!boats.length" class="brand-surface rounded-[1.6rem] px-6 py-12 text-center">
      <UIcon name="i-lucide-search-x" class="mx-auto text-4xl text-dimmed" />
      <h2 class="mt-4 text-xl font-semibold text-default">No boats match right now</h2>
      <p class="mx-auto mt-2 max-w-2xl text-sm text-muted">{{ emptyMessage }}</p>
      <UButton
        v-if="hasActiveFilters"
        label="Clear filters"
        icon="i-lucide-rotate-ccw"
        color="neutral"
        variant="soft"
        class="mt-6"
        @click="emit('clearFilters')"
      />
    </div>

    <div v-else class="space-y-4">
      <BoatInventoryListItem v-for="boat in boats" :key="boat.id" :boat="boat" />
    </div>

    <div
      v-if="boats.length && pageCount > 1"
      class="brand-surface flex flex-col gap-3 rounded-[1.6rem] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="text-sm text-muted">Page {{ currentPage }} of {{ pageCount }}</p>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          label="Previous"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="soft"
          :disabled="!hasPreviousPage"
          class="w-full justify-center sm:w-auto"
          @click="emit('changePage', currentPage - 1)"
        />
        <UButton
          v-for="page in visiblePages"
          :key="page"
          :label="String(page)"
          :color="page === currentPage ? 'primary' : 'neutral'"
          :variant="page === currentPage ? 'soft' : 'ghost'"
          class="min-w-11 justify-center"
          @click="emit('changePage', page)"
        />
        <UButton
          label="Next"
          trailing-icon="i-lucide-arrow-right"
          color="neutral"
          variant="soft"
          :disabled="!hasNextPage"
          class="w-full justify-center sm:w-auto"
          @click="emit('changePage', currentPage + 1)"
        />
      </div>
    </div>
  </div>
</template>

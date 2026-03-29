<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    src?: string | null
    alt: string
    imgClass?: string
    loading?: 'eager' | 'lazy'
    draggable?: boolean
  }>(),
  {
    src: null,
    imgClass: 'h-full w-full object-cover',
    loading: 'lazy',
    draggable: false,
  },
)

const failed = shallowRef(false)

watch(
  () => props.src,
  () => {
    failed.value = false
  },
)
</script>

<template>
  <div class="relative isolate overflow-hidden">
    <img
      v-if="props.src && !failed"
      :src="props.src"
      :alt="props.alt"
      :class="props.imgClass"
      :draggable="props.draggable"
      :loading="props.loading"
      @error="failed = true"
    />

    <div v-else class="boat-image-fallback absolute inset-0 flex items-center justify-center">
      <div
        class="brand-surface-soft relative flex flex-col items-center gap-2 rounded-3xl px-5 py-4"
      >
        <UIcon name="i-lucide-ship-wheel" class="text-2xl text-primary" />
        <div class="space-y-1 text-center">
          <p class="text-sm font-semibold text-default">Photo unavailable</p>
          <p class="max-w-[12rem] text-xs text-muted">
            Open the source listing for the freshest gallery and broker media.
          </p>
        </div>
      </div>
    </div>

    <slot />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    src?: string | null
    alt: string
    imgClass?: string
    loading?: 'eager' | 'lazy'
    draggable?: boolean
    width?: number
    height?: number
    sizes?: string
    quality?: number
  }>(),
  {
    src: null,
    imgClass: 'h-full w-full object-cover',
    loading: 'lazy',
    draggable: false,
    width: undefined,
    height: undefined,
    sizes: undefined,
    quality: 72,
  },
)

const runtimeConfig = useRuntimeConfig()
const failed = shallowRef(false)
const normalizedSrc = computed(() => props.src?.trim() || '')
const optimizedSrc = computed(() => {
  const source = normalizedSrc.value
  if (!source) return null

  if (source.startsWith('/images/')) {
    return source
  }

  try {
    const appOrigin = new URL(runtimeConfig.public.appUrl).origin
    const resolvedUrl = new URL(source, appOrigin)

    if (resolvedUrl.origin !== appOrigin || !resolvedUrl.pathname.startsWith('/images/')) {
      return null
    }

    return `${resolvedUrl.pathname}${resolvedUrl.search}`
  } catch {
    return null
  }
})

watch(
  () => props.src,
  () => {
    failed.value = false
  },
)
</script>

<template>
  <div class="relative isolate overflow-hidden">
    <NuxtImg
      v-if="optimizedSrc && !failed"
      :src="optimizedSrc"
      :alt="props.alt"
      :class="props.imgClass"
      :draggable="props.draggable"
      :loading="props.loading"
      :width="props.width"
      :height="props.height"
      :sizes="props.sizes"
      :quality="props.quality"
      format="webp"
      @error="failed = true"
    />

    <img
      v-else-if="normalizedSrc && !failed"
      :src="normalizedSrc"
      :alt="props.alt"
      :class="props.imgClass"
      :draggable="props.draggable"
      :loading="props.loading"
      decoding="async"
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

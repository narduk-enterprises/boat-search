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
    /** Tiny strip / thumb slots: icon-only fallback instead of a tall copy block */
    compactFallback?: boolean
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
    compactFallback: false,
  },
)

const runtimeConfig = useRuntimeConfig()
const failed = shallowRef(false)
const retryCount = shallowRef(0)
const normalizedSrc = computed(() => props.src?.trim() || '')
const shouldRetryLocalImage = computed(
  () => normalizedSrc.value.startsWith('/images/') && retryCount.value < 6,
)
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
const retryableSrc = computed(() => {
  const source = optimizedSrc.value || normalizedSrc.value
  if (!source) return null

  if (!normalizedSrc.value.startsWith('/images/') || retryCount.value === 0) {
    return source
  }

  const separator = source.includes('?') ? '&' : '?'
  return `${source}${separator}retry=${retryCount.value}`
})

let retryTimer: ReturnType<typeof setTimeout> | null = null

function clearRetryTimer() {
  if (!retryTimer) return

  clearTimeout(retryTimer)
  retryTimer = null
}

function handleImageError() {
  clearRetryTimer()

  if (!shouldRetryLocalImage.value) {
    failed.value = true
    return
  }

  failed.value = true
  retryTimer = setTimeout(() => {
    retryCount.value += 1
    failed.value = false
    retryTimer = null
  }, 2_500)
}

watch(
  () => props.src,
  () => {
    clearRetryTimer()
    failed.value = false
    retryCount.value = 0
  },
)

onBeforeUnmount(() => {
  clearRetryTimer()
})
</script>

<template>
  <div class="relative isolate h-full min-w-0 w-full overflow-hidden">
    <NuxtImg
      v-if="retryableSrc && !failed && optimizedSrc"
      :src="retryableSrc"
      :alt="props.alt"
      :class="props.imgClass"
      :draggable="props.draggable"
      :loading="props.loading"
      :width="props.width"
      :height="props.height"
      :sizes="props.sizes"
      :quality="props.quality"
      format="webp"
      @error="handleImageError"
    />

    <img
      v-else-if="retryableSrc && !failed"
      :src="retryableSrc"
      :alt="props.alt"
      :class="props.imgClass"
      :draggable="props.draggable"
      :loading="props.loading"
      decoding="async"
      @error="handleImageError"
    />

    <div
      v-else
      class="absolute inset-0 flex items-center justify-center"
      :class="props.compactFallback ? 'bg-muted' : 'boat-image-fallback'"
    >
      <template v-if="props.compactFallback">
        <span class="sr-only">{{ props.alt }} — preview unavailable</span>
        <UIcon name="i-lucide-image-off" class="text-xl text-dimmed" aria-hidden="true" />
      </template>
      <div
        v-else
        class="brand-surface-soft relative mx-4 max-w-md flex flex-col items-center gap-3 rounded-3xl px-6 py-5 text-center shadow-card"
      >
        <UIcon name="i-lucide-images" class="text-3xl text-primary" aria-hidden="true" />
        <div class="space-y-1">
          <p class="text-sm font-semibold text-default">Photos load on the source site</p>
          <p class="text-pretty text-sm leading-relaxed text-muted">
            We could not show a cached image. Open the original listing for the full gallery and the
            freshest broker media.
          </p>
        </div>
      </div>
    </div>

    <slot />
  </div>
</template>

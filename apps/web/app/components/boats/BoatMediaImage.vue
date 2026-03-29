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

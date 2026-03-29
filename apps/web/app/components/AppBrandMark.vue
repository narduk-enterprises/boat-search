<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg'
    subtitle?: string | null
    wordmark?: string
  }>(),
  {
    size: 'md',
    subtitle: null,
    wordmark: 'Boat Search',
  },
)

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return {
        mark: 'size-11 rounded-[1rem]',
        title: 'text-base',
        subtitle: 'text-[0.65rem]',
      }
    case 'lg':
      return {
        mark: 'size-14 rounded-[1.35rem]',
        title: 'text-2xl',
        subtitle: 'text-xs',
      }
    default:
      return {
        mark: 'size-12 rounded-[1.15rem]',
        title: 'text-lg',
        subtitle: 'text-[0.7rem]',
      }
  }
})
</script>

<template>
  <div class="flex items-center gap-3 text-left">
    <div :class="['brand-mark inline-flex items-center justify-center shrink-0', sizeClasses.mark]">
      <NuxtImg src="/favicon.svg" alt="" width="64" height="64" densities="x1" class="size-[72%]" />
    </div>

    <div class="min-w-0 leading-none">
      <p
        :class="[
          'font-display font-semibold tracking-[0.02em] text-highlighted whitespace-nowrap',
          sizeClasses.title,
        ]"
      >
        {{ props.wordmark }}
      </p>
      <p
        v-if="props.subtitle"
        :class="[
          'mt-1 hidden text-dimmed uppercase tracking-[0.26em] sm:block',
          sizeClasses.subtitle,
        ]"
      >
        {{ props.subtitle }}
      </p>
    </div>
  </div>
</template>

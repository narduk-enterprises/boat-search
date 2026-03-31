<script setup lang="ts">
useSeo({
  title: 'Sign In',
  description: 'Sign in before starting the AI-first fishing boat finder.',
  ogImage: {
    title: 'Sign In',
    description: 'Access your Boat Search account.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Sign In',
  description: 'Sign in before starting the AI-first fishing boat finder.',
})
definePageMeta({ middleware: ['guest'] })

const route = useRoute()
const redirectPath = computed(() => {
  const r = route.query.redirect
  if (typeof r !== 'string' || !r.startsWith('/') || r.startsWith('//')) return '/account/profile'
  return r
})
</script>

<template>
  <div
    class="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-5xl items-start justify-center pt-4 sm:pt-8 lg:pt-12"
  >
    <AuthLoginCard
      title="Welcome back"
      subtitle="Sign in before we build your fishing-boat shortlist"
      class="w-full max-w-[30rem]"
      :redirect-path="redirectPath"
    />
  </div>
</template>

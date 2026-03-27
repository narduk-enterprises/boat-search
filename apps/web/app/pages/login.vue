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
  if (typeof r !== 'string' || !r.startsWith('/') || r.startsWith('//')) return '/ai-boat-finder'
  return r
})
</script>

<template>
  <div class="flex items-center justify-center min-h-[calc(100vh-8rem)]">
    <AuthLoginCard
      title="Welcome back"
      subtitle="Sign in before we build your fishing-boat shortlist"
      :redirect-path="redirectPath"
    />
  </div>
</template>

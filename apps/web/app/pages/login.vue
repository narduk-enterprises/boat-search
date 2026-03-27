<script setup lang="ts">
useSeo({
  title: 'Sign In',
  description: 'Sign in to save searches, favorites, and your buyer profile.',
  ogImage: {
    title: 'Sign In',
    description: 'Access your Boat Search account.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Sign In',
  description: 'Sign in to save searches, favorites, and your buyer profile.',
})
definePageMeta({ middleware: ['guest'] })

const route = useRoute()
const redirectPath = computed(() => {
  const r = route.query.redirect
  if (typeof r !== 'string' || !r.startsWith('/') || r.startsWith('//')) return '/browse'
  return r
})
</script>

<template>
  <div class="flex items-center justify-center min-h-[calc(100vh-8rem)]">
    <AuthLoginCard
      title="Welcome back"
      subtitle="Sign in to save searches and favorite listings"
      :redirect-path="redirectPath"
    />
  </div>
</template>

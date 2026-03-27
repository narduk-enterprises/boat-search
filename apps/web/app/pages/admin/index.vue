<script setup lang="ts">
definePageMeta({ middleware: ['admin'] })

useSeo({
  title: 'Admin Redirect',
  description: 'Redirecting to the protected inventory dashboard.',
  ogImage: {
    title: 'Admin Redirect',
    description: 'Redirecting to the protected inventory dashboard.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Admin Redirect',
  description: 'Redirecting to the protected inventory dashboard.',
})

await navigateTo('/admin/inventory', { replace: true })
</script>

<template>
  <div />
</template>

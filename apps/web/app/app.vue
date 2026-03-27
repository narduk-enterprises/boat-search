<script setup lang="ts">
const route = useRoute()
const config = useRuntimeConfig()
const appName = config.public.appName || 'Boat Search'

const navLinks = [
  { label: 'Home', to: '/', icon: 'i-lucide-home' },
  { label: 'Search', to: '/search', icon: 'i-lucide-search' },
  { label: 'Browse', to: '/browse', icon: 'i-lucide-compass' },
  { label: 'Guides', to: '/guides', icon: 'i-lucide-book-open' },
  { label: 'Alerts', to: '/boat-alerts', icon: 'i-lucide-bell' },
  { label: 'AI finder', to: '/ai-boat-finder', icon: 'i-lucide-sparkles' },
]

const isFullBleedLayout = computed(() => {
  const m = route.meta.layout
  return m === 'landing' || m === 'wide'
})

const footerLinkClass = 'text-sm text-muted hover:text-default transition-fast'
</script>

<template>
  <LayerAppShell>
    <template #header>
      <LayerAppHeader app-name="" logo-text="BS" :nav-links="navLinks">
        <template #logo>
          <NuxtLink to="/" class="flex items-center gap-2.5 group shrink-0">
            <div
              class="size-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm"
            >
              BS
            </div>
            <span class="font-display font-semibold text-lg hidden sm:block">
              {{ appName }}
            </span>
          </NuxtLink>
        </template>
        <template #actions>
          <UButton
            to="/login"
            label="Sign in"
            color="neutral"
            variant="ghost"
            class="hidden sm:inline-flex"
          />
        </template>
      </LayerAppHeader>
    </template>

    <div
      :class="[
        'flex-1 w-full',
        isFullBleedLayout
          ? 'px-4 sm:px-6 lg:px-8 py-6'
          : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8',
      ]"
    >
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </div>

    <template #footer>
      <LayerAppFooter :app-name="appName">
        <template #links>
          <div
            class="flex flex-col md:flex-row md:items-center md:justify-between gap-6 w-full max-w-7xl mx-auto"
          >
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-2 text-sm">
              <div class="flex flex-col gap-2">
                <span class="text-xs font-semibold text-dimmed uppercase tracking-wide"
                  >Product</span
                >
                <NuxtLink :class="footerLinkClass" to="/search">Search boats</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/boat-alerts">Boat alerts</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/ai-boat-finder">AI boat finder</NuxtLink>
              </div>
              <div class="flex flex-col gap-2">
                <span class="text-xs font-semibold text-dimmed uppercase tracking-wide"
                  >Browse</span
                >
                <NuxtLink :class="footerLinkClass" to="/browse">All browse paths</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/boats-for-sale">Boats for sale</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/guides">Buying guides</NuxtLink>
              </div>
              <div class="flex flex-col gap-2">
                <span class="text-xs font-semibold text-dimmed uppercase tracking-wide"
                  >Company</span
                >
                <NuxtLink :class="footerLinkClass" to="/about">About</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/faq">FAQ</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/contact">Contact</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/privacy">Privacy</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/terms">Terms</NuxtLink>
              </div>
            </div>
            <p class="text-sm text-muted text-center md:text-right">
              Listings attributed to original sources. AI output is advisory only.
            </p>
          </div>
        </template>
      </LayerAppFooter>
    </template>
  </LayerAppShell>
</template>

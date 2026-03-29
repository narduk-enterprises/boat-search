<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

interface NavLink {
  label: string
  to: RouteLocationRaw
  icon: string
  matchPrefixes: string[]
}

const route = useRoute()
const config = useRuntimeConfig()
const appName = config.public.appName || 'Boat Search'
const { loggedIn } = useUserSession()
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- color mode types resolve at build time
const colorMode = useColorMode() as any
const mobileMenuOpen = shallowRef(false)

const navLinks = computed<NavLink[]>(() => {
  const base: NavLink[] = [
    {
      label: 'Live inventory',
      to: '/boats-for-sale',
      icon: 'i-lucide-search',
      matchPrefixes: ['/boats-for-sale', '/boats'],
    },
    {
      label: 'Browse paths',
      to: '/browse',
      icon: 'i-lucide-compass',
      matchPrefixes: ['/browse', '/best', '/guides'],
    },
    {
      label: 'Boat finder',
      to: '/ai-boat-finder',
      icon: 'i-lucide-sparkles',
      matchPrefixes: ['/ai-boat-finder'],
    },
  ]

  if (loggedIn.value) {
    base.push({
      label: 'Shortlist',
      to: '/search',
      icon: 'i-lucide-ship-wheel',
      matchPrefixes: ['/search', '/account/recommendations'],
    })
  }

  return base
})

const accountLinks = computed(() => {
  if (!loggedIn.value) {
    return [
      { label: 'Sign in', to: '/login', icon: 'i-lucide-log-in' },
      { label: 'About the product', to: '/about', icon: 'i-lucide-info' },
    ]
  }

  return [
    { label: 'Saved profile', to: '/account/profile', icon: 'i-lucide-user-round' },
    { label: 'Favorites', to: '/account/favorites', icon: 'i-lucide-heart' },
    { label: 'Alerts', to: '/account/alerts', icon: 'i-lucide-bell-ring' },
  ]
})

const isFullBleedLayout = computed(() => {
  const m = route.meta.layout
  return m === 'landing' || m === 'wide'
})

const shellContentClass = computed(() =>
  isFullBleedLayout.value
    ? 'w-full px-4 pb-10 pt-4 sm:px-6 sm:pb-14 lg:px-8'
    : 'mx-auto w-full max-w-[94rem] px-4 pb-12 pt-6 sm:px-6 lg:px-8',
)
const footerLinkClass = 'text-sm text-muted hover:text-default transition-fast'

const colorModeIcon = computed(() => {
  if (colorMode.preference === 'system') return 'i-lucide-monitor'
  return colorMode.value === 'dark' ? 'i-lucide-moon-star' : 'i-lucide-sun-medium'
})

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false
  },
)

function cycleColorMode() {
  const modes = ['light', 'dark', 'system'] as const
  const currentIndex = modes.indexOf(colorMode.preference as (typeof modes)[number])
  colorMode.preference = modes[(currentIndex + 1) % modes.length]
}

function isActiveLink(link: NavLink) {
  if (typeof link.to !== 'string') return false

  return link.matchPrefixes.some(
    (prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`),
  )
}
</script>

<template>
  <LayerAppShell>
    <template #header>
      <div class="brand-shell-header">
        <div class="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <NuxtLink to="/" class="shrink-0">
            <AppBrandMark subtitle="Marine market intelligence" />
          </NuxtLink>

          <div class="brand-nav brand-caption hidden flex-1 items-center justify-center xl:flex">
            <NuxtLink
              v-for="link in navLinks"
              :key="String(link.to)"
              :to="link.to"
              :data-active="isActiveLink(link)"
              class="brand-nav-link"
            >
              <UIcon :name="link.icon" class="size-4" />
              <span>{{ link.label }}</span>
            </NuxtLink>
          </div>

          <div class="ml-auto flex items-center gap-2">
            <AppUserMenu
              v-if="loggedIn"
              class="hidden lg:block"
              :menu-links="[
                { label: 'Boat finder', to: '/ai-boat-finder', icon: 'i-lucide-sparkles' },
                { label: 'Shortlist', to: '/search', icon: 'i-lucide-ship-wheel' },
                { label: 'Saved profile', to: '/account/profile', icon: 'i-lucide-user-round' },
                { label: 'Favorites', to: '/account/favorites', icon: 'i-lucide-heart' },
              ]"
              logout-redirect="/login"
            />
            <UButton
              v-else
              to="/login"
              label="Sign in"
              color="neutral"
              variant="soft"
              class="hidden sm:inline-flex"
            />
            <UButton
              :icon="colorModeIcon"
              color="neutral"
              variant="ghost"
              aria-label="Change color mode"
              @click="cycleColorMode"
            />
            <UButton
              color="neutral"
              variant="ghost"
              class="xl:hidden"
              :icon="mobileMenuOpen ? 'i-lucide-x' : 'i-lucide-menu'"
              aria-label="Toggle navigation menu"
              :aria-expanded="mobileMenuOpen"
              @click="mobileMenuOpen = !mobileMenuOpen"
            />
          </div>
        </div>

        <Transition name="slide-down">
          <div v-if="mobileMenuOpen" class="border-t border-default/80 xl:hidden">
            <div class="mx-auto max-w-7xl px-4 pb-4 pt-3 sm:px-6 lg:px-8">
              <div class="brand-surface space-y-1 p-3">
                <NuxtLink
                  v-for="link in navLinks"
                  :key="`mobile-${String(link.to)}`"
                  :to="link.to"
                  :data-active="isActiveLink(link)"
                  class="brand-mobile-link"
                >
                  <UIcon :name="link.icon" class="size-4" />
                  <span>{{ link.label }}</span>
                </NuxtLink>

                <USeparator class="my-2" />

                <NuxtLink
                  v-for="link in accountLinks"
                  :key="`account-${String(link.to)}`"
                  :to="link.to"
                  class="brand-mobile-link"
                >
                  <UIcon :name="link.icon" class="size-4 text-primary" />
                  <span>{{ link.label }}</span>
                </NuxtLink>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </template>

    <div :class="shellContentClass">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </div>

    <template #footer>
      <LayerAppFooter :app-name="appName" :show-copyright="false" class="brand-shell-footer">
        <div
          class="flex w-full max-w-7xl flex-col gap-8 py-3 lg:flex-row lg:items-end lg:justify-between"
        >
          <div class="space-y-4">
            <AppBrandMark subtitle="Marine market intelligence" />
            <p class="max-w-2xl text-sm text-muted">
              Boat Search turns noisy marketplace inventory into a calmer buying workflow: browse
              the market, pressure-test a shortlist, and open source listings only when they merit
              attention.
            </p>
            <p class="text-sm text-dimmed">
              <NuxtTime :datetime="new Date()" year="numeric" /> {{ appName }}. Listing data stays
              attributed to original sources. AI output is advisory only.
            </p>
          </div>

          <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-dimmed">Explore</p>
              <div class="flex flex-col gap-2">
                <NuxtLink :class="footerLinkClass" to="/boats-for-sale">Live inventory</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/browse">Browse paths</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/ai-boat-finder">Boat finder</NuxtLink>
              </div>
            </div>
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-dimmed">
                Buyer tools
              </p>
              <div class="flex flex-col gap-2">
                <NuxtLink :class="footerLinkClass" to="/search">Shortlist</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/account/profile">Saved profile</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/account/alerts">Alerts</NuxtLink>
              </div>
            </div>
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-dimmed">Company</p>
              <div class="flex flex-col gap-2">
                <NuxtLink :class="footerLinkClass" to="/about">About</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/faq">FAQ</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/privacy">Privacy</NuxtLink>
                <NuxtLink :class="footerLinkClass" to="/terms">Terms</NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </LayerAppFooter>
    </template>
  </LayerAppShell>
</template>

<style>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all var(--transition-base);
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

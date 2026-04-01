<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import {
  BOAT_INVENTORY_MAP_PATH,
  BOAT_INVENTORY_RESULTS_HASH,
  BOAT_INVENTORY_SEARCH_PATH,
  makeInventoryMapRoute,
} from '~~/app/utils/boatBrowse'
import {
  buildBoatInventoryNavigationQuery,
  normalizeBoatInventoryPage,
  normalizeBoatInventorySort,
  routeQueryToBoatInventoryFilters,
} from '~~/app/utils/boatInventorySearch'

interface NavLink {
  label: string
  to: RouteLocationRaw
  icon: string
  matchPrefixes: string[]
  excludePrefixes?: string[]
}

const route = useRoute()
const config = useRuntimeConfig()
const appName = config.public.appName || 'Boat Search'
const { loggedIn } = useUserSession()
const { label: aiEntryLabel, to: aiEntryTo } = useAiBoatFinderEntry()
const mobileMenuOpen = shallowRef(false)
const routeMiddleware = computed(() => {
  const middleware = route.meta.middleware

  if (Array.isArray(middleware)) {
    return middleware
  }

  return middleware ? [middleware] : []
})

const isGuestOnlyRoute = computed(() => routeMiddleware.value.includes('guest'))
const isInventoryWorkspaceRoute = computed(
  () => route.path === BOAT_INVENTORY_SEARCH_PATH || route.path === BOAT_INVENTORY_MAP_PATH,
)
const isInventoryMapRoute = computed(() => route.path === BOAT_INVENTORY_MAP_PATH)
const inventoryWorkspaceQuery = computed<Record<string, string>>(() => {
  if (!isInventoryWorkspaceRoute.value) return {}

  return buildBoatInventoryNavigationQuery({
    filters: routeQueryToBoatInventoryFilters(route.query),
    sort: normalizeBoatInventorySort(route.query.sort),
    page: normalizeBoatInventoryPage(route.query.page),
  })
})
const inventorySearchNavTo = computed<RouteLocationRaw>(() => {
  if (!isInventoryWorkspaceRoute.value) return BOAT_INVENTORY_SEARCH_PATH

  const hash =
    route.path === BOAT_INVENTORY_MAP_PATH ? BOAT_INVENTORY_RESULTS_HASH : route.hash || ''

  return {
    path: BOAT_INVENTORY_SEARCH_PATH,
    query: inventoryWorkspaceQuery.value,
    ...(hash ? { hash } : {}),
  }
})
const inventoryMapNavTo = computed<RouteLocationRaw>(() => {
  if (!isInventoryWorkspaceRoute.value) return BOAT_INVENTORY_MAP_PATH
  return makeInventoryMapRoute(inventoryWorkspaceQuery.value)
})

const navLinks = computed<NavLink[]>(() => {
  const base: NavLink[] = [
    {
      label: 'Live inventory',
      to: inventorySearchNavTo.value,
      icon: 'i-lucide-search',
      matchPrefixes: [BOAT_INVENTORY_SEARCH_PATH, '/boats'],
      excludePrefixes: [BOAT_INVENTORY_MAP_PATH],
    },
    {
      label: 'Map',
      to: inventoryMapNavTo.value,
      icon: 'i-lucide-map',
      matchPrefixes: [BOAT_INVENTORY_MAP_PATH],
    },
    {
      label: aiEntryLabel.value,
      to: aiEntryTo.value,
      icon: 'i-lucide-sparkles',
      matchPrefixes: ['/account/profile', '/ai-boat-finder'],
    },
  ]

  return base
})

const accountLinks = computed(() => {
  if (!loggedIn.value) {
    if (isGuestOnlyRoute.value) {
      return [{ label: 'About the product', to: '/about', icon: 'i-lucide-info' }]
    }

    return [
      { label: 'Sign in', to: '/login', icon: 'i-lucide-log-in' },
      { label: 'About the product', to: '/about', icon: 'i-lucide-info' },
    ]
  }

  return [
    { label: 'AI Boat Profiles', to: '/account/profile', icon: 'i-lucide-user-round' },
    { label: 'Favorites', to: '/account/favorites', icon: 'i-lucide-heart' },
    { label: 'Alerts', to: '/account/alerts', icon: 'i-lucide-bell-ring' },
  ]
})

const isFullBleedLayout = computed(() => {
  const m = route.meta.layout
  return m === 'landing' || m === 'wide'
})
const showShellFooter = computed(() => route.meta.shellFooter !== false)

// App shell gutter below the sticky header — separate from Nuxt UI (UPage / UPageSection). Tight
// vertical padding here; section spacing is tuned in app.config `ui.pageSection.slots.container`.
const shellContentClass = computed(() =>
  isInventoryMapRoute.value
    ? 'mx-auto w-full min-w-0 max-w-[94rem] px-4 pb-0 pt-0 sm:px-6 lg:px-8'
    : isInventoryWorkspaceRoute.value
      ? 'mx-auto w-full min-w-0 max-w-[94rem] px-4 pb-10 pt-0 sm:px-6 sm:pb-12 sm:pt-1 lg:px-8'
      : isFullBleedLayout.value
        ? 'w-full min-w-0 px-4 pb-10 pt-4 sm:px-6 sm:pb-14 lg:px-8'
        : 'mx-auto w-full min-w-0 max-w-[94rem] px-4 pb-12 pt-3 sm:px-6 sm:pt-4 lg:px-8',
)
const footerLinkClass = 'text-sm text-muted hover:text-default transition-fast'

watch(
  () => route.fullPath,
  () => {
    mobileMenuOpen.value = false
  },
)

function isActiveLink(link: NavLink) {
  const targetPath =
    typeof link.to === 'string'
      ? link.to
      : typeof link.to === 'object' && 'path' in link.to && typeof link.to.path === 'string'
        ? link.to.path
        : null

  if (!targetPath) return false

  if (
    link.excludePrefixes?.some(
      (prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`),
    )
  ) {
    return false
  }

  return link.matchPrefixes.some(
    (prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`),
  )
}
</script>

<template>
  <LayerAppShell>
    <template #header>
      <div class="brand-shell-header">
        <div class="mx-auto w-full max-w-7xl px-4 py-1.5 sm:px-6 sm:py-2 lg:px-8">
          <div class="brand-header-bar">
            <div class="brand-header-side brand-header-side-start">
              <NuxtLink to="/" class="flex min-w-0 shrink-0 items-center">
                <AppBrandMark size="sm" subtitle="Marine market intelligence" />
              </NuxtLink>
            </div>

            <div class="brand-header-center hidden xl:flex">
              <div
                class="brand-nav brand-caption w-max min-w-0 max-w-full xl:flex xl:flex-row xl:items-center"
              >
                <NuxtLink
                  v-for="link in navLinks"
                  :key="link.label"
                  :to="link.to"
                  :data-active="isActiveLink(link)"
                  class="brand-nav-link"
                >
                  <UIcon :name="link.icon" class="size-4" />
                  <span>{{ link.label }}</span>
                </NuxtLink>
              </div>
            </div>

            <div class="brand-header-side brand-header-side-end">
              <div class="flex items-center justify-end gap-2">
                <AppUserMenu
                  v-if="loggedIn"
                  class="hidden lg:block"
                  :menu-links="[
                    {
                      label: 'AI Boat Profiles',
                      to: '/account/profile',
                      icon: 'i-lucide-sparkles',
                    },
                    { label: 'Shortlist history', to: '/search', icon: 'i-lucide-ship-wheel' },
                    { label: 'Favorites', to: '/account/favorites', icon: 'i-lucide-heart' },
                  ]"
                  logout-redirect="/login"
                />
                <UButton
                  v-else-if="!isGuestOnlyRoute"
                  to="/login"
                  label="Sign in"
                  color="neutral"
                  variant="soft"
                  class="hidden min-w-[6.5rem] justify-center sm:inline-flex"
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
          </div>
        </div>

        <Transition name="slide-down">
          <div v-if="mobileMenuOpen" class="border-t border-default/80 xl:hidden">
            <div class="mx-auto max-w-7xl px-4 pb-4 pt-3 sm:px-6 lg:px-8">
              <div class="brand-surface space-y-1 p-3">
                <NuxtLink
                  v-for="link in navLinks"
                  :key="`mobile-${link.label}`"
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

    <template v-if="showShellFooter" #footer>
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
                <NuxtLink :class="footerLinkClass" to="/boats-for-sale/map">Inventory map</NuxtLink>
              </div>
            </div>
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-[0.2em] text-dimmed">
                Buyer tools
              </p>
              <div class="flex flex-col gap-2">
                <NuxtLink :class="footerLinkClass" :to="aiEntryTo">{{ aiEntryLabel }}</NuxtLink>
                <NuxtLink v-if="loggedIn" :class="footerLinkClass" to="/search">
                  Shortlist history
                </NuxtLink>
                <NuxtLink v-if="loggedIn" :class="footerLinkClass" to="/account/alerts">
                  Alerts
                </NuxtLink>
                <NuxtLink v-else :class="footerLinkClass" to="/login">Sign in</NuxtLink>
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

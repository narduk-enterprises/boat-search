export default defineAppConfig({
  auth: {
    redirectPath: '/ai-boat-finder',
  },
  ui: {
    colors: {
      primary: 'cyan',
      secondary: 'amber',
      success: 'emerald',
      info: 'sky',
      warning: 'amber',
      error: 'rose',
      neutral: 'stone',
    },
    // Slots-based theme override (see Nuxt UI theming: ui.*.slots.*). UPageSection applies padding on
    // `container` (UContainer), not `wrapper`; defaults are marketing-sized py-16/sm:24/lg:32.
    // `min-w-0 w-full` on container: flex/grid children can shrink; section fills the column (Tailwind v4 layout).
    pageSection: {
      slots: {
        container:
          'min-w-0 w-full flex flex-col lg:grid gap-6 py-8 sm:gap-10 sm:py-10 lg:gap-12 lg:py-12',
      },
    },
  },
})

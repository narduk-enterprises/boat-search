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
    // Nuxt UI default UPageSection container is py-16/sm:py-24/lg:py-32 — too tall for app-style pages.
    pageSection: {
      slots: {
        container: 'flex flex-col lg:grid gap-6 py-8 sm:gap-10 sm:py-10 lg:gap-12 lg:py-12',
      },
    },
  },
})

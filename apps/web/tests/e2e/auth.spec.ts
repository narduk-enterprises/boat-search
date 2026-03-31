import { defineSharedAuthContract } from '../../../../layers/narduk-nuxt-layer/testing/e2e/auth-contract.ts'

defineSharedAuthContract({
  appName: 'web',
  protectedPath: '/ai-boat-finder',
  dashboardHeading: /Tell us the mission/i,
})

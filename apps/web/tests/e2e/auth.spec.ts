import { defineSharedAuthContract } from '../../../../layers/narduk-nuxt-layer/testing/e2e/auth-contract.ts'

defineSharedAuthContract({
  appName: 'web',
  protectedPath: '/ai-boat-finder',
  dashboardHeading: /Turn how you fish into a ranked shortlist/i,
})

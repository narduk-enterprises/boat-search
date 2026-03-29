import baseConfig from './vitest.config'

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/manual/**/*.test.ts'],
  },
}

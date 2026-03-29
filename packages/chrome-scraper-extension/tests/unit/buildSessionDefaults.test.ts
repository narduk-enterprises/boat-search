import { describe, expect, it } from 'vitest'
import { createDefaultSession } from '@/shared/defaults'
import { applySessionValueDefaults } from '@/sidepanel/utils/buildSessionDefaults'

describe('build session defaults', () => {
  it('seeds an empty session from local defaults', () => {
    const session = createDefaultSession()
    session.appBaseUrl = ''

    applySessionValueDefaults(session, {
      appBaseUrl: 'https://local.boat-search.test',
      appBaseUrlSource: 'local-default',
      connection: {
        apiKey: 'nk_local_default',
        apiKeySource: 'local-default',
      },
    })

    expect(session.appBaseUrl).toBe('https://local.boat-search.test')
    expect(session.appBaseUrlSource).toBe('local-default')
    expect(session.connection.apiKey).toBe('nk_local_default')
    expect(session.connection.apiKeySource).toBe('local-default')
  })

  it('does not overwrite manually saved connection values with local defaults', () => {
    const session = createDefaultSession()
    session.appBaseUrl = ''
    session.appBaseUrlSource = 'manual'
    session.connection.apiKey = ''
    session.connection.apiKeySource = 'manual'

    applySessionValueDefaults(session, {
      appBaseUrl: 'https://local.boat-search.test',
      appBaseUrlSource: 'local-default',
      connection: {
        apiKey: 'nk_local_default',
        apiKeySource: 'local-default',
      },
    })

    expect(session.appBaseUrl).toBe('')
    expect(session.appBaseUrlSource).toBe('manual')
    expect(session.connection.apiKey).toBe('')
    expect(session.connection.apiKeySource).toBe('manual')
  })
})

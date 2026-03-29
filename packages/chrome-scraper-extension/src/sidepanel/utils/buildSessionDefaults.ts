import type { SessionDefaults } from '@/shared/defaults'
import type { ExtensionSession } from '@/shared/types'

function normalizeBuildDefault(value: string | undefined) {
  const normalized = value?.trim() || ''
  return normalized || null
}

export function getBuildSessionDefaults(): SessionDefaults {
  const apiKey = normalizeBuildDefault(import.meta.env.VITE_BOAT_SEARCH_EXTENSION_DEFAULT_API_KEY)
  const appBaseUrl = normalizeBuildDefault(
    import.meta.env.VITE_BOAT_SEARCH_EXTENSION_DEFAULT_APP_BASE_URL,
  )

  return {
    ...(appBaseUrl
      ? {
          appBaseUrl,
          appBaseUrlSource: 'local-default' as const,
        }
      : {}),
    ...(apiKey
      ? {
          connection: {
            apiKey,
            apiKeySource: 'local-default' as const,
          },
        }
      : {}),
  }
}

export function applySessionValueDefaults(
  sessionValue: ExtensionSession,
  defaults: SessionDefaults,
) {
  const defaultApiKey = defaults.connection?.apiKey?.trim() || ''
  const defaultAppBaseUrl = defaults.appBaseUrl?.trim() || ''

  if (
    defaultAppBaseUrl &&
    !sessionValue.appBaseUrl.trim() &&
    sessionValue.appBaseUrlSource !== 'manual'
  ) {
    sessionValue.appBaseUrl = defaultAppBaseUrl
    sessionValue.appBaseUrlSource = defaults.appBaseUrlSource ?? 'local-default'
  }

  if (
    defaultApiKey &&
    !sessionValue.connection.apiKey.trim() &&
    sessionValue.connection.apiKeySource !== 'manual'
  ) {
    sessionValue.connection.apiKey = defaultApiKey
    sessionValue.connection.apiKeySource = defaults.connection?.apiKeySource ?? 'local-default'
  }

  return sessionValue
}

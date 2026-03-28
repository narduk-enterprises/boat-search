import type { ApiKeyCreateResult, ApiKeyRecord } from './useAuthApi'

export function useApiKeysManager() {
  const authApi = useAuthApi()
  const toast = useToast()
  const apiKeys = useState<ApiKeyRecord[]>('account-api-keys', () => [])
  const latestCreatedKey = useState<ApiKeyCreateResult | null>(
    'account-api-keys-latest',
    () => null,
  )
  const loading = useState('account-api-keys-loading', () => false)
  const creating = useState('account-api-keys-creating', () => false)
  const deletingKeyId = useState<string | null>('account-api-keys-deleting-id', () => null)

  async function refreshApiKeys() {
    loading.value = true

    try {
      apiKeys.value = await authApi.listApiKeys()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not load your API keys.'
      toast.add({
        title: 'Could not load API keys',
        description: message,
        color: 'error',
      })
    } finally {
      loading.value = false
    }
  }

  async function createNewApiKey(name: string) {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.add({
        title: 'Name required',
        description: 'Give the API key a name before creating it.',
        color: 'warning',
      })
      return null
    }

    creating.value = true

    try {
      const result = await authApi.createApiKey({ name: trimmedName })
      latestCreatedKey.value = result
      await refreshApiKeys()
      toast.add({
        title: 'API key created',
        description: 'Copy the raw key now. It will not be shown again.',
        color: 'success',
      })
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not create the API key.'
      toast.add({
        title: 'Could not create API key',
        description: message,
        color: 'error',
      })
      return null
    } finally {
      creating.value = false
    }
  }

  async function revokeApiKey(id: string) {
    deletingKeyId.value = id

    try {
      await authApi.deleteApiKey(id)
      apiKeys.value = apiKeys.value.filter((key) => key.id !== id)
      if (latestCreatedKey.value?.id === id) {
        latestCreatedKey.value = null
      }
      toast.add({
        title: 'API key revoked',
        description: 'The extension key can no longer write to Boat Search.',
        color: 'success',
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not revoke the API key.'
      toast.add({
        title: 'Could not revoke API key',
        description: message,
        color: 'error',
      })
    } finally {
      deletingKeyId.value = null
    }
  }

  function clearLatestCreatedKey() {
    latestCreatedKey.value = null
  }

  return {
    apiKeys,
    latestCreatedKey,
    loading,
    creating,
    deletingKeyId,
    refreshApiKeys,
    createNewApiKey,
    revokeApiKey,
    clearLatestCreatedKey,
  }
}

<script setup lang="ts">
const {
  apiKeys,
  latestCreatedKey,
  loading,
  creating,
  deletingKeyId,
  refreshApiKeys,
  createNewApiKey,
  revokeApiKey,
  clearLatestCreatedKey,
} = useApiKeysManager()

const newKeyName = ref('Boat Search Chrome extension')
const copiedRawKey = ref(false)

async function createKey() {
  copiedRawKey.value = false
  const result = await createNewApiKey(newKeyName.value)
  if (result) {
    newKeyName.value = 'Boat Search Chrome extension'
  }
}

async function copyRawKey() {
  if (!latestCreatedKey.value?.rawKey || !import.meta.client) return
  await navigator.clipboard.writeText(latestCreatedKey.value.rawKey)
  copiedRawKey.value = true
}

onMounted(async () => {
  await refreshApiKeys()
})
</script>

<template>
  <UPageSection>
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <h2 class="text-xl font-semibold text-default">
          Extension API keys
        </h2>
        <p class="max-w-3xl text-sm text-muted">
          Create one key for the Chrome scraper extension. The plugin stores it locally, uses it to
          write boats directly into the database, and uploads scraped images into R2.
        </p>
      </div>

      <UCard>
        <div class="flex flex-col gap-4">
          <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <UFormField label="New key name">
              <UInput
                v-model="newKeyName"
                class="w-full"
                placeholder="Boat Search Chrome extension"
              />
            </UFormField>

            <UButton
              :loading="creating"
              icon="i-lucide-key-round"
              @click="createKey"
            >
              Create API key
            </UButton>
          </div>

          <div
            v-if="latestCreatedKey"
            class="rounded-3xl border border-success/40 bg-success/10 p-4"
          >
            <div class="flex flex-col gap-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-default">
                    Copy this key now
                  </p>
                  <p class="text-xs text-muted">
                    The raw key is only shown once. Paste it into the extension’s connection step.
                  </p>
                </div>

                <div class="flex items-center gap-2">
                  <UBadge color="success" variant="soft">
                    {{ latestCreatedKey.keyPrefix }}
                  </UBadge>
                  <UButton
                    color="success"
                    variant="soft"
                    icon="i-lucide-copy"
                    @click="copyRawKey"
                  >
                    {{ copiedRawKey ? 'Copied' : 'Copy key' }}
                  </UButton>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-x"
                    @click="clearLatestCreatedKey"
                  >
                    Dismiss
                  </UButton>
                </div>
              </div>

              <UInput
                :model-value="latestCreatedKey.rawKey"
                class="w-full"
                readonly
                type="text"
              />
            </div>
          </div>
        </div>
      </UCard>

      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-medium text-default">
            Existing keys
          </p>
          <p class="text-xs text-muted">
            Revoke keys you no longer trust. The extension will stop working immediately for revoked
            keys.
          </p>
        </div>

        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="refreshApiKeys"
        >
          Refresh
        </UButton>
      </div>

      <div
        v-if="apiKeys.length"
        class="grid gap-4"
      >
        <UCard
          v-for="apiKey in apiKeys"
          :key="apiKey.id"
        >
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div class="flex flex-col gap-2">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium text-default">
                  {{ apiKey.name }}
                </p>
                <UBadge color="neutral" variant="soft">
                  {{ apiKey.keyPrefix }}
                </UBadge>
              </div>
              <p class="text-xs text-muted">
                Created {{ apiKey.createdAt }}
                <span v-if="apiKey.lastUsedAt"> · Last used {{ apiKey.lastUsedAt }}</span>
              </p>
            </div>

            <UButton
              color="error"
              variant="soft"
              icon="i-lucide-trash-2"
              :loading="deletingKeyId === apiKey.id"
              @click="revokeApiKey(apiKey.id)"
            >
              Revoke
            </UButton>
          </div>
        </UCard>
      </div>

      <UCard v-else>
        <div class="flex flex-col gap-2">
          <p class="font-medium text-default">
            No API keys yet
          </p>
          <p class="text-sm text-muted">
            Create a key above, then paste it into the extension’s connection step.
          </p>
        </div>
      </UCard>
    </div>
  </UPageSection>
</template>

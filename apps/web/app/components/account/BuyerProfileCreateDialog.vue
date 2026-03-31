<script setup lang="ts">
const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  create: [name: string]
}>()

const name = ref('New profile')

function handleCreate() {
  const trimmed = name.value.trim()
  if (trimmed) {
    emit('create', trimmed)
    emit('update:open', false)
    name.value = 'New profile'
  }
}

function handleClose() {
  emit('update:open', false)
  name.value = 'New profile'
}
</script>

<template>
  <UModal :open="props.open" @update:open="handleClose">
    <template #header>
      <h2 class="text-lg font-semibold text-default">Create a new buyer profile</h2>
    </template>

    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          A new profile starts with a blank questionnaire. You can also duplicate an existing
          profile from the library.
        </p>
        <UInput
          v-model="name"
          label="Profile name"
          placeholder="e.g. Tournament rig, Family cruiser"
          class="w-full"
          :maxlength="100"
          autofocus
          @keydown.enter="handleCreate"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="handleClose"
        />
        <UButton
          label="Create profile"
          icon="i-lucide-plus"
          :disabled="!name.trim()"
          @click="handleCreate"
        />
      </div>
    </template>
  </UModal>
</template>

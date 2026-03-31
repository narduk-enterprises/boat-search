<script setup lang="ts">
interface ProfileSummary {
  id: number
  name: string
  isActive: boolean
  isComplete: boolean
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
  canRunNow: boolean
  nextRunAvailableAt: string | null
}

const props = defineProps<{
  profile: ProfileSummary
  rerunning?: boolean
}>()

const emit = defineEmits<{
  edit: [id: number]
  activate: [id: number]
  duplicate: [id: number]
  rerun: [id: number]
  delete: [id: number]
  rename: [id: number, name: string]
}>()

const renaming = shallowRef(false)
const renameInput = ref(props.profile.name)
const renameInputRef = ref<HTMLElement | null>(null)

function startRename() {
  renameInput.value = props.profile.name
  renaming.value = true
  nextTick(() => {
    const el = renameInputRef.value
    if (el && 'focus' in el) {
      ;(el as HTMLInputElement).focus()
    }
  })
}

function commitRename() {
  const trimmed = renameInput.value.trim()
  if (trimmed && trimmed !== props.profile.name) {
    emit('rename', props.profile.id, trimmed)
  }
  renaming.value = false
}

function cancelRename() {
  renaming.value = false
}

const cooldownLabel = computed(() => {
  if (!props.profile.nextRunAvailableAt) return null
  const next = new Date(props.profile.nextRunAvailableAt)
  const delta = next.getTime() - Date.now()
  if (delta <= 0) return null
  const hours = Math.floor(delta / (1000 * 60 * 60))
  const mins = Math.ceil((delta % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
})

const menuItems = computed(() => {
  const items: Array<
    Array<{ label: string; icon: string; onSelect: () => void; disabled?: boolean }>
  > = [
    [
      {
        label: 'Edit questionnaire',
        icon: 'i-lucide-pencil',
        onSelect: () => emit('edit', props.profile.id),
      },
      { label: 'Rename', icon: 'i-lucide-type', onSelect: startRename },
    ],
    [
      {
        label: 'Duplicate',
        icon: 'i-lucide-copy',
        onSelect: () => emit('duplicate', props.profile.id),
      },
      {
        label: props.profile.isActive ? 'Active profile' : 'Set as active',
        icon: props.profile.isActive ? 'i-lucide-check-circle' : 'i-lucide-circle',
        onSelect: () => !props.profile.isActive && emit('activate', props.profile.id),
        disabled: props.profile.isActive,
      },
    ],
    [
      {
        label: 'Delete',
        icon: 'i-lucide-trash-2',
        onSelect: () => emit('delete', props.profile.id),
      },
    ],
  ]
  return items
})
</script>

<template>
  <UCard
    class="card-base border-default"
    :ui="{ body: 'p-4 sm:p-5 space-y-3' }"
    :data-testid="`buyer-profile-card-${profile.id}`"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1 space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <template v-if="renaming">
            <UInput
              ref="renameInputRef"
              v-model="renameInput"
              size="sm"
              class="w-48"
              :maxlength="100"
              @keydown.enter="commitRename"
              @keydown.escape="cancelRename"
              @blur="commitRename"
            />
          </template>
          <template v-else>
            <h3
              class="text-base font-semibold text-default cursor-pointer"
              :title="'Click to rename'"
              @click="startRename"
            >
              {{ profile.name }}
            </h3>
          </template>
          <UBadge
            v-if="profile.isActive"
            label="Active"
            color="primary"
            variant="subtle"
            size="xs"
          />
          <UBadge
            v-if="!profile.isComplete"
            label="Incomplete"
            color="warning"
            variant="soft"
            size="xs"
          />
        </div>

        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span v-if="profile.updatedAt">
            Updated {{ new Date(profile.updatedAt).toLocaleDateString() }}
          </span>
          <span v-if="profile.lastRunAt">
            Last run {{ new Date(profile.lastRunAt).toLocaleDateString() }}
          </span>
          <span v-else class="text-dimmed">Never run</span>
          <span v-if="cooldownLabel" class="text-warning">
            <UIcon name="i-lucide-clock" class="size-3 align-text-bottom" />
            Rerun in {{ cooldownLabel }}
          </span>
        </div>
      </div>

      <UDropdownMenu :items="menuItems">
        <UButton
          icon="i-lucide-more-vertical"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Profile actions"
        />
      </UDropdownMenu>
    </div>

    <div class="flex flex-wrap gap-2 pt-1">
      <UButton
        label="Update Profile"
        icon="i-lucide-pencil"
        color="neutral"
        variant="soft"
        size="xs"
        @click="emit('edit', profile.id)"
      />
      <UButton
        label="Rerun AI"
        icon="i-lucide-refresh-cw"
        size="xs"
        :loading="rerunning"
        :disabled="!profile.canRunNow || !profile.isComplete || rerunning"
        @click="emit('rerun', profile.id)"
      />
      <UButton
        v-if="!profile.isActive"
        label="Set active"
        icon="i-lucide-check-circle"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="emit('activate', profile.id)"
      />
    </div>
  </UCard>
</template>

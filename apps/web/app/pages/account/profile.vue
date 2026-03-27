<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })

useSeo({
  title: 'Buyer profile',
  description: 'Your boating preferences and enrichment prompts.',
  ogImage: {
    title: 'Buyer profile',
    description: 'Your boating preferences and enrichment prompts.',
    icon: '⛵',
  },
})
useWebPageSchema({
  name: 'Buyer profile',
  description: 'Your boating preferences and enrichment prompts.',
})

const toast = useToast()
const { data, status, saveProfile } = useBuyerProfile()

const notes = ref('')
const budgetMax = ref<number | undefined>(undefined)
const preferredMakes = ref('')

watch(
  () => data.value?.profile,
  (p) => {
    if (!p) return
    notes.value = typeof p.notes === 'string' ? p.notes : ''
    const b = p.budgetMax
    if (typeof b === 'number' && !Number.isNaN(b)) {
      budgetMax.value = b
    } else if (typeof b === 'string' && b.trim()) {
      const n = Number.parseFloat(b)
      budgetMax.value = Number.isNaN(n) ? undefined : n
    } else {
      budgetMax.value = undefined
    }
    preferredMakes.value = typeof p.preferredMakes === 'string' ? p.preferredMakes : ''
  },
  { immediate: true },
)

const saving = ref(false)

async function onSave() {
  saving.value = true
  try {
    await saveProfile({
      notes: notes.value,
      budgetMax: budgetMax.value,
      preferredMakes: preferredMakes.value.trim(),
    })
    toast.add({ title: 'Profile saved', color: 'success' })
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }; message?: string }
    toast.add({
      title: 'Could not save',
      description: err.data?.statusMessage || err.message || 'Try again.',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UPage>
    <UPageSection>
      <h1 class="text-2xl font-bold text-default">Buyer profile</h1>
      <p class="mt-1 text-muted max-w-2xl">
        Optional context we can use for recommendations and AI-assisted flows as those features
        expand.
      </p>

      <div v-if="status === 'pending'" class="flex justify-center py-16">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-muted" />
      </div>
      <UCard
        v-else
        class="card-base border-default mt-8 max-w-2xl"
        :ui="{ body: 'p-4 sm:p-6 space-y-4' }"
      >
        <UFormField
          label="Preferred makes (comma-separated)"
          hint="e.g. Boston Whaler, Grady-White"
        >
          <UInput v-model="preferredMakes" class="w-full" placeholder="Optional" />
        </UFormField>
        <UFormField label="Budget ceiling (USD)" hint="Rough max price for matching and tips.">
          <UInput v-model.number="budgetMax" type="number" class="w-full" placeholder="Optional" />
        </UFormField>
        <UFormField label="Notes" hint="How you use the boat, must-haves, timeline, etc.">
          <UTextarea v-model="notes" class="w-full min-h-32" autoresize />
        </UFormField>
        <div class="flex justify-end pt-2">
          <UButton
            label="Save profile"
            icon="i-lucide-save"
            color="primary"
            :loading="saving"
            @click="onSave"
          />
        </div>
      </UCard>
    </UPageSection>
  </UPage>
</template>

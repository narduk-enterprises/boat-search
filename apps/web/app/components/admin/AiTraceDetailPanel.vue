<script setup lang="ts">
import type { AiTraceEntry } from '~~/app/composables/useAdminAiTraces'

const props = defineProps<{
  trace: AiTraceEntry
}>()

const expandedSections = ref<Record<string, boolean>>({
  systemPrompt: false,
  userPrompt: false,
  rawResponse: false,
  parsedSummary: false,
  candidates: false,
})

function toggleSection(key: string) {
  expandedSections.value[key] = !expandedSections.value[key]
}

const statusColor = computed(() => {
  switch (props.trace.status) {
    case 'success':
      return 'success'
    case 'parse-failed':
      return 'warning'
    case 'request-failed':
      return 'error'
    default:
      return 'neutral'
  }
})

function formatTokens(tokens: number | null) {
  if (tokens == null) return '—'
  return tokens.toLocaleString()
}

function formatTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

const toast = useToast()

const parsedSummaryJson = computed(() =>
  props.trace.parsedSummary ? JSON.stringify(props.trace.parsedSummary, null, 2) : '',
)

const rawResponseSizeLabel = computed(() => {
  if (!props.trace.rawResponse) return ''
  return `${(props.trace.rawResponse.length / 1024).toFixed(1)} KB`
})

const formattedMaxTokens = computed(() => props.trace.maxTokens.toLocaleString())

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: `${label} copied`, color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', color: 'error' })
  }
}
</script>

<template>
  <div class="flex flex-col gap-6 p-1">
    <!-- Header -->
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <UBadge :color="statusColor" :label="trace.status" variant="subtle" />
        <span class="text-sm text-muted">Session #{{ trace.sessionId }}</span>
      </div>

      <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <span class="text-dimmed">User</span>
          <p class="font-medium text-default">{{ trace.userEmail }}</p>
        </div>
        <div>
          <span class="text-dimmed">Profile</span>
          <p class="font-medium text-default">{{ trace.buyerProfileName || '—' }}</p>
        </div>
        <div>
          <span class="text-dimmed">Attempted</span>
          <p class="text-default">{{ formatTimestamp(trace.attemptedAt) }}</p>
        </div>
        <div>
          <span class="text-dimmed">Session created</span>
          <p class="text-default">{{ formatTimestamp(trace.createdAt) }}</p>
        </div>
      </div>
    </div>

    <USeparator />

    <!-- Stats row -->
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div class="card-base rounded-xl border border-default p-3 text-center">
        <p class="text-2xl font-semibold text-default">{{ trace.model || '—' }}</p>
        <p class="text-xs text-dimmed">Model</p>
      </div>
      <div class="card-base rounded-xl border border-default p-3 text-center">
        <p class="text-2xl font-semibold text-default">{{ formatTokens(trace.tokensUsed) }}</p>
        <p class="text-xs text-dimmed">Tokens</p>
      </div>
      <div class="card-base rounded-xl border border-default p-3 text-center">
        <p class="text-2xl font-semibold text-default">{{ trace.candidateCount }}</p>
        <p class="text-xs text-dimmed">Candidates</p>
      </div>
      <div class="card-base rounded-xl border border-default p-3 text-center">
        <p class="text-2xl font-semibold text-default">{{ trace.recommendationCount }}</p>
        <p class="text-xs text-dimmed">Recommendations</p>
      </div>
    </div>

    <!-- Config -->
    <div class="grid grid-cols-3 gap-4 text-sm">
      <div>
        <span class="text-dimmed">Temperature</span>
        <p class="font-mono text-default">{{ trace.temperature }}</p>
      </div>
      <div>
        <span class="text-dimmed">Max tokens</span>
        <p class="font-mono text-default">{{ formattedMaxTokens }}</p>
      </div>
      <div>
        <span class="text-dimmed">Reasoning effort</span>
        <p class="font-mono text-default">{{ trace.reasoningEffort }}</p>
      </div>
    </div>

    <!-- Error message -->
    <div v-if="trace.errorMessage" class="rounded-xl border border-error/30 bg-error/5 p-4">
      <p class="mb-1 text-xs font-semibold text-error">Error</p>
      <p class="whitespace-pre-wrap font-mono text-sm text-error">{{ trace.errorMessage }}</p>
    </div>

    <!-- Relaxed constraints -->
    <div v-if="trace.relaxedConstraints.length > 0" class="space-y-2">
      <p class="text-xs font-semibold text-dimmed uppercase">Relaxed constraints</p>
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="constraint in trace.relaxedConstraints"
          :key="constraint"
          :label="constraint"
          color="warning"
          variant="subtle"
        />
      </div>
    </div>

    <USeparator />

    <!-- Collapsible sections -->
    <div class="space-y-3">
      <!-- System prompt -->
      <div class="overflow-hidden rounded-xl border border-default">
        <div
          class="flex cursor-pointer items-center justify-between px-4 py-3 transition-fast hover:bg-elevated"
          @click="toggleSection('systemPrompt')"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="
                expandedSections.systemPrompt ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
              "
              class="size-4 text-muted"
            />
            <span class="text-sm font-semibold text-default">System prompt</span>
          </div>
          <UButton
            icon="i-lucide-copy"
            size="xs"
            color="neutral"
            variant="ghost"
            @click.stop="copyToClipboard(trace.systemPrompt, 'System prompt')"
          />
        </div>
        <div v-if="expandedSections.systemPrompt" class="border-t border-default bg-muted p-4">
          <pre class="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs text-default">{{
            trace.systemPrompt
          }}</pre>
        </div>
      </div>

      <!-- User prompt -->
      <div class="overflow-hidden rounded-xl border border-default">
        <div
          class="flex cursor-pointer items-center justify-between px-4 py-3 transition-fast hover:bg-elevated"
          @click="toggleSection('userPrompt')"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="
                expandedSections.userPrompt ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
              "
              class="size-4 text-muted"
            />
            <span class="text-sm font-semibold text-default">User prompt</span>
          </div>
          <UButton
            icon="i-lucide-copy"
            size="xs"
            color="neutral"
            variant="ghost"
            @click.stop="copyToClipboard(trace.userPrompt, 'User prompt')"
          />
        </div>
        <div v-if="expandedSections.userPrompt" class="border-t border-default bg-muted p-4">
          <pre class="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs text-default">{{
            trace.userPrompt
          }}</pre>
        </div>
      </div>

      <!-- Raw response -->
      <div class="overflow-hidden rounded-xl border border-default">
        <div
          class="flex cursor-pointer items-center justify-between px-4 py-3 transition-fast hover:bg-elevated"
          @click="toggleSection('rawResponse')"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="
                expandedSections.rawResponse ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
              "
              class="size-4 text-muted"
            />
            <span class="text-sm font-semibold text-default">Raw response</span>
            <UBadge
              v-if="trace.rawResponse"
              :label="rawResponseSizeLabel"
              color="neutral"
              variant="subtle"
              size="xs"
            />
          </div>
          <UButton
            icon="i-lucide-copy"
            size="xs"
            color="neutral"
            variant="ghost"
            @click.stop="copyToClipboard(trace.rawResponse, 'Raw response')"
          />
        </div>
        <div v-if="expandedSections.rawResponse" class="border-t border-default bg-muted p-4">
          <pre class="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs text-default">{{
            trace.rawResponse || '(empty)'
          }}</pre>
        </div>
      </div>

      <!-- Parsed summary -->
      <div v-if="trace.parsedSummary" class="overflow-hidden rounded-xl border border-default">
        <div
          class="flex cursor-pointer items-center justify-between px-4 py-3 transition-fast hover:bg-elevated"
          @click="toggleSection('parsedSummary')"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="
                expandedSections.parsedSummary ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
              "
              class="size-4 text-muted"
            />
            <span class="text-sm font-semibold text-default">Parsed summary</span>
            <UBadge
              :label="trace.parsedSummary.generatedBy"
              color="primary"
              variant="subtle"
              size="xs"
            />
          </div>
          <UButton
            icon="i-lucide-copy"
            size="xs"
            color="neutral"
            variant="ghost"
            @click.stop="copyToClipboard(parsedSummaryJson, 'Parsed summary')"
          />
        </div>
        <div v-if="expandedSections.parsedSummary" class="border-t border-default bg-muted p-4">
          <pre class="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs text-default">{{
            parsedSummaryJson
          }}</pre>
        </div>
      </div>

      <!-- Candidate boat IDs -->
      <div class="overflow-hidden rounded-xl border border-default">
        <div
          class="flex cursor-pointer items-center justify-between px-4 py-3 transition-fast hover:bg-elevated"
          @click="toggleSection('candidates')"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="
                expandedSections.candidates ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
              "
              class="size-4 text-muted"
            />
            <span class="text-sm font-semibold text-default">Candidate boat IDs</span>
            <UBadge
              :label="String(trace.candidateBoatIds.length)"
              color="neutral"
              variant="subtle"
              size="xs"
            />
          </div>
        </div>
        <div v-if="expandedSections.candidates" class="border-t border-default bg-muted p-4">
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="boatId in trace.candidateBoatIds"
              :key="boatId"
              :label="`#${boatId}`"
              color="neutral"
              variant="outline"
              size="xs"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

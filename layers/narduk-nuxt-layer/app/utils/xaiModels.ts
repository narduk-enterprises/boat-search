export interface XaiModelCatalog {
  chatModels: string[]
  preferredChatModel: string | null
}

const PREFERRED_CHAT_MODELS = [
  'grok-4.20-0309-reasoning',
  'grok-4-1-fast-reasoning',
  'grok-4-fast-reasoning',
  'grok-4.20-0309-non-reasoning',
  'grok-4-1',
  'grok-4',
  'grok-3-mini',
]

export function pickPreferredModel(
  availableModels: string[],
  preferredModels: string[] = PREFERRED_CHAT_MODELS,
): string | null {
  for (const model of preferredModels) {
    if (availableModels.includes(model)) {
      return model
    }
  }

  return availableModels[0] ?? null
}

export function buildXaiModelCatalog(modelIds: string[]): XaiModelCatalog {
  const sorted = [...modelIds].sort()
  // Filter out image/video models — most text generation apps only use chat
  const chatModels = sorted.filter(
    (id) => !id.includes('imagine') && !id.includes('image') && !id.includes('video'),
  )

  return {
    chatModels,
    preferredChatModel: pickPreferredModel(chatModels, PREFERRED_CHAT_MODELS),
  }
}

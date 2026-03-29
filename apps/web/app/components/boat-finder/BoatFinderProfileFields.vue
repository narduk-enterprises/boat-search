<script setup lang="ts">
import type { BuyerAnswersDraft } from '~~/lib/boatFinder'
import {
  BOAT_FINDER_SECTIONS,
  getVisibleBoatFinderQuestions,
} from '~~/app/utils/boatFinderQuestions'

const answers = defineModel<BuyerAnswersDraft>({ required: true })

const editableSections = BOAT_FINDER_SECTIONS.filter((section) => section.id !== 'review') as Array<
  (typeof BOAT_FINDER_SECTIONS)[number] & {
    id: Exclude<(typeof BOAT_FINDER_SECTIONS)[number]['id'], 'review'>
  }
>
</script>

<template>
  <div class="space-y-8">
    <section
      v-for="section in editableSections"
      :key="section.id"
      class="space-y-4 border-b border-default pb-8 last:border-b-0 last:pb-0"
    >
      <div class="space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge :label="section.label" color="primary" variant="subtle" />
          <p class="text-sm text-muted">
            {{ section.description }}
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <BoatFinderQuestionField
          v-for="question in getVisibleBoatFinderQuestions(answers, section.id)"
          :key="question.id"
          v-model="answers"
          :question="question"
          :section="section.id"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

type WorkflowStatus = 'active' | 'complete' | 'upcoming' | 'ready'

const props = withDefaults(
  defineProps<{
    step: number
    title: string
    subtitle: string
    status: WorkflowStatus
    note?: string
    open?: boolean
    toggleable?: boolean
  }>(),
  {
    note: undefined,
    open: false,
    toggleable: true,
  },
)

const emit = defineEmits<{
  toggle: []
}>()

const statusLabel = computed(() => {
  switch (props.status) {
    case 'complete':
      return 'Done'
    case 'ready':
      return 'Ready'
    case 'active':
      return 'Do this now'
    default:
      return 'Coming up'
  }
})
</script>

<template>
  <section
    class="step-card"
    :class="[`step-card--${props.status}`, { 'step-card--open': props.open }]"
  >
    <div class="step-card__index">
      <span>{{ props.step }}</span>
    </div>

    <div class="step-card__content">
      <header class="step-card__header">
        <div class="step-card__copy">
          <div class="step-card__meta">
            <p class="step-card__eyebrow">
              Step {{ props.step }}
            </p>
            <span class="step-card__status">{{ statusLabel }}</span>
          </div>
          <h2>{{ props.title }}</h2>
          <p class="step-card__subtitle">
            {{ props.subtitle }}
          </p>
          <p
            v-if="props.note"
            class="step-card__note"
          >
            {{ props.note }}
          </p>
        </div>

        <div class="step-card__aside">
          <div
            v-if="props.open"
            class="step-card__actions"
          >
            <slot name="actions" />
          </div>

          <button
            v-if="props.toggleable"
            type="button"
            class="step-card__toggle"
            :aria-expanded="props.open"
            @click="emit('toggle')"
          >
            {{ props.open ? 'Collapse step' : 'Open step' }}
          </button>
        </div>
      </header>

      <div
        v-if="props.open"
        class="step-card__body"
      >
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
.step-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.85rem;
  padding: 0.85rem;
  border-radius: 1.1rem;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 16px 38px rgba(15, 23, 42, 0.06);
}

.step-card--open {
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.08);
}

.step-card__index {
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
  background: linear-gradient(135deg, rgba(125, 211, 252, 0.9), rgba(191, 219, 254, 0.95));
}

.step-card__content {
  display: grid;
  gap: 0.7rem;
}

.step-card__header {
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: flex-start;
}

.step-card__copy {
  min-width: 0;
  display: grid;
  gap: 0.3rem;
}

.step-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}

.step-card__eyebrow {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #0369a1;
}

.step-card h2 {
  margin: 0;
  font-size: 1rem;
  line-height: 1.2;
}

.step-card__subtitle,
.step-card__note {
  margin: 0;
  line-height: 1.45;
  color: #475569;
  font-size: 0.84rem;
}

.step-card__note {
  color: #0f172a;
  font-size: 0.8rem;
}

.step-card__aside {
  display: grid;
  gap: 0.45rem;
  justify-items: end;
  min-width: min(13rem, 100%);
}

.step-card__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.85rem;
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(241, 245, 249, 0.94);
  color: #334155;
}

.step-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.45rem;
}

.step-card__toggle {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 999px;
  background: white;
  color: #0f172a;
  font-weight: 600;
  padding: 0.5rem 0.85rem;
  cursor: pointer;
}

.step-card__body {
  display: grid;
  gap: 0.75rem;
}

.step-card--complete {
  border-color: rgba(16, 185, 129, 0.2);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(236, 253, 245, 0.74));
}

.step-card--complete .step-card__index {
  background: linear-gradient(135deg, rgba(110, 231, 183, 0.95), rgba(167, 243, 208, 0.92));
}

.step-card--complete .step-card__status {
  background: rgba(209, 250, 229, 0.92);
  color: #166534;
  border-color: rgba(16, 185, 129, 0.24);
}

.step-card--active {
  border-color: rgba(2, 132, 199, 0.24);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(239, 246, 255, 0.92));
}

.step-card--active .step-card__status {
  background: rgba(224, 242, 254, 0.92);
  color: #075985;
  border-color: rgba(2, 132, 199, 0.2);
}

.step-card--ready {
  border-color: rgba(245, 158, 11, 0.22);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 247, 237, 0.92));
}

.step-card--ready .step-card__status {
  background: rgba(254, 243, 199, 0.96);
  color: #92400e;
  border-color: rgba(245, 158, 11, 0.2);
}

.step-card--upcoming {
  opacity: 0.9;
}

@media (max-width: 720px) {
  .step-card {
    grid-template-columns: 1fr;
  }

  .step-card__header {
    flex-direction: column;
  }

  .step-card__aside {
    min-width: 0;
    justify-items: start;
    width: 100%;
  }

  .step-card__actions {
    justify-content: flex-start;
  }
}
</style>

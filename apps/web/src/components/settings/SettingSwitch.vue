<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  modelValue: boolean
  label: string
  description?: string
  disabled?: boolean
  class?: HTMLAttributes['class']
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

function toggle(): void {
  if (props.disabled) return
  emits('update:modelValue', !props.modelValue)
}
</script>

<template>
  <label
    :class="
      cn(
        'flex items-start justify-between gap-4 rounded-2xl bg-muted/50 px-4 py-3.5 transition-design',
        props.disabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:bg-accent/40',
        props.class,
      )
    "
  >
    <div class="min-w-0 flex-1 space-y-1">
      <p class="text-sm font-medium leading-snug">{{ props.label }}</p>
      <p v-if="props.description" class="text-xs leading-relaxed text-muted-foreground">
        {{ props.description }}
      </p>
    </div>

    <button
      type="button"
      role="switch"
      :aria-checked="props.modelValue"
      :disabled="props.disabled"
      :class="
        cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          props.modelValue ? 'bg-emerald-500' : 'bg-muted-foreground/30',
        )
      "
      @click="toggle"
      @keydown.space.prevent="toggle"
    >
      <span
        :class="
          cn(
            'pointer-events-none inline-block size-4 transform rounded-full bg-background shadow-lg ring-0 transition-transform',
            props.modelValue ? 'translate-x-4' : 'translate-x-0',
          )
        "
      />
    </button>
  </label>
</template>

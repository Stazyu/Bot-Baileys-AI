<script setup lang="ts">
const bars = [
  { label: 'CPU', value: 34 },
  { label: 'Memory', value: 58 },
  { label: 'Queue', value: 22 },
]

const foot = [
  { value: '99.9%', label: 'Uptime' },
  { value: '1.8s', label: 'Reply' },
  { value: '12', label: 'Queued' },
]
</script>

<template>
  <section class="rounded-[24px] bg-card p-6 shadow-soft">
    <p class="text-eyebrow text-muted-foreground">System</p>
    <div class="mt-1 flex items-center justify-between">
      <h3 class="text-xl font-bold tracking-tight">Health</h3>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
        <span class="size-1.5 rounded-full bg-emerald-500" />
        All good
      </span>
    </div>
    <div class="mt-5 space-y-4">
      <div v-for="bar in bars" :key="bar.label">
        <div class="flex items-center justify-between text-xs">
          <span class="font-semibold text-muted-foreground">{{ bar.label }}</span>
          <span class="font-bold tabular-nums">{{ bar.value }}%</span>
        </div>
        <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
            :style="{ width: `${bar.value}%` }"
          />
        </div>
      </div>
    </div>
    <div class="mt-6 grid grid-cols-3 gap-2 text-center">
      <div v-for="item in foot" :key="item.label">
        <p class="text-base font-bold tabular-nums">{{ item.value }}</p>
        <p class="mt-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{{ item.label }}</p>
      </div>
    </div>
  </section>
</template>

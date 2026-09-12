<script setup lang="ts">
import { computed } from 'vue'

const incoming = [42, 38, 30, 24, 18, 22, 35, 58, 84, 112, 140, 165, 178, 160, 148, 155, 172, 190, 205, 188, 160, 120, 84, 60]
const outgoing = [12, 10, 8, 6, 5, 7, 12, 20, 30, 38, 46, 52, 55, 50, 47, 49, 54, 60, 64, 58, 48, 36, 24, 16]

const W = 600
const H = 180
const PAD = 4

const max = Math.max(...incoming, ...outgoing)

const points = (data: number[]): string =>
  data
    .map((v, i) => `${(PAD + (i * (W - PAD * 2)) / (data.length - 1)).toFixed(1)},${(H - PAD - (v / max) * (H - PAD * 2 - 14)).toFixed(1)}`)
    .join(' L')

const lineIn = computed(() => `M${points(incoming)}`)
const lineOut = computed(() => `M${points(outgoing)}`)
const areaIn = computed(() => `${lineIn.value} L${W - PAD},${H} L${PAD},${H} Z`)

const totalIn = incoming.reduce((a, b) => a + b, 0)
const totalOut = outgoing.reduce((a, b) => a + b, 0)

const ticks = ['00', '04', '08', '12', '16', '20', '24']
</script>

<template>
  <section class="rounded-[24px] bg-card p-6 shadow-soft">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-eyebrow text-muted-foreground">Traffic</p>
        <h3 class="mt-1 text-xl font-bold tracking-tight">Messages · last 24h</h3>
      </div>
      <div class="flex items-center gap-2 text-[11px] font-semibold">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-600 dark:text-emerald-300">
          <span class="size-1.5 rounded-full bg-emerald-500" />
          In · {{ totalIn.toLocaleString() }}
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-sky-600 dark:text-sky-300">
          <span class="size-1.5 rounded-full bg-sky-500" />
          Out · {{ totalOut.toLocaleString() }}
        </span>
      </div>
    </div>

    <svg viewBox="0 0 600 180" preserveAspectRatio="none" class="mt-4 h-44 w-full" role="img" aria-label="Message volume over the last 24 hours">
      <defs>
        <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path :d="areaIn" fill="url(#trafficFill)" />
      <path :d="lineOut" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="stroke-sky-500/70" stroke-dasharray="1 5" />
      <path :d="lineIn" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="stroke-emerald-500" />
    </svg>
    <div class="mt-1 flex justify-between text-[10px] font-semibold tracking-wider text-muted-foreground tabular-nums">
      <span v-for="t in ticks" :key="t">{{ t }}</span>
    </div>
  </section>
</template>

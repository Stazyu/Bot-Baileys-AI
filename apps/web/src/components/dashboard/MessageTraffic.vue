<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ApiError, api } from '@/lib/api'
import type { TrafficData } from '@/lib/api-types'
import { usePoll } from '@/composables/usePoll'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'
import { cn } from '@/lib/utils'

const range = ref<'24h' | '7d'>('24h')
const data = ref<TrafficData | null>(null)
const loading = ref(true)
const error = ref('')

const W = 600
const H = 180
const PAD = 4

async function load(silent = false): Promise<void> {
  if (!silent) loading.value = true
  try {
    data.value = await api<TrafficData>('/api/dashboard/traffic', { query: { range: range.value } })
    error.value = ''
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Failed to load traffic'
  } finally {
    loading.value = false
  }
}

function retry(): void {
  void load()
}

onMounted(() => {
  void load()
  usePoll(() => void load(true), 60_000)
})
watch(range, () => void load())

const max = computed(() => {
  const d = data.value
  if (!d) return 1
  return Math.max(...d.incoming, ...d.outgoing, 1)
})

const points = (series: number[]): string =>
  series
    .map((v, i) => `${(PAD + (i * (W - PAD * 2)) / Math.max(series.length - 1, 1)).toFixed(1)},${(H - PAD - (v / max.value) * (H - PAD * 2 - 14)).toFixed(1)}`)
    .join(' L')

const lineIn = computed(() => (data.value && data.value.incoming.length ? `M${points(data.value.incoming)}` : ''))
const lineOut = computed(() => (data.value && data.value.outgoing.length ? `M${points(data.value.outgoing)}` : ''))
const areaIn = computed(() => (lineIn.value ? `${lineIn.value} L${W - PAD},${H} L${PAD},${H} Z` : ''))

const ticks = computed(() => {
  const labels = data.value?.labels ?? []
  if (labels.length <= 7) return labels
  const step = Math.ceil(labels.length / 7)
  return labels.filter((_, i) => i % step === 0)
})
</script>

<template>
  <section class="rounded-[24px] bg-card p-6 shadow-soft">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-eyebrow text-muted-foreground">Traffic</p>
        <h3 class="mt-1 text-xl font-bold tracking-tight">Messages · {{ range === '24h' ? 'last 24h' : 'last 7d' }}</h3>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex rounded-full bg-muted p-1 text-[11px] font-semibold">
          <button
            v-for="r in (['24h', '7d'] as const)"
            :key="r"
            @click="range = r"
            :aria-pressed="range === r"
            :class="cn('rounded-full px-3 py-1 transition-design', range === r ? 'bg-card shadow-soft' : 'text-muted-foreground')"
          >
            {{ r }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="mt-4">
      <Skeleton class="h-44 w-full rounded-2xl" />
    </div>
    <div v-else-if="error" class="mt-4 rounded-2xl bg-muted/50 px-4 py-10 text-center">
      <p class="text-sm font-semibold">Couldn't load traffic</p>
      <p class="mt-1 text-xs text-muted-foreground">{{ error }}</p>
      <button @click="retry" class="mt-3 rounded-full bg-muted px-4 py-1.5 text-xs font-semibold transition-design hover:text-foreground">
        Retry
      </button>
    </div>
    <template v-else-if="data">
      <div class="mt-3 flex items-center gap-2 text-[11px] font-semibold">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-600 dark:text-emerald-300">
          <span class="size-1.5 rounded-full bg-emerald-500" />
          In · {{ data.totalIn.toLocaleString() }}
        </span>
        <span class="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-sky-600 dark:text-sky-300">
          <span class="size-1.5 rounded-full bg-sky-500" />
          Out · {{ data.totalOut.toLocaleString() }}
        </span>
      </div>

      <svg viewBox="0 0 600 180" preserveAspectRatio="none" class="mt-4 h-44 w-full" role="img" aria-label="Message volume">
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
    </template>
  </section>
</template>

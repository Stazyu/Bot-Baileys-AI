<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError, api } from '@/lib/api'
import type { HealthSnapshot } from '@/lib/api-types'
import { useSse } from '@/composables/useSse'
import { formatUptime } from '@/lib/format'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'
import { cn } from '@/lib/utils'

const snap = ref<HealthSnapshot | null>(null)
const loading = ref(true)
const error = ref('')
const sse = useSse<HealthSnapshot>('/api/health/stream')

async function load(): Promise<void> {
  try {
    snap.value = await api<HealthSnapshot>('/api/health')
    error.value = ''
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Health unavailable'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  sse.onItem((item, event) => {
    if (event === 'health') {
      snap.value = item
      error.value = ''
      loading.value = false
    }
  })
})

const bars = computed(() => {
  const s = snap.value
  if (!s) return []
  return [
    { label: 'CPU', value: s.cpuPct },
    { label: 'Memory', value: s.memPct },
    { label: 'Queue', value: Math.min(100, s.queueDepth) },
  ]
})

const foot = computed(() => {
  const s = snap.value
  if (!s) return []
  return [
    { value: formatUptime(s.uptimeSec), label: 'Uptime' },
    { value: s.replyP50Ms === null ? '—' : `${s.replyP50Ms}ms`, label: 'Reply p50' },
    { value: String(s.queueDepth), label: 'Queued' },
  ]
})

const live = computed(() => sse.status.value === 'live')
</script>

<template>
  <section class="rounded-[24px] bg-card p-6 shadow-soft">
    <p class="text-eyebrow text-muted-foreground">System</p>
    <div class="mt-1 flex items-center justify-between">
      <h3 class="text-xl font-bold tracking-tight">Health</h3>
      <span
        :class="cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold',
          snap?.status === 'degraded' || error
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
        )"
      >
        <span :class="cn('size-1.5 rounded-full', live ? 'bg-emerald-500' : 'bg-muted-foreground', snap?.status === 'degraded' && 'bg-amber-500')" />
        {{ error ? 'Offline' : snap?.status === 'degraded' ? 'Degraded' : live ? 'Live' : 'Connecting…' }}
      </span>
    </div>
    <div v-if="loading && !snap" class="mt-5 space-y-4">
      <Skeleton v-for="i in 3" :key="i" class="h-9 w-full rounded-xl" />
    </div>
    <template v-else-if="snap">
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
      <p class="mt-4 text-center text-[11px] tabular-nums text-muted-foreground">
        {{ snap.sessionsConnected }}/{{ snap.sessionsTotal }} sessions · {{ snap.memUsedMB }} MB heap
      </p>
    </template>
  </section>
</template>

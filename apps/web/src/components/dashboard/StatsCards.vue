<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowDownRight, ArrowUpRight, Bot, MessageSquareText, Phone, Users, type LucideIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { ApiError, api } from '@/lib/api'
import type { DashboardStats } from '@/lib/api-types'
import { usePoll } from '@/composables/usePoll'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'

interface StatCardData {
  label: string
  value: string | number
  icon: LucideIcon
  change: string
  changeType: 'up' | 'down' | 'neutral'
  spark: number[]
}

const data = ref<DashboardStats | null>(null)
const loading = ref(true)
const error = ref('')

async function load(silent = false): Promise<void> {
  if (!silent) loading.value = true
  try {
    data.value = await api<DashboardStats>('/api/dashboard/stats')
    error.value = ''
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Failed to load stats'
  } finally {
    loading.value = false
  }
}

function trend(spark: number[]): 'up' | 'down' | 'neutral' {
  if (spark.length < 2) return 'neutral'
  const last = spark[spark.length - 1] ?? 0
  const prev = spark[spark.length - 2] ?? 0
  return last > prev ? 'up' : last < prev ? 'down' : 'neutral'
}

function vsYesterday(spark: number[]): string {
  if (spark.length < 2) return 'no history yet'
  const delta = (spark[spark.length - 1] ?? 0) - (spark[spark.length - 2] ?? 0)
  if (delta === 0) return 'same as yesterday'
  return `${delta > 0 ? '+' : ''}${delta} vs yesterday`
}

const cards = computed<StatCardData[]>(() => {
  const s = data.value
  if (!s) return []
  return [
    {
      label: 'Active Sessions',
      value: s.activeSessions,
      icon: Phone,
      change: `${s.activeSessions} online now`,
      changeType: s.activeSessions > 0 ? 'up' : 'neutral',
      spark: s.sparks.sessions,
    },
    {
      label: 'Registered Users',
      value: s.registeredUsers.toLocaleString(),
      icon: Users,
      change: vsYesterday(s.sparks.users),
      changeType: trend(s.sparks.users),
      spark: s.sparks.users,
    },
    {
      label: 'Messages Today',
      value: s.messagesToday.toLocaleString(),
      icon: MessageSquareText,
      change: vsYesterday(s.sparks.messages),
      changeType: trend(s.sparks.messages),
      spark: s.sparks.messages,
    },
    {
      label: 'AI Calls Today',
      value: s.aiCallsToday.toLocaleString(),
      icon: Bot,
      change: vsYesterday(s.sparks.ai),
      changeType: trend(s.sparks.ai),
      spark: s.sparks.ai,
    },
  ]
})

function retry(): void {
  void load()
}

onMounted(() => {
  void load()
  usePoll(() => void load(true), 30_000)
})

const sparkLine = (spark: number[]): string => {
  if (spark.length < 2) return ''
  const w = 120
  const h = 36
  const max = Math.max(...spark, 1)
  const pts = spark.map(
    (v, i) => `${((i * w) / (spark.length - 1)).toFixed(1)},${(h - 3 - (v / max) * (h - 8)).toFixed(1)}`,
  )
  return `M${pts.join(' L')}`
}

const sparkArea = (spark: number[]): string => {
  const line = sparkLine(spark)
  return line ? `${line} L120,36 L0,36 Z` : ''
}
</script>

<template>
  <div v-if="loading" class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <Skeleton v-for="i in 4" :key="i" class="h-[188px] rounded-[24px]" />
  </div>
  <div v-else-if="error" class="rounded-[24px] bg-card p-6 text-center shadow-soft">
    <p class="text-sm font-semibold">Couldn't load stats</p>
    <p class="mt-1 text-xs text-muted-foreground">{{ error }}</p>
    <button @click="retry" class="mt-4 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
      Retry
    </button>
  </div>
  <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <article
      v-for="(stat, i) in cards"
      :key="stat.label"
      :style="{ animationDelay: `${i * 70}ms` }"
      class="animate-fade-up card-lift group rounded-[24px] bg-card p-5 shadow-soft hover:-translate-y-1 hover:shadow-lift"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-eyebrow text-muted-foreground">{{ stat.label }}</p>
          <p class="mt-1.5 text-[32px] leading-none font-bold tracking-tight text-foreground">{{ stat.value }}</p>
        </div>
        <span class="flex size-11 items-center justify-center rounded-full bg-primary/[0.07] text-primary transition-design group-hover:scale-105">
          <component :is="stat.icon" class="size-5" />
        </span>
      </div>
      <!-- sparkline -->
      <svg viewBox="0 0 120 36" preserveAspectRatio="none" class="mt-4 h-10 w-full" aria-hidden="true">
        <path
          :d="sparkArea(stat.spark)"
          :class="stat.changeType === 'down' ? 'fill-rose-500/10' : 'fill-emerald-500/10'"
        />
        <path
          :d="sparkLine(stat.spark)"
          fill="none"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          :class="stat.changeType === 'down' ? 'stroke-rose-500' : 'stroke-emerald-500'"
        />
      </svg>
      <div class="mt-3">
        <span
          :class="cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
            stat.changeType === 'up' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
            stat.changeType === 'down' && 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
            stat.changeType === 'neutral' && 'bg-muted text-muted-foreground',
          )"
        >
          <component
            :is="stat.changeType === 'up' ? ArrowUpRight : ArrowDownRight"
            v-if="stat.changeType !== 'neutral'"
            class="size-3.5"
          />
          {{ stat.change }}
        </span>
      </div>
    </article>
  </div>
</template>

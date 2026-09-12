<script setup lang="ts">
import { ArrowDownRight, ArrowUpRight, Bot, MessageSquareText, Phone, Users, type LucideIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'

interface StatCardData {
  label: string
  value: string | number
  icon: LucideIcon
  change: string
  changeType: 'up' | 'down' | 'neutral'
  spark: number[]
}

const stats: StatCardData[] = [
  { label: 'Active Sessions', value: 3, icon: Phone, change: '+1 this week', changeType: 'up', spark: [30, 45, 38, 55, 62, 58, 74] },
  { label: 'Registered Users', value: 247, icon: Users, change: '+12 today', changeType: 'up', spark: [20, 32, 28, 44, 40, 56, 66] },
  { label: 'Messages Processed', value: '8,421', icon: MessageSquareText, change: '+342 today', changeType: 'up', spark: [42, 50, 46, 60, 72, 68, 84] },
  { label: 'AI Calls Today', value: 156, icon: Bot, change: '-8% vs yesterday', changeType: 'down', spark: [70, 62, 66, 54, 58, 46, 40] },
]

const sparkLine = (spark: number[]): string => {
  const w = 120
  const h = 36
  const pts = spark.map(
    (v, i) => `${((i * w) / (spark.length - 1)).toFixed(1)},${(h - 3 - (v / 100) * (h - 8)).toFixed(1)}`,
  )
  return `M${pts.join(' L')}`
}

const sparkArea = (spark: number[]): string => `${sparkLine(spark)} L120,36 L0,36 Z`
</script>

<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <article
      v-for="(stat, i) in stats"
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

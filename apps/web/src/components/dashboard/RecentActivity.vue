<script setup lang="ts">
import { AlertTriangle, Command, Download, MessageCircle, Sparkles, Wifi } from '@lucide/vue'
import type { LucideIcon } from '@lucide/vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface Activity {
  id: string
  type: 'message' | 'command' | 'ai' | 'session' | 'download' | 'error'
  session: string
  detail: string
  time: string
}

const activities: Activity[] = [
  { id: 'a1', type: 'message', session: 'Wahyu', detail: 'Incoming message from “Keluarga Bahagia”', time: '2m' },
  { id: 'a2', type: 'command', session: 'Bot Support', detail: '!ping executed', time: '5m' },
  { id: 'a3', type: 'ai', session: 'Bot Support', detail: 'AI replied in “Tech Discussion”', time: '8m' },
  { id: 'a4', type: 'download', session: 'Wahyu', detail: 'Instagram reel saved', time: '12m' },
  { id: 'a5', type: 'session', session: 'Shop Bot', detail: 'Disconnected — reconnecting…', time: '18m' },
  { id: 'a6', type: 'error', session: 'Shop Bot', detail: 'Connection timeout after 30s', time: '19m' },
  { id: 'a7', type: 'command', session: 'Wahyu', detail: '!sticker executed', time: '22m' },
  { id: 'a8', type: 'ai', session: 'Wahyu', detail: 'AI mode chat — 4 messages', time: '25m' },
  { id: 'a9', type: 'message', session: 'Bot Support', detail: 'Message from “Project Alpha”', time: '30m' },
  { id: 'a10', type: 'download', session: 'Bot Support', detail: 'YouTube audio (mp3) saved', time: '34m' },
]

const typeMeta: Record<Activity['type'], { icon: LucideIcon; bubble: string }> = {
  message: { icon: MessageCircle, bubble: 'bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  command: { icon: Command, bubble: 'bg-muted text-muted-foreground' },
  ai: { icon: Sparkles, bubble: 'bg-violet-500/10 text-violet-600 dark:text-violet-300' },
  session: { icon: Wifi, bubble: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  download: { icon: Download, bubble: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' },
  error: { icon: AlertTriangle, bubble: 'bg-rose-500/10 text-rose-600 dark:text-rose-300' },
}
</script>

<template>
  <section class="flex flex-col rounded-[24px] bg-card px-3 py-6 shadow-soft sm:px-4">
    <header class="flex items-center justify-between px-3 pb-1 sm:px-4">
      <div>
        <p class="text-eyebrow text-muted-foreground">Pulse</p>
        <h3 class="mt-1 text-xl font-bold tracking-tight">Recent Activity</h3>
      </div>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
        <span class="size-1.5 rounded-full bg-emerald-500" />
        Live
      </span>
    </header>
    <ScrollArea class="max-h-[380px]">
      <ol class="px-1 py-2">
        <li v-for="activity in activities" :key="activity.id" class="flex gap-3.5 rounded-2xl px-3 py-2.5 sm:px-4">
          <span :class="cn('flex size-9 shrink-0 items-center justify-center rounded-full', typeMeta[activity.type].bubble)">
            <component :is="typeMeta[activity.type].icon" class="size-4" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-medium text-foreground/90">{{ activity.detail }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              <span class="font-semibold text-foreground/70">{{ activity.session }}</span>
              · {{ activity.time }} ago
            </p>
          </div>
        </li>
      </ol>
    </ScrollArea>
  </section>
</template>

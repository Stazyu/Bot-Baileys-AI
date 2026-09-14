<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { AlertTriangle, Command, Download, MessageCircle, Sparkles, Wifi, type LucideIcon } from '@lucide/vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { ApiError, api } from '@/lib/api'
import type { ActivityItem, ActivityPage, ActivityType } from '@/lib/api-types'
import { shortJid, timeAgo } from '@/lib/format'
import { useSse } from '@/composables/useSse'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'

const items = ref<ActivityItem[]>([])
const cursor = ref<string | null>(null)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')
const sse = useSse<ActivityItem>('/api/activity/stream')

async function loadInitial(): Promise<void> {
  try {
    const page = await api<ActivityPage>('/api/activity', { query: { limit: 20 } })
    items.value = page.items
    cursor.value = page.nextCursor
    error.value = ''
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Failed to load activity'
  } finally {
    loading.value = false
  }
}

async function loadMore(): Promise<void> {
  if (!cursor.value || loadingMore.value) return
  loadingMore.value = true
  try {
    const page = await api<ActivityPage>('/api/activity', { query: { limit: 20, cursor: cursor.value } })
    const seen = new Set(items.value.map((i) => i.id))
    for (const item of page.items) {
      if (!seen.has(item.id)) items.value.push(item)
    }
    cursor.value = page.nextCursor
  } catch {
    // Gagal load more — cursor tetap, user bisa coba lagi.
  } finally {
    loadingMore.value = false
  }
}

function retry(): void {
  loading.value = true
  void loadInitial()
}

onMounted(() => {
  void loadInitial()
  sse.onItem((item, event) => {
    if (event !== 'activity') return
    if (items.value.some((i) => i.id === item.id)) return
    items.value.unshift(item)
    if (items.value.length > 60) items.value.pop()
  })
})

function sessionLabel(item: ActivityItem): string {
  if (item.session) return item.session
  if (item.sessionId) return shortJid(item.sessionId)
  return 'system'
}

const typeMeta: Record<ActivityType, { icon: LucideIcon; bubble: string }> = {
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
      <span
        :class="cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold',
          sse.status.value === 'live'
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
            : 'bg-muted text-muted-foreground',
        )"
      >
        <span :class="cn('size-1.5 rounded-full', sse.status.value === 'live' ? 'bg-emerald-500' : 'bg-muted-foreground')" />
        {{ sse.status.value === 'live' ? 'Live' : sse.status.value === 'reconnecting' ? 'Retry…' : 'Polling' }}
      </span>
    </header>
    <div v-if="loading" class="space-y-2 px-3 py-2 sm:px-4">
      <Skeleton v-for="i in 5" :key="i" class="h-14 w-full rounded-2xl" />
    </div>
    <div v-else-if="error && items.length === 0" class="px-6 py-10 text-center">
      <p class="text-sm font-semibold">Couldn't load activity</p>
      <p class="mt-1 text-xs text-muted-foreground">{{ error }}</p>
      <button @click="retry" class="mt-4 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
        Retry
      </button>
    </div>
    <ScrollArea v-else class="max-h-[380px]">
      <ol class="px-1 py-2">
        <li v-for="activity in items" :key="activity.id" class="flex gap-3.5 rounded-2xl px-3 py-2.5 sm:px-4">
          <span :class="cn('flex size-9 shrink-0 items-center justify-center rounded-full', typeMeta[activity.type]?.bubble ?? typeMeta.message.bubble)">
            <component :is="(typeMeta[activity.type]?.icon ?? typeMeta.message.icon)" class="size-4" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-medium text-foreground/90">{{ activity.detail }}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              <span class="font-semibold text-foreground/70">{{ sessionLabel(activity) }}</span>
              · {{ timeAgo(activity.createdAt) }}
            </p>
          </div>
        </li>
      </ol>
      <div v-if="cursor" class="px-4 pb-2 text-center">
        <button
          @click="loadMore"
          :disabled="loadingMore"
          class="rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground disabled:opacity-50"
        >
          {{ loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </ScrollArea>
  </section>
</template>

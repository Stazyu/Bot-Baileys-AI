<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Search, Command, Clock, CheckCircle2, XCircle, Terminal, Wrench, Star, TriangleAlert, type LucideIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { ApiError, api } from '@/lib/api'
import type { CommandItem, CommandsPage, RuntimeLogItem, RuntimeLogLevel, RuntimeLogsResponse, ToolCallItem, ToolsPage } from '@/lib/api-types'
import { formatClock, formatResponseTime, shortJid, timeAgo } from '@/lib/format'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
import { usePoll } from '@/composables/usePoll'

// ── State ──────────────────────────────────────────────────────────
const items = ref<CommandItem[]>([])
const summary = ref({ total: 0, success: 0, error: 0, avgLatencyMs: 0, top: [] as { command: string; count: number }[] })
const page = ref(1)
const pageSize = 30
const hasMore = ref(false)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')

const searchQuery = ref('')
const statusFilter = ref<'all' | 'success' | 'error'>('all')

async function loadPage(reset: boolean): Promise<void> {
  if (reset) {
    page.value = 1
    loading.value = true
  } else {
    loadingMore.value = true
  }
  error.value = ''
  try {
    const res = await api<CommandsPage>('/api/commands', {
      query: {
        success: statusFilter.value === 'all' ? undefined : statusFilter.value === 'success',
        page: page.value,
        pageSize,
      },
    })
    summary.value = res.summary
    const seen = new Set((reset ? [] : items.value).map((i) => i.id))
    const fresh = res.items.filter((i) => !seen.has(i.id))
    items.value = reset ? res.items : [...items.value, ...fresh]
    hasMore.value = res.page * res.pageSize < res.total
  } catch (e) {
    if (reset) error.value = e instanceof ApiError ? e.message : 'Failed to load commands'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMore(): void {
  if (!hasMore.value || loadingMore.value) return
  page.value += 1
  void loadPage(false)
}

function retry(): void {
  void loadPage(true)
}

onMounted(() => {
  void loadPage(true)
  void loadToolsPage(true)
  void loadLogs()
  usePoll(() => {
    if (tab.value === 'logs') void loadLogs()
  }, 3000, false)
})

let statusTimer: ReturnType<typeof setTimeout> | null = null
watch(statusFilter, () => {
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    if (tab.value === 'commands') void loadPage(true)
    else if (tab.value === 'tools') void loadToolsPage(true)
  }, 150)
})

// ── Derived ────────────────────────────────────────────────────────
const successRate = computed(() =>
  summary.value.total > 0 ? Math.round((summary.value.success / summary.value.total) * 100) : 0,
)

const statCards = computed<{ label: string; value: string | number; icon: LucideIcon; change: string; tone: 'up' | 'down' | 'neutral' }[]>(() => {
  const topCmd = summary.value.top[0]
  return [
    { label: 'Total Commands', value: summary.value.total, icon: Command, change: `${summary.value.success} succeeded`, tone: 'up' },
    { label: 'Success Rate', value: `${successRate.value}%`, icon: CheckCircle2, change: `${summary.value.error} failed`, tone: summary.value.error > 3 ? 'down' : 'up' },
    { label: 'Avg Response', value: formatResponseTime(summary.value.avgLatencyMs), icon: Clock, change: `across ${summary.value.total} executions`, tone: 'neutral' },
    { label: 'Errors', value: summary.value.error, icon: XCircle, change: `${summary.value.error} need attention`, tone: summary.value.error > 0 ? 'down' : 'up' },
    { label: 'Top Command', value: topCmd ? `!${topCmd.command}` : '—', icon: Star, change: topCmd ? `${topCmd.count} calls` : 'no calls yet', tone: 'neutral' },
  ]
})

const filteredLogs = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return items.value
  return items.value.filter(
    (l) =>
      l.command.toLowerCase().includes(q) ||
      (l.args ?? '').toLowerCase().includes(q) ||
      (l.userId ?? '').toLowerCase().includes(q) ||
      (l.sessionId ?? '').toLowerCase().includes(q),
  )
})

// ── Helpers ────────────────────────────────────────────────────────
const responseTimeColor = (ms: number | null): string => {
  if (ms === null) return 'text-muted-foreground'
  if (ms < 200) return 'text-emerald-500'
  if (ms < 2000) return 'text-foreground'
  if (ms < 5000) return 'text-amber-500'
  return 'text-rose-500'
}

const clearFilters = (): void => {
  searchQuery.value = ''
  statusFilter.value = 'all'
  levelFilter.value = 'all'
}
// ── Tool calls tab (sumber terpisah — statistik tidak dicampur) ─────
const tabs = [
  { key: 'commands', label: 'Commands' },
  { key: 'tools', label: 'Tool calls' },
  { key: 'logs', label: 'Logs' },
] as const
const tab = ref<'commands' | 'tools' | 'logs'>('commands')

const toolItems = ref<ToolCallItem[]>([])
const toolSummary = ref({ total: 0, success: 0, error: 0, avgLatencyMs: 0, top: [] as { tool: string; count: number }[] })
const toolPage = ref(1)
const toolHasMore = ref(false)
const toolLoading = ref(false)
const toolLoadingMore = ref(false)
const toolError = ref('')
const toolsLoaded = ref(false)

async function loadToolsPage(reset: boolean): Promise<void> {
  if (reset) {
    toolPage.value = 1
    toolLoading.value = true
  } else {
    toolLoadingMore.value = true
  }
  toolError.value = ''
  try {
    const res = await api<ToolsPage>('/api/tools', {
      query: {
        success: statusFilter.value === 'all' ? undefined : statusFilter.value === 'success',
        page: toolPage.value,
        pageSize,
      },
    })
    toolSummary.value = res.summary
    const seen = new Set((reset ? [] : toolItems.value).map((i) => i.id))
    const fresh = res.items.filter((i) => !seen.has(i.id))
    toolItems.value = reset ? res.items : [...toolItems.value, ...fresh]
    toolHasMore.value = res.page * res.pageSize < res.total
    toolsLoaded.value = true
  } catch (e) {
    if (reset) toolError.value = e instanceof ApiError ? e.message : 'Failed to load tool calls'
  } finally {
    toolLoading.value = false
    toolLoadingMore.value = false
  }
}

function loadToolsMore(): void {
  if (!toolHasMore.value || toolLoadingMore.value) return
  toolPage.value += 1
  void loadToolsPage(false)
}

function retryTools(): void {
  void loadToolsPage(true)
}

const toolSuccessRate = computed(() =>
  toolSummary.value.total > 0 ? Math.round((toolSummary.value.success / toolSummary.value.total) * 100) : 0,
)

const toolStatCards = computed<{ label: string; value: string | number; icon: LucideIcon; change: string; tone: 'up' | 'down' | 'neutral' }[]>(() => {
  const top = toolSummary.value.top[0]
  return [
    { label: 'Total Tool Calls', value: toolSummary.value.total, icon: Wrench, change: `${toolSummary.value.success} succeeded`, tone: 'up' },
    { label: 'Success Rate', value: `${toolSuccessRate.value}%`, icon: CheckCircle2, change: `${toolSummary.value.error} failed`, tone: toolSummary.value.error > 3 ? 'down' : 'up' },
    { label: 'Avg Response', value: formatResponseTime(toolSummary.value.avgLatencyMs), icon: Clock, change: `across ${toolSummary.value.total} executions`, tone: 'neutral' },
    { label: 'Errors', value: toolSummary.value.error, icon: XCircle, change: `${toolSummary.value.error} need attention`, tone: toolSummary.value.error > 0 ? 'down' : 'up' },
    { label: 'Top Tool', value: top?.tool ?? '—', icon: Terminal, change: top ? `${top.count} calls` : 'no calls yet', tone: 'neutral' },
  ]
})
const visibleStatCards = computed(() => (tab.value === 'commands' ? statCards.value : tab.value === 'tools' ? toolStatCards.value : logsStatCards.value))

const filteredTools = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return toolItems.value
  return toolItems.value.filter(
    (l) =>
      l.tool.toLowerCase().includes(q) ||
      (l.args ?? '').toLowerCase().includes(q) ||
      (l.userId ?? '').toLowerCase().includes(q) ||
      (l.sessionId ?? '').toLowerCase().includes(q),
  )
})

// ── Logs tab (PrintLog versi web — 500 baris runtime terakhir, live tail) ──
const logLevels = ['all', 'debug', 'info', 'warn', 'error'] as const
const levelFilter = ref<(typeof logLevels)[number]>('all')
const logItems = ref<RuntimeLogItem[]>([])
const logLoading = ref(false)
const logError = ref('')
const logsLoaded = ref(false)
const logPanel = ref<{ $el: HTMLElement } | null>(null)

function logViewport(): HTMLElement | null {
  return logPanel.value?.$el.querySelector('[data-reka-scroll-area-viewport]') ?? null
}

async function loadLogs(): Promise<void> {
  if (!logsLoaded.value) logLoading.value = true
  logError.value = ''
  try {
    const res = await api<RuntimeLogsResponse>('/api/logs', {
      query: { level: levelFilter.value === 'all' ? undefined : levelFilter.value, limit: 200 },
    })
    logItems.value = res.items
    logsLoaded.value = true
    void nextTick(() => {
      const el = logViewport()
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight
    })
  } catch (e) {
    if (!logsLoaded.value) logError.value = e instanceof ApiError ? e.message : 'Failed to load logs'
  } finally {
    logLoading.value = false
  }
}

function retryLogs(): void {
  logsLoaded.value = false
  void loadLogs()
}

const levelColor = (level: RuntimeLogLevel): string => {
  if (level === 'error') return 'text-rose-400'
  if (level === 'warn') return 'text-amber-400'
  if (level === 'debug') return 'text-violet-400'
  return 'text-emerald-400'
}

const filteredLogItems = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return logItems.value
  return logItems.value.filter((l) => l.msg.toLowerCase().includes(q))
})

const logsStatCards = computed<{ label: string; value: string | number; icon: LucideIcon; change: string; tone: 'up' | 'down' | 'neutral' }[]>(() => {
  const errors = logItems.value.filter((l) => l.level === 'error').length
  const warns = logItems.value.filter((l) => l.level === 'warn').length
  return [
    { label: 'Lines Shown', value: logItems.value.length, icon: Terminal, change: 'last 200 · live tail', tone: 'up' },
    { label: 'Errors', value: errors, icon: XCircle, change: `${errors} need attention`, tone: errors > 0 ? 'down' : 'up' },
    { label: 'Warnings', value: warns, icon: TriangleAlert, change: `${warns} warnings`, tone: warns > 0 ? 'down' : 'up' },
  ]
})

watch(tab, (t) => {
  if (t === 'tools' && !toolsLoaded.value && !toolLoading.value) void loadToolsPage(true)
  if (t === 'logs') void loadLogs()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-eyebrow text-muted-foreground">Terminal</p>
        <h2 class="mt-1 text-2xl font-bold tracking-tight">Logs</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          <template v-if="tab === 'commands'">{{ summary.success }} of {{ summary.total }} commands succeeded · avg {{ formatResponseTime(summary.avgLatencyMs) }}.</template>
          <template v-else-if="tab === 'tools'">{{ toolSummary.success }} of {{ toolSummary.total }} tool calls succeeded · avg {{ formatResponseTime(toolSummary.avgLatencyMs) }}.</template>
          <template v-else>Live tail · {{ logItems.length }} lines · refreshes every 3s.</template>
        </p>
      </div>
      <div class="flex rounded-full bg-card p-1 text-xs font-semibold shadow-soft">
        <button
          v-for="t in tabs"
          :key="t.key"
          :aria-pressed="tab === t.key"
          @click="tab = t.key"
          :class="cn(
            'rounded-full px-4 py-2 transition-design',
            tab === t.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
          )"
        >
          {{ t.label }}
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
      <article
        v-for="stat in visibleStatCards"
        :key="stat.label"
        class="card-lift group rounded-[24px] bg-card p-5 shadow-soft hover:-translate-y-1 hover:shadow-lift"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-eyebrow text-muted-foreground">{{ stat.label }}</p>
            <p :title="String(stat.value)" class="mt-1.5 truncate text-[32px] leading-none font-bold tracking-tight text-foreground">{{ stat.value }}</p>
          </div>
          <span class="flex size-11 items-center justify-center rounded-full bg-primary/[0.07] text-primary transition-design group-hover:scale-105">
            <component :is="stat.icon" class="size-5" />
          </span>
        </div>
        <div class="mt-3">
          <span
            :class="cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
              stat.tone === 'up' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
              stat.tone === 'down' && 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
              stat.tone === 'neutral' && 'bg-muted text-muted-foreground',
            )"
          >
            {{ stat.change }}
          </span>
        </div>
      </article>
    </div>

    <!-- Search + filters -->
    <div class="flex flex-col gap-3 xl:flex-row xl:items-center">
      <div class="relative w-full xl:max-w-xs">
        <Search class="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="searchQuery"
          :placeholder="tab === 'commands' ? 'Search command, args, user…' : tab === 'tools' ? 'Search tool, args, user…' : 'Search log text…'"
          class="w-full rounded-full bg-card py-2.5 pr-4 pl-11 text-sm shadow-soft outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-emerald-500/40"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="s in (['all', 'success', 'error'] as const)"
          :key="s"
          :aria-pressed="statusFilter === s"
          @click="statusFilter = s"
          :class="cn(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold capitalize transition-design',
            statusFilter === s
              ? 'bg-foreground text-background'
              : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
          )"
        >
          <span class="size-1.5 rounded-full" :class="s === 'success' ? 'bg-emerald-500' : s === 'error' ? 'bg-rose-500' : 'bg-muted-foreground'" />
          {{ s }}
        </button>
      </div>
    </div>
    <div v-if="tab === 'logs'" class="flex flex-wrap items-center gap-2">
      <button
        v-for="l in logLevels"
        :key="l"
        :aria-pressed="levelFilter === l"
        @click="levelFilter = l; void loadLogs()"
        :class="cn(
          'inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-mono text-xs font-semibold capitalize transition-design',
          levelFilter === l
            ? 'bg-foreground text-background'
            : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
        )"
      >
        {{ l }}
      </button>
    </div>

    <!-- Execution feed -->
    <section v-show="tab === 'commands'" class="min-h-[300px] rounded-[24px] bg-card px-3 py-6 shadow-soft sm:px-4">
      <header class="flex items-center justify-between px-3 pb-3 sm:px-4">
        <h3 class="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Terminal class="size-5 text-muted-foreground" />
          Execution Log
        </h3>
        <span class="text-xs font-semibold text-muted-foreground">{{ filteredLogs.length }} entries</span>
      </header>
      <div v-if="loading && items.length === 0" class="space-y-2 px-3 sm:px-4">
        <Skeleton v-for="i in 6" :key="i" class="h-[64px] w-full rounded-2xl" />
      </div>
      <div v-else-if="error && items.length === 0" class="flex flex-col items-center px-6 py-14 text-center">
        <p class="mt-4 text-base font-bold">Couldn't load executions</p>
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">{{ error }}</p>
        <button @click="retry" class="mt-5 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
          Retry
        </button>
      </div>
      <ul v-else-if="filteredLogs.length" :class="loading && 'opacity-60'" class="space-y-1 transition-opacity duration-150">
        <li
          v-for="log in filteredLogs"
          :key="log.id"
          class="flex items-start gap-3.5 rounded-2xl px-3 py-3 sm:px-4"
        >
          <span
            class="mt-1.5 size-2 shrink-0 rounded-full"
            :class="log.success ? 'bg-emerald-500' : 'bg-rose-500'"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <code
                class="rounded-full px-2.5 py-0.5 font-mono text-xs font-bold"
                :class="log.success
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-300'"
              >
                !{{ log.command }}
              </code>
              <span v-if="log.args" class="truncate font-mono text-xs text-muted-foreground">{{ log.args }}</span>
            </div>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              <span class="font-mono font-semibold text-foreground/70">{{ shortJid(log.userId) }}</span>
              <span aria-hidden="true"> · </span>
              <span>{{ log.sessionId ?? '—' }}</span>
            </p>
          </div>
          <div class="hidden shrink-0 text-right sm:block">
            <p class="font-mono text-xs font-bold tabular-nums" :class="responseTimeColor(log.latencyMs)">
              {{ formatResponseTime(log.latencyMs) }}
            </p>
            <p class="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{{ timeAgo(log.createdAt) }} · {{ formatClock(log.createdAt) }}</p>
          </div>
        </li>
      </ul>
      <div v-else class="flex flex-col items-center px-6 py-14 text-center">
        <span class="flex size-14 items-center justify-center rounded-full bg-muted">
          <Terminal class="size-6 text-muted-foreground" />
        </span>
        <p class="mt-4 text-base font-bold">No executions found</p>
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">Try a different search term or filter.</p>
        <button @click="clearFilters" class="mt-5 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
          Clear filters
        </button>
      </div>
      <div v-if="hasMore && filteredLogs.length" class="px-4 pt-3 text-center">
        <button
          @click="loadMore"
          :disabled="loadingMore"
          class="rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground disabled:opacity-50"
        >
          {{ loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </section>
    <!-- Tool calls feed (sumber terpisah — statistik tidak dicampur) -->
    <section v-show="tab === 'tools'" class="min-h-[300px] rounded-[24px] bg-card px-3 py-6 shadow-soft sm:px-4">
      <header class="flex items-center justify-between px-3 pb-3 sm:px-4">
        <h3 class="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Wrench class="size-5 text-muted-foreground" />
          Tool Calls
        </h3>
        <span class="text-xs font-semibold text-muted-foreground">{{ filteredTools.length }} entries</span>
      </header>
      <div v-if="toolLoading && toolItems.length === 0" class="space-y-2 px-3 sm:px-4">
        <Skeleton v-for="i in 6" :key="i" class="h-[64px] w-full rounded-2xl" />
      </div>
      <div v-else-if="toolError && toolItems.length === 0" class="flex flex-col items-center px-6 py-14 text-center">
        <p class="mt-4 text-base font-bold">Couldn't load tool calls</p>
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">{{ toolError }}</p>
        <button @click="retryTools" class="mt-5 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
          Retry
        </button>
      </div>
      <ul v-else-if="filteredTools.length" :class="toolLoading && 'opacity-60'" class="space-y-1 transition-opacity duration-150">
        <li
          v-for="call in filteredTools"
          :key="call.id"
          class="flex items-start gap-3.5 rounded-2xl px-3 py-3 sm:px-4"
        >
          <span
            class="mt-1.5 size-2 shrink-0 rounded-full"
            :class="call.success ? 'bg-violet-500' : 'bg-rose-500'"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <code
                class="rounded-full px-2.5 py-0.5 font-mono text-xs font-bold"
                :class="call.success
                  ? 'bg-violet-500/10 text-violet-600 dark:text-violet-300'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-300'"
              >
                {{ call.tool }}
              </code>
              <span v-if="call.cached" class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">cached</span>
              <span v-if="call.args" class="truncate font-mono text-xs text-muted-foreground">{{ call.args }}</span>
            </div>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              <span class="font-mono font-semibold text-foreground/70">{{ shortJid(call.userId) }}</span>
              <span aria-hidden="true"> · </span>
              <span>{{ call.sessionId ?? '—' }}</span>
            </p>
          </div>
          <div class="hidden shrink-0 text-right sm:block">
            <p class="font-mono text-xs font-bold tabular-nums" :class="responseTimeColor(call.latencyMs)">
              {{ formatResponseTime(call.latencyMs) }}
            </p>
            <p class="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{{ timeAgo(call.createdAt) }} · {{ formatClock(call.createdAt) }}</p>
          </div>
        </li>
      </ul>
      <div v-else class="flex flex-col items-center px-6 py-14 text-center">
        <span class="flex size-14 items-center justify-center rounded-full bg-muted">
          <Wrench class="size-6 text-muted-foreground" />
        </span>
        <p class="mt-4 text-base font-bold">No tool calls yet</p>
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">They appear here when AI uses tools. Try a different search term or filter.</p>
        <button @click="clearFilters" class="mt-5 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
          Clear filters
        </button>
      </div>
      <div v-if="toolHasMore && filteredTools.length" class="px-4 pt-3 text-center">
        <button
          @click="loadToolsMore"
          :disabled="toolLoadingMore"
          class="rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground disabled:opacity-50"
        >
          {{ toolLoadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </section>
    <!-- Runtime logs (PrintLog versi web — live tail) -->
    <section v-show="tab === 'logs'" class="overflow-hidden rounded-[24px] bg-[#0b1210] text-zinc-200 shadow-soft">
      <header class="flex items-center justify-between px-5 pt-4 pb-3">
        <h3 class="flex items-center gap-2 text-base font-bold tracking-tight">
          <Terminal class="size-4 text-emerald-400" />
          Runtime Log
        </h3>
        <span class="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
          LIVE · {{ filteredLogItems.length }} lines
        </span>
      </header>
      <ScrollArea ref="logPanel" class="h-[420px]">
      <div class="px-5 pb-5 font-mono text-xs leading-relaxed">
        <div v-if="logLoading && !logsLoaded" class="space-y-2 pt-2">
          <div v-for="i in 8" :key="i" class="h-4 animate-pulse rounded bg-white/10" />
        </div>
        <div v-else-if="logError && !logsLoaded" class="flex flex-col items-center py-14 text-center">
          <p class="text-sm font-bold text-zinc-100">Couldn't load logs</p>
          <p class="mt-1 max-w-xs text-xs text-zinc-400">{{ logError }}</p>
          <button @click="retryLogs" class="mt-5 rounded-full bg-white/10 px-5 py-2 text-xs font-semibold transition-design hover:bg-white/20">
            Retry
          </button>
        </div>
        <div v-else-if="!filteredLogItems.length" class="py-14 text-center text-xs text-zinc-500">
          No log lines yet — buffer terisi saat bot mencetak log.
        </div>
        <div v-else>
          <div v-for="(l, i) in filteredLogItems" :key="i" class="flex gap-3 py-px">
            <span class="shrink-0 tabular-nums text-zinc-500">{{ formatClock(l.t) }}</span>
            <span class="w-12 shrink-0 font-bold uppercase" :class="levelColor(l.level)">{{ l.level }}</span>
            <span class="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{{ l.msg }}</span>
          </div>
        </div>
      </div>
      </ScrollArea>
    </section>
  </div>
</template>

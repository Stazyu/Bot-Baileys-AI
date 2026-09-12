<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Command, Clock, CheckCircle2, XCircle, Terminal, type LucideIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────
interface CommandLog {
  id: string
  command: string
  args: string
  pushName: string
  jid: string
  session: string
  timestamp: Date
  status: 'success' | 'error'
  responseTime: number // in ms
  category: string
  groupName?: string
  errorMessage?: string
}

// ── Mock Data ──────────────────────────────────────────────────────
const logs = ref<CommandLog[]>([
  {
    id: 'cl-01',
    command: '!ping',
    args: '',
    pushName: 'Budi Santoso',
    jid: '6281234567890@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 1 * 60 * 1000),
    status: 'success',
    responseTime: 127,
    category: 'basic',
  },
  {
    id: 'cl-02',
    command: '!sticker',
    args: '(image attached)',
    pushName: 'Siti Rahayu',
    jid: '6289876543210@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 3 * 60 * 1000),
    status: 'success',
    responseTime: 843,
    category: 'media',
  },
  {
    id: 'cl-03',
    command: '!tiktok',
    args: 'https://vt.tiktok.com/ZS1234567/',
    pushName: 'Andi Pratama',
    jid: '6283334445556@s.whatsapp.net',
    session: 'Bot Support',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    status: 'success',
    responseTime: 2341,
    category: 'media',
  },
  {
    id: 'cl-04',
    command: '!ai',
    args: 'on',
    pushName: 'Dewi Lestari',
    jid: '6285556667778@s.whatsapp.net',
    session: 'Bot Support',
    timestamp: new Date(Date.now() - 8 * 60 * 1000),
    status: 'success',
    responseTime: 93,
    category: 'ai',
  },
  {
    id: 'cl-05',
    command: '!help',
    args: '',
    pushName: 'Rizky Fauzan',
    jid: '6284443332221@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 10 * 60 * 1000),
    status: 'success',
    responseTime: 156,
    category: 'basic',
  },
  {
    id: 'cl-06',
    command: '!instagram',
    args: 'https://instagram.com/p/ABC123/',
    pushName: 'Maya Indah',
    jid: '6281112223334@s.whatsapp.net',
    session: 'Premium Bot',
    timestamp: new Date(Date.now() - 12 * 60 * 1000),
    status: 'error',
    responseTime: 5432,
    category: 'media',
    errorMessage: 'Invalid URL or media not found',
  },
  {
    id: 'cl-07',
    command: '!hidetag',
    args: 'Selamat pagi semua!',
    pushName: 'Hendra Gunawan',
    jid: '6287778889990@s.whatsapp.net',
    session: 'Premium Bot',
    timestamp: new Date(Date.now() - 15 * 60 * 1000),
    status: 'success',
    responseTime: 210,
    category: 'group',
    groupName: 'Keluarga Bahagia',
  },
  {
    id: 'cl-08',
    command: '!youtube',
    args: 'https://youtube.com/watch?v=dQw4w9WgXcQ audio',
    pushName: 'Ratna Sari',
    jid: '6289990001112@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 18 * 60 * 1000),
    status: 'success',
    responseTime: 5678,
    category: 'media',
  },
  {
    id: 'cl-09',
    command: '!status',
    args: '',
    pushName: 'Dimas Ardiansyah',
    jid: '6286665554443@s.whatsapp.net',
    session: 'Bot Support',
    timestamp: new Date(Date.now() - 20 * 60 * 1000),
    status: 'success',
    responseTime: 89,
    category: 'basic',
  },
  {
    id: 'cl-10',
    command: '!premium',
    args: 'add 6281234567890 30',
    pushName: 'Wahyu',
    jid: '6281234567890@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 25 * 60 * 1000),
    status: 'success',
    responseTime: 178,
    category: 'owner',
  },
  {
    id: 'cl-11',
    command: '!pinterest',
    args: 'pemandangan alam',
    pushName: 'Fitri Handayani',
    jid: '6283337778889@s.whatsapp.net',
    session: 'Premium Bot',
    timestamp: new Date(Date.now() - 30 * 60 * 1000),
    status: 'success',
    responseTime: 3120,
    category: 'media',
  },
  {
    id: 'cl-12',
    command: '!sticker',
    args: '(video attached)',
    pushName: 'Agus Wijaya',
    jid: '6282225556667@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 35 * 60 * 1000),
    status: 'error',
    responseTime: 4500,
    category: 'media',
    errorMessage: 'Video too large (>5MB)',
  },
  {
    id: 'cl-13',
    command: '!changelog',
    args: '',
    pushName: 'Putri Ayuningtyas',
    jid: '6288881112223@s.whatsapp.net',
    session: 'Bot Support',
    timestamp: new Date(Date.now() - 40 * 60 * 1000),
    status: 'success',
    responseTime: 112,
    category: 'basic',
  },
  {
    id: 'cl-14',
    command: '!setgroup',
    args: 'close',
    pushName: 'Budi Santoso',
    jid: '6281234567890@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    status: 'success',
    responseTime: 345,
    category: 'group',
    groupName: 'Tech Discussion',
  },
  {
    id: 'cl-15',
    command: '!togglebot',
    args: 'on',
    pushName: 'Siti Rahayu',
    jid: '6289876543210@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 50 * 60 * 1000),
    status: 'success',
    responseTime: 167,
    category: 'group',
    groupName: 'Keluarga Bahagia',
  },
  {
    id: 'cl-16',
    command: '!speedtest',
    args: '',
    pushName: 'Wahyu',
    jid: '6281234567890@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 55 * 60 * 1000),
    status: 'success',
    responseTime: 8923,
    category: 'owner',
  },
  {
    id: 'cl-17',
    command: '!reportbug',
    args: 'Sticker command not working for large videos',
    pushName: 'Rizky Fauzan',
    jid: '6284443332221@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 60 * 60 * 1000),
    status: 'success',
    responseTime: 210,
    category: 'basic',
  },
  {
    id: 'cl-18',
    command: '!facebook',
    args: 'https://facebook.com/watch?v=123456',
    pushName: 'Hendra Gunawan',
    jid: '6287778889990@s.whatsapp.net',
    session: 'Premium Bot',
    timestamp: new Date(Date.now() - 65 * 60 * 1000),
    status: 'error',
    responseTime: 6789,
    category: 'media',
    errorMessage: 'Video download failed - private content',
  },
  {
    id: 'cl-19',
    command: '!list',
    args: '',
    pushName: 'Dimas Ardiansyah',
    jid: '6286665554443@s.whatsapp.net',
    session: 'Bot Support',
    timestamp: new Date(Date.now() - 70 * 60 * 1000),
    status: 'success',
    responseTime: 145,
    category: 'session',
  },
  {
    id: 'cl-20',
    command: '!twitter',
    args: 'https://twitter.com/username/status/123456789',
    pushName: 'Putri Ayuningtyas',
    jid: '6288881112223@s.whatsapp.net',
    session: 'Bot Support',
    timestamp: new Date(Date.now() - 75 * 60 * 1000),
    status: 'success',
    responseTime: 2890,
    category: 'media',
  },
  {
    id: 'cl-21',
    command: '!sticker',
    args: '(image attached)',
    pushName: 'Dewi Lestari',
    jid: '6285556667778@s.whatsapp.net',
    session: 'Bot Support',
    timestamp: new Date(Date.now() - 80 * 60 * 1000),
    status: 'success',
    responseTime: 920,
    category: 'media',
  },
  {
    id: 'cl-22',
    command: '!pinterest',
    args: 'musik relaksasi',
    pushName: 'Fitri Handayani',
    jid: '6283337778889@s.whatsapp.net',
    session: 'Premium Bot',
    timestamp: new Date(Date.now() - 90 * 60 * 1000),
    status: 'success',
    responseTime: 2890,
    category: 'media',
  },
  {
    id: 'cl-23',
    command: '!help',
    args: 'sticker',
    pushName: 'Maya Indah',
    jid: '6281112223334@s.whatsapp.net',
    session: 'Premium Bot',
    timestamp: new Date(Date.now() - 100 * 60 * 1000),
    status: 'success',
    responseTime: 134,
    category: 'basic',
  },
  {
    id: 'cl-24',
    command: '!ping',
    args: '',
    pushName: 'Ratna Sari',
    jid: '6289990001112@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 120 * 60 * 1000),
    status: 'success',
    responseTime: 118,
    category: 'basic',
  },
  {
    id: 'cl-25',
    command: '!eval',
    args: 'console.log("test")',
    pushName: 'Wahyu',
    jid: '6281234567890@s.whatsapp.net',
    session: 'Wahyu',
    timestamp: new Date(Date.now() - 150 * 60 * 1000),
    status: 'success',
    responseTime: 256,
    category: 'owner',
  },
  {
    id: 'cl-26',
    command: '!tiktok',
    args: 'https://vm.tiktok.com/ZS9876543/',
    pushName: 'Andi Pratama',
    jid: '6283334445556@s.whatsapp.net',
    session: 'Bot Support',
    timestamp: new Date(Date.now() - 180 * 60 * 1000),
    status: 'error',
    responseTime: 4321,
    category: 'media',
    errorMessage: 'Video unavailable or restricted',
  },
])

// ── Stats ──────────────────────────────────────────────────────────
const totalCommands = computed(() => logs.value.length)
const successCount = computed(() => logs.value.filter((l) => l.status === 'success').length)
const errorCount = computed(() => logs.value.filter((l) => l.status === 'error').length)
const avgResponseTime = computed(() => {
  const total = logs.value.reduce((sum, l) => sum + l.responseTime, 0)
  return Math.round(total / logs.value.length)
})

const statCards = computed<{ label: string; value: string | number; icon: LucideIcon; change: string; tone: 'up' | 'down' | 'neutral' }[]>(() => [
  { label: 'Total Commands', value: totalCommands.value, icon: Command, change: `${successCount.value} succeeded`, tone: 'up' },
  { label: 'Success Rate', value: `${Math.round(successCount.value / totalCommands.value * 100)}%`, icon: CheckCircle2, change: `${errorCount.value} failed`, tone: errorCount.value > 3 ? 'down' : 'up' },
  { label: 'Avg Response', value: `${avgResponseTime.value}ms`, icon: Clock, change: 'last 26 executions', tone: 'neutral' },
  { label: 'Errors', value: errorCount.value, icon: XCircle, change: `${errorCount.value} need attention`, tone: 'down' },
])

// ── Search & Filter ────────────────────────────────────────────────
const searchQuery = ref('')
const categoryFilter = ref<string>('all')
const statusFilter = ref<'all' | 'success' | 'error'>('all')

const categoryOptions = computed(() => {
  const count = (c: string): number => logs.value.filter((l) => c === 'all' || l.category === c).length
  const cats = [...new Set(logs.value.map((l) => l.category))]
  return [{ key: 'all', label: 'All', count: count('all') }, ...cats.map((c) => ({ key: c, label: categoryLabel[c] ?? c, count: count(c) }))]
})

const filteredLogs = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  return logs.value.filter((l) => {
    const matchQuery
      = !q
        || l.command.toLowerCase().includes(q)
        || l.pushName.toLowerCase().includes(q)
        || l.jid.toLowerCase().includes(q)
        || l.args.toLowerCase().includes(q)
        || l.session.toLowerCase().includes(q)
    const matchCategory = categoryFilter.value === 'all' || l.category === categoryFilter.value
    const matchStatus = statusFilter.value === 'all' || l.status === statusFilter.value
    return matchQuery && matchCategory && matchStatus
  })
})

// ── Helpers ────────────────────────────────────────────────────────
function timeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  return `${diffDay}d ago`
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function formatResponseTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const categoryLabel: Record<string, string> = {
  basic: 'Basic',
  media: 'Media',
  group: 'Group',
  owner: 'Owner',
  ai: 'AI',
  session: 'Session',
}

const categoryPill = (cat: string): string => {
  const map: Record<string, string> = {
    basic: 'bg-muted text-muted-foreground',
    media: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
    group: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    owner: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
    ai: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    session: 'bg-slate-500/10 text-slate-500 dark:text-slate-300',
  }
  return map[cat] ?? 'bg-muted text-muted-foreground'
}

const responseTimeColor = (ms: number): string => {
  if (ms < 200) return 'text-emerald-500'
  if (ms < 2000) return 'text-foreground'
  if (ms < 5000) return 'text-amber-500'
  return 'text-rose-500'
}

const clearFilters = (): void => {
  searchQuery.value = ''
  categoryFilter.value = 'all'
  statusFilter.value = 'all'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <p class="text-eyebrow text-muted-foreground">Terminal</p>
      <h2 class="mt-1 text-2xl font-bold tracking-tight">Command Logs</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ successCount }} of {{ totalCommands }} commands succeeded · avg {{ avgResponseTime }}ms.
      </p>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article
        v-for="(stat, i) in statCards"
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
        <div class="mt-3">
          <span
            :class="cn(
              'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
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
          type="search"
          placeholder="Search command, user, args…"
          class="w-full rounded-full bg-card py-2.5 pr-4 pl-11 text-sm shadow-soft outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-emerald-500/40"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="c in categoryOptions"
          :key="c.key"
          :aria-pressed="categoryFilter === c.key"
          @click="categoryFilter = c.key"
          :class="cn(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold capitalize transition-design',
            categoryFilter === c.key
              ? 'bg-foreground text-background'
              : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
          )"
        >
          {{ c.label }}
          <span :class="cn('tabular-nums', categoryFilter === c.key ? 'opacity-70' : 'text-muted-foreground/70')">{{ c.count }}</span>
        </button>
        <button
          :aria-pressed="statusFilter === 'error'"
          @click="statusFilter = statusFilter === 'error' ? 'all' : 'error'"
          :class="cn(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-design',
            statusFilter === 'error'
              ? 'bg-rose-500 text-white'
              : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
          )"
        >
          <span class="size-1.5 rounded-full bg-current" />
          Errors only
        </button>
      </div>
    </div>

    <!-- Execution feed -->
    <section class="rounded-[24px] bg-card px-3 py-6 shadow-soft sm:px-4">
      <header class="flex items-center justify-between px-3 pb-3 sm:px-4">
        <h3 class="flex items-center gap-2 text-xl font-bold tracking-tight">
          <Terminal class="size-5 text-muted-foreground" />
          Execution Log
        </h3>
        <span class="text-xs font-semibold text-muted-foreground">{{ filteredLogs.length }} entries</span>
      </header>
      <ul v-if="filteredLogs.length" class="space-y-1">
        <li
          v-for="log in filteredLogs"
          :key="log.id"
          class="flex items-start gap-3.5 rounded-2xl px-3 py-3 sm:px-4"
        >
          <span
            class="mt-1.5 size-2 shrink-0 rounded-full"
            :class="log.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <code
                class="rounded-full px-2.5 py-0.5 font-mono text-xs font-bold"
                :class="log.status === 'success'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-300'"
              >
                {{ log.command }}
              </code>
              <span v-if="log.args" class="truncate font-mono text-xs text-muted-foreground">{{ log.args }}</span>
              <span :class="cn('rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', categoryPill(log.category))">
                {{ categoryLabel[log.category] ?? log.category }}
              </span>
            </div>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              <span class="font-semibold text-foreground/70">{{ log.pushName }}</span>
              <span aria-hidden="true"> · </span>
              <span>{{ log.session }}</span>
              <span v-if="log.groupName" aria-hidden="true"> · {{ log.groupName }}</span>
            </p>
            <p v-if="log.errorMessage" class="mt-0.5 truncate text-xs text-rose-500/90">
              {{ log.errorMessage }}
            </p>
          </div>
          <div class="hidden shrink-0 text-right sm:block">
            <p class="font-mono text-xs font-bold tabular-nums" :class="responseTimeColor(log.responseTime)">
              {{ formatResponseTime(log.responseTime) }}
            </p>
            <p class="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{{ timeAgo(log.timestamp) }} · {{ formatTime(log.timestamp) }}</p>
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
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Users, UserCheck, Crown, Bot, Brain, type LucideIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────
interface BotUser {
  id: string
  pushName: string
  jid: string
  session: string
  messagesIn: number
  messagesOut: number
  aiMode: boolean
  premiumTier: 'free' | 'premium' | 'pro'
  lastActive: Date
  registeredAt: Date
  status: 'active' | 'inactive'
  groups: number
}

// ── Mock Data ──────────────────────────────────────────────────────
const users = ref<BotUser[]>([
  {
    id: 'u-01',
    pushName: 'Budi Santoso',
    jid: '6281234567890@s.whatsapp.net',
    session: 'Wahyu',
    messagesIn: 87,
    messagesOut: 34,
    aiMode: true,
    premiumTier: 'free',
    lastActive: new Date(Date.now() - 2 * 60 * 1000),
    registeredAt: new Date('2025-12-01'),
    status: 'active',
    groups: 3,
  },
  {
    id: 'u-02',
    pushName: 'Siti Rahayu',
    jid: '6289876543210@s.whatsapp.net',
    session: 'Wahyu',
    messagesIn: 142,
    messagesOut: 51,
    aiMode: true,
    premiumTier: 'premium',
    lastActive: new Date(Date.now() - 15 * 60 * 1000),
    registeredAt: new Date('2025-11-15'),
    status: 'active',
    groups: 5,
  },
  {
    id: 'u-03',
    pushName: 'Andi Pratama',
    jid: '6283334445556@s.whatsapp.net',
    session: 'Bot Support',
    messagesIn: 205,
    messagesOut: 78,
    aiMode: false,
    premiumTier: 'free',
    lastActive: new Date(Date.now() - 45 * 60 * 1000),
    registeredAt: new Date('2026-01-10'),
    status: 'active',
    groups: 2,
  },
  {
    id: 'u-04',
    pushName: 'Dewi Lestari',
    jid: '6285556667778@s.whatsapp.net',
    session: 'Bot Support',
    messagesIn: 64,
    messagesOut: 22,
    aiMode: true,
    premiumTier: 'pro',
    lastActive: new Date(Date.now() - 3 * 60 * 60 * 1000),
    registeredAt: new Date('2025-10-05'),
    status: 'active',
    groups: 1,
  },
  {
    id: 'u-05',
    pushName: 'Rizky Fauzan',
    jid: '6284443332221@s.whatsapp.net',
    session: 'Wahyu',
    messagesIn: 312,
    messagesOut: 98,
    aiMode: true,
    premiumTier: 'premium',
    lastActive: new Date(Date.now() - 5 * 60 * 60 * 1000),
    registeredAt: new Date('2025-09-20'),
    status: 'active',
    groups: 7,
  },
  {
    id: 'u-06',
    pushName: 'Maya Indah',
    jid: '6281112223334@s.whatsapp.net',
    session: 'Premium Bot',
    messagesIn: 28,
    messagesOut: 9,
    aiMode: false,
    premiumTier: 'free',
    lastActive: new Date(Date.now() - 12 * 60 * 60 * 1000),
    registeredAt: new Date('2026-03-01'),
    status: 'inactive',
    groups: 0,
  },
  {
    id: 'u-07',
    pushName: 'Hendra Gunawan',
    jid: '6287778889990@s.whatsapp.net',
    session: 'Premium Bot',
    messagesIn: 189,
    messagesOut: 65,
    aiMode: true,
    premiumTier: 'pro',
    lastActive: new Date(Date.now() - 30 * 60 * 1000),
    registeredAt: new Date('2025-08-12'),
    status: 'active',
    groups: 4,
  },
  {
    id: 'u-08',
    pushName: 'Ratna Sari',
    jid: '6289990001112@s.whatsapp.net',
    session: 'Wahyu',
    messagesIn: 56,
    messagesOut: 18,
    aiMode: true,
    premiumTier: 'free',
    lastActive: new Date(Date.now() - 2 * 60 * 60 * 1000),
    registeredAt: new Date('2026-02-14'),
    status: 'active',
    groups: 1,
  },
  {
    id: 'u-09',
    pushName: 'Dimas Ardiansyah',
    jid: '6286665554443@s.whatsapp.net',
    session: 'Bot Support',
    messagesIn: 431,
    messagesOut: 156,
    aiMode: false,
    premiumTier: 'premium',
    lastActive: new Date(Date.now() - 20 * 60 * 1000),
    registeredAt: new Date('2025-07-25'),
    status: 'active',
    groups: 6,
  },
  {
    id: 'u-10',
    pushName: 'Fitri Handayani',
    jid: '6283337778889@s.whatsapp.net',
    session: 'Premium Bot',
    messagesIn: 94,
    messagesOut: 37,
    aiMode: true,
    premiumTier: 'free',
    lastActive: new Date(Date.now() - 8 * 60 * 60 * 1000),
    registeredAt: new Date('2026-01-28'),
    status: 'active',
    groups: 2,
  },
  {
    id: 'u-11',
    pushName: 'Agus Wijaya',
    jid: '6282225556667@s.whatsapp.net',
    session: 'Wahyu',
    messagesIn: 17,
    messagesOut: 5,
    aiMode: false,
    premiumTier: 'free',
    lastActive: new Date(Date.now() - 48 * 60 * 60 * 1000),
    registeredAt: new Date('2026-04-05'),
    status: 'inactive',
    groups: 0,
  },
  {
    id: 'u-12',
    pushName: 'Putri Ayuningtyas',
    jid: '6288881112223@s.whatsapp.net',
    session: 'Bot Support',
    messagesIn: 267,
    messagesOut: 89,
    aiMode: true,
    premiumTier: 'premium',
    lastActive: new Date(Date.now() - 10 * 60 * 1000),
    registeredAt: new Date('2025-11-30'),
    status: 'active',
    groups: 4,
  },
])

// ── Stats ──────────────────────────────────────────────────────────
const totalUsers = computed(() => users.value.length)
const activeUsers = computed(() => users.value.filter((u) => u.status === 'active').length)
const premiumUsers = computed(() => users.value.filter((u) => u.premiumTier !== 'free').length)
const aiModeUsers = computed(() => users.value.filter((u) => u.aiMode).length)

const statCards = computed<{ label: string; value: number; icon: LucideIcon; change: string }[]>(() => [
  { label: 'Total Users', value: totalUsers.value, icon: Users, change: `${activeUsers.value} active` },
  { label: 'Active Rate', value: Math.round(activeUsers.value / totalUsers.value * 100), icon: UserCheck, change: `${activeUsers.value} of ${totalUsers.value}` },
  { label: 'Premium', value: premiumUsers.value, icon: Crown, change: `${Math.round(premiumUsers.value / totalUsers.value * 100)}% of total` },
  { label: 'AI Mode', value: aiModeUsers.value, icon: Bot, change: `${Math.round(aiModeUsers.value / totalUsers.value * 100)}% of total` },
])

// ── Search & Filter ────────────────────────────────────────────────
const searchQuery = ref('')
const tierFilter = ref<'all' | 'free' | 'premium' | 'pro'>('all')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')

const tierOptions = computed(() => {
  const count = (t: string): number => users.value.filter((u) => t === 'all' || u.premiumTier === t).length
  return [
    { key: 'all', label: 'All tiers', count: count('all') },
    { key: 'free', label: 'Free', count: count('free') },
    { key: 'premium', label: 'Premium', count: count('premium') },
    { key: 'pro', label: 'Pro', count: count('pro') },
  ] as const
})

const filteredUsers = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  return users.value.filter((u) => {
    const matchQuery
      = !q
        || u.pushName.toLowerCase().includes(q)
        || u.jid.toLowerCase().includes(q)
        || u.session.toLowerCase().includes(q)
    const matchTier = tierFilter.value === 'all' || u.premiumTier === tierFilter.value
    const matchStatus = statusFilter.value === 'all' || u.status === statusFilter.value
    return matchQuery && matchTier && matchStatus
  })
})

// ── Helpers ────────────────────────────────────────────────────────
function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function timeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const tierPill = (tier: BotUser['premiumTier']): string => {
  const map: Record<BotUser['premiumTier'], string> = {
    free: 'bg-muted text-muted-foreground',
    premium: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    pro: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  }
  return map[tier]
}

const clearFilters = (): void => {
  searchQuery.value = ''
  tierFilter.value = 'all'
  statusFilter.value = 'all'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <p class="text-eyebrow text-muted-foreground">Audience</p>
      <h2 class="mt-1 text-2xl font-bold tracking-tight">Users</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ activeUsers }} of {{ totalUsers }} users active across all sessions.
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
            <p class="mt-1.5 text-[32px] leading-none font-bold tracking-tight text-foreground">
              {{ stat.value }}<span v-if="stat.label === 'Active Rate'" class="text-lg text-muted-foreground">%</span>
            </p>
          </div>
          <span class="flex size-11 items-center justify-center rounded-full bg-primary/[0.07] text-primary transition-design group-hover:scale-105">
            <component :is="stat.icon" class="size-5" />
          </span>
        </div>
        <div class="mt-3">
          <span class="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
            {{ stat.change }}
          </span>
        </div>
      </article>
    </div>

    <!-- Search + filters -->
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="relative w-full lg:max-w-xs">
        <Search class="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Search name, number, session…"
          class="w-full rounded-full bg-card py-2.5 pr-4 pl-11 text-sm shadow-soft outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-emerald-500/40"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="t in tierOptions"
          :key="t.key"
          :aria-pressed="tierFilter === t.key"
          @click="tierFilter = t.key"
          :class="cn(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-design',
            tierFilter === t.key
              ? 'bg-foreground text-background'
              : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
          )"
        >
          {{ t.label }}
          <span :class="cn('tabular-nums', tierFilter === t.key ? 'opacity-70' : 'text-muted-foreground/70')">{{ t.count }}</span>
        </button>
        <button
          v-for="s in (['active', 'inactive'] as const)"
          :key="s"
          :aria-pressed="statusFilter === s"
          @click="statusFilter = statusFilter === s ? 'all' : s"
          :class="cn(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold capitalize transition-design',
            statusFilter === s
              ? 'bg-foreground text-background'
              : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
          )"
        >
          <span class="size-1.5 rounded-full" :class="s === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground'" />
          {{ s }}
        </button>
      </div>
    </div>

    <!-- User list -->
    <section class="rounded-[24px] bg-card px-3 py-6 shadow-soft sm:px-4">
      <header class="flex items-center justify-between px-3 pb-3 sm:px-4">
        <h3 class="text-xl font-bold tracking-tight">Bot Users</h3>
        <span class="text-xs font-semibold text-muted-foreground">{{ filteredUsers.length }} users</span>
      </header>
      <ul v-if="filteredUsers.length" class="space-y-1">
        <li
          v-for="user in filteredUsers"
          :key="user.id"
          class="flex items-center gap-4 rounded-2xl px-3 py-3.5 sm:px-4"
        >
          <span class="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] text-[13px] font-bold text-primary">
            {{ initials(user.pushName) }}
            <span
              class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card"
              :class="user.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground/50'"
            />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p class="truncate text-sm font-semibold">{{ user.pushName }}</p>
              <span :class="cn('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', tierPill(user.premiumTier))">
                {{ user.premiumTier }}
              </span>
              <span v-if="user.aiMode" class="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                <Brain class="size-3" />
                AI
              </span>
            </div>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              <span class="font-mono">{{ user.jid.split('@')[0] }}</span>
              <span aria-hidden="true"> · </span>
              <span>{{ user.session }}</span>
              <span aria-hidden="true"> · </span>
              <span>{{ user.groups }} groups</span>
            </p>
          </div>
          <div class="hidden shrink-0 text-right sm:block">
            <p class="text-sm font-bold tabular-nums">{{ (user.messagesIn + user.messagesOut).toLocaleString() }}</p>
            <p class="text-[11px] tabular-nums text-muted-foreground">↓{{ user.messagesIn }} ↑{{ user.messagesOut }}</p>
          </div>
          <span class="hidden w-20 shrink-0 text-right text-[11px] text-muted-foreground md:block">
            {{ timeAgo(user.lastActive) }}
          </span>
        </li>
      </ul>
      <div v-else class="flex flex-col items-center px-6 py-14 text-center">
        <span class="flex size-14 items-center justify-center rounded-full bg-muted">
          <Users class="size-6 text-muted-foreground" />
        </span>
        <p class="mt-4 text-base font-bold">No users found</p>
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">Try a different search term or filter.</p>
        <button @click="clearFilters" class="mt-5 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
          Clear filters
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Ban, Bot, Brain, Crown, Search, UserCheck, Users, type LucideIcon } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { ApiError, api } from '@/lib/api'
import type { UserItem, UsersPage, UsersSummary } from '@/lib/api-types'
import { daysUntil, formatDate, initials, shortJid, timeAgo } from '@/lib/format'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'
import Input from '@/components/ui/input/Input.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Tier = 'free' | 'premium' | 'pro'

function asTier(tier: string): Tier {
  return tier === 'premium' || tier === 'pro' ? tier : 'free'
}

const items = ref<UserItem[]>([])
const summary = ref<UsersSummary | null>(null)
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(true)
const error = ref('')
const actionBusy = ref('')

const searchQuery = ref('')
const tierFilter = ref<'all' | Tier>('all')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')

async function loadSummary(): Promise<void> {
  try {
    summary.value = await api<UsersSummary>('/api/users/summary')
  } catch {
    // Stat tetap tampil dari data halaman bila summary gagal.
  }
}

async function loadPage(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await api<UsersPage>('/api/users', {
      query: {
        search: searchQuery.value.trim() || undefined,
        tier: tierFilter.value === 'all' ? undefined : tierFilter.value,
        status: statusFilter.value === 'all' ? undefined : statusFilter.value,
        page: page.value,
        pageSize,
      },
    })
    items.value = res.items
    total.value = res.total
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Failed to load users'
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch([searchQuery, tierFilter, statusFilter], () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    void loadPage()
  }, 350)
})

function nextPage(): void {
  page.value += 1
  void loadPage()
}

function prevPage(): void {
  if (page.value > 1) {
    page.value -= 1
    void loadPage()
  }
}

async function toggleBlock(user: UserItem): Promise<void> {
  actionBusy.value = user.userId
  try {
    const updated = await api<UserItem>(`/api/users/${encodeURIComponent(user.userId)}`, {
      method: 'PATCH',
      body: { isBlocked: !user.isBlocked },
    })
    const idx = items.value.findIndex((u) => u.userId === user.userId)
    if (idx >= 0) items.value[idx] = updated
  } catch {
    // Gagal — biarkan baris apa adanya; error global tidak perlu untuk aksi kecil.
  } finally {
    actionBusy.value = ''
  }
}

onMounted(() => {
  void loadSummary()
  void loadPage()
})

// ── Tier & expiry editor ───────────────────────────────────────────
type ExpiryMode = 'keep' | 'days' | 'never'

const editTarget = ref<UserItem | null>(null)
const editTier = ref<Tier>('free')
const editMode = ref<ExpiryMode>('days')
const editDays = ref(30)
const editBusy = ref(false)
const editError = ref('')

/** Tier yang benar-benar berlaku (fallback ke `tier` untuk API lama). */
function effectiveTier(user: UserItem): Tier {
  return asTier(user.effectiveTier ?? user.tier)
}

/**
 * Ringkasan masa aktif untuk badge baris. `null` = tidak perlu badge
 * (user free). Warna: abu = aman, kuning = ≤7 hari, merah = sudah lewat.
 */
function expiryBadge(user: UserItem): { text: string; tone: string } | null {
  if (effectiveTier(user) === 'free') return null
  const days = daysUntil(user.premiumExpiry ?? null)
  if (days === null) return { text: 'no expiry', tone: 'bg-muted text-muted-foreground' }
  if (days <= 0) return { text: 'expired', tone: 'bg-rose-500/10 text-rose-600 dark:text-rose-300' }
  if (days <= 7) return { text: `${days}d left`, tone: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' }
  return { text: formatDate(user.premiumExpiry as string), tone: 'bg-muted text-muted-foreground' }
}

function openEditor(user: UserItem): void {
  editTarget.value = user
  editTier.value = effectiveTier(user)
  // User yang sudah punya expiry: default "keep" supaya menyimpan ulang
  // tidak diam-diam memotong atau memperpanjang masa aktifnya.
  editMode.value = user.premiumExpiry ? 'keep' : 'days'
  editDays.value = 30
  editError.value = ''
}

async function saveEditor(): Promise<void> {
  const target = editTarget.value
  if (!target) return
  if (editTier.value !== 'free' && editMode.value === 'days') {
    if (!Number.isFinite(editDays.value) || editDays.value < 1) {
      editError.value = 'Days must be at least 1.'
      return
    }
  }
  editBusy.value = true
  editError.value = ''
  try {
    const body: Record<string, unknown> = { tier: editTier.value }
    // Tier free selalu tanpa expiry; 'keep' berarti jangan kirim field expiry.
    if (editTier.value === 'free') body.durationDays = null
    else if (editMode.value === 'days') body.durationDays = Math.floor(editDays.value)
    else if (editMode.value === 'never') body.durationDays = null

    const updated = await api<UserItem>(`/api/users/${encodeURIComponent(target.userId)}`, {
      method: 'PATCH',
      body,
    })
    const idx = items.value.findIndex((u) => u.userId === target.userId)
    if (idx >= 0) items.value[idx] = updated
    editTarget.value = null
    void loadSummary()
  } catch (e) {
    editError.value = e instanceof ApiError ? e.message : 'Failed to save'
  } finally {
    editBusy.value = false
  }
}

// ── Stats ──────────────────────────────────────────────────────────
const totalUsers = computed(() => summary.value?.total ?? total.value)
const activeUsers = computed(() => summary.value?.active ?? 0)
const premiumUsers = computed(() => (summary.value ? (summary.value.byTier.premium ?? 0) + (summary.value.byTier.pro ?? 0) : 0))
const aiModeUsers = computed(() => summary.value?.aiMode ?? 0)
const expiringSoon = computed(() => summary.value?.expiring7d ?? 0)

const statCards = computed<{ label: string; value: number; icon: LucideIcon; change: string }[]>(() => {
  const pct = (n: number): string => (totalUsers.value > 0 ? `${Math.round((n / totalUsers.value) * 100)}% of total` : '—')
  return [
    { label: 'Total Users', value: totalUsers.value, icon: Users, change: `${activeUsers.value} active` },
    { label: 'Active', value: activeUsers.value, icon: UserCheck, change: `${activeUsers.value} of ${totalUsers.value}` },
    {
      label: 'Premium',
      value: premiumUsers.value,
      icon: Crown,
      change: expiringSoon.value > 0 ? `${expiringSoon.value} expiring ≤7d` : pct(premiumUsers.value),
    },
    { label: 'AI Mode', value: aiModeUsers.value, icon: Bot, change: pct(aiModeUsers.value) },
  ]
})

// ── Filter pills ───────────────────────────────────────────────────
const tierOptions = computed(() => {
  const by = summary.value?.byTier
  return [
    { key: 'all', label: 'All tiers', count: summary.value?.total ?? total.value },
    { key: 'free', label: 'Free', count: by?.free ?? 0 },
    { key: 'premium', label: 'Premium', count: by?.premium ?? 0 },
    { key: 'pro', label: 'Pro', count: by?.pro ?? 0 },
  ] as const
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

const tierPill = (tier: Tier): string => {
  const map: Record<Tier, string> = {
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
            <p class="mt-1.5 text-[32px] leading-none font-bold tracking-tight text-foreground">{{ stat.value }}</p>
          </div>
          <span class="flex size-11 items-center justify-center rounded-full bg-primary/[0.07] text-primary transition-design group-hover:scale-105">
            <component :is="stat.icon" class="size-5" />
          </span>
        </div>
        <div class="mt-3">
          <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
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
          placeholder="Search name or number…"
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
        <span class="text-xs font-semibold text-muted-foreground">{{ total }} users</span>
      </header>
      <div v-if="loading && items.length === 0" class="space-y-2 px-3 sm:px-4">
        <Skeleton v-for="i in 5" :key="i" class="h-[68px] w-full rounded-2xl" />
      </div>
      <div v-else-if="error && items.length === 0" class="flex flex-col items-center px-6 py-14 text-center">
        <p class="mt-4 text-base font-bold">Couldn't load users</p>
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">{{ error }}</p>
        <button @click="loadPage()" class="mt-5 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
          Retry
        </button>
      </div>
      <ul v-else-if="items.length" class="space-y-1">
        <li
          v-for="user in items"
          :key="user.userId"
          class="flex items-center gap-4 rounded-2xl px-3 py-3.5 sm:px-4"
          :class="user.isBlocked && 'opacity-60'"
        >
          <span class="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] text-[13px] font-bold text-primary">
            {{ initials(user.pushName ?? shortJid(user.userId)) }}
            <span
              class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card"
              :class="user.status === 'active' && !user.isBlocked ? 'bg-emerald-500' : 'bg-muted-foreground/50'"
            />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p class="truncate text-sm font-semibold">{{ user.pushName ?? shortJid(user.userId) }}</p>
              <span :class="cn('rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', tierPill(effectiveTier(user)))">
                {{ effectiveTier(user) }}
              </span>
              <span
                v-if="expiryBadge(user)"
                :class="cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', expiryBadge(user)!.tone)"
              >
                {{ expiryBadge(user)!.text }}
              </span>
              <span v-if="user.aiModeEnabled" class="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                <Brain class="size-3" />
                AI
              </span>
              <span v-if="user.isBlocked" class="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-300">
                Blocked
              </span>
            </div>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              <span class="font-mono">{{ shortJid(user.userId) }}</span>
              <span aria-hidden="true"> · </span>
              <span>{{ user.sessionId ?? '—' }}</span>
              <span aria-hidden="true"> · </span>
              <span>{{ user.messageCount }} msgs</span>
            </p>
          </div>
          <span class="hidden w-20 shrink-0 text-right text-[11px] text-muted-foreground md:block">
            {{ timeAgo(user.lastSeen) }}
          </span>
          <button
            @click="openEditor(user)"
            :title="`Edit tier for ${shortJid(user.userId)}`"
            :aria-label="`Edit tier for ${shortJid(user.userId)}`"
            class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-design hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-300"
          >
            <Crown class="size-4" />
          </button>
          <button
            @click="toggleBlock(user)"
            :disabled="actionBusy === user.userId"
            :title="user.isBlocked ? 'Unblock user' : 'Block user'"
            :aria-label="user.isBlocked ? `Unblock ${shortJid(user.userId)}` : `Block ${shortJid(user.userId)}`"
            :class="cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full transition-design disabled:opacity-50',
              user.isBlocked
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                : 'bg-muted text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300',
            )"
          >
            <Ban class="size-4" />
          </button>
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
      <div v-if="totalPages > 1" class="flex items-center justify-center gap-3 px-4 pt-4">
        <button
          @click="prevPage"
          :disabled="page <= 1"
          class="rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground disabled:opacity-40"
        >
          Prev
        </button>
        <span class="text-xs font-semibold text-muted-foreground tabular-nums">Page {{ page }} of {{ totalPages }}</span>
        <button
          @click="nextPage"
          :disabled="page >= totalPages"
          class="rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </section>

    <!-- ══ Tier & expiry editor ══ -->
    <Dialog :open="editTarget !== null" @update:open="!$event && (editTarget = null)">
      <DialogContent v-if="editTarget" class="sm:max-w-md">
        <DialogHeader>
          <p class="text-eyebrow text-muted-foreground">Premium</p>
          <DialogTitle class="mt-1">Edit tier &amp; expiry</DialogTitle>
          <DialogDescription>
            <span class="font-mono font-semibold text-foreground">{{ shortJid(editTarget.userId) }}</span>
            · currently {{ effectiveTier(editTarget) }}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div>
            <p class="text-eyebrow mb-2 text-muted-foreground">Tier</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="t in (['free', 'premium', 'pro'] as const)"
                :key="t"
                @click="editTier = t"
                :aria-pressed="editTier === t"
                :class="cn(
                  'rounded-full px-4 py-2 text-xs font-semibold capitalize transition-design',
                  editTier === t ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
                )"
              >
                {{ t }}
              </button>
            </div>
          </div>

          <div v-if="editTier !== 'free'">
            <p class="text-eyebrow mb-2 text-muted-foreground">Expiry</p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="m in (['keep', 'days', 'never'] as const)"
                :key="m"
                @click="editMode = m"
                :aria-pressed="editMode === m"
                :class="cn(
                  'rounded-full px-4 py-2 text-xs font-semibold capitalize transition-design',
                  editMode === m ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
                )"
              >
                {{ m === 'keep' ? 'keep current' : m === 'days' ? 'N days' : 'no expiry' }}
              </button>
            </div>
            <div v-if="editMode === 'days'" class="mt-3">
              <Input v-model.number="editDays" type="number" min="1" class="rounded-2xl" />
              <p class="mt-1 text-[11px] text-muted-foreground">
                Counted from now · 30 = 1 month, 365 = 1 year.
              </p>
            </div>
            <p v-else-if="editMode === 'keep'" class="mt-3 text-[11px] text-muted-foreground">
              Current: {{ editTarget.premiumExpiry ? formatDate(editTarget.premiumExpiry) : 'no expiry — nothing to keep' }}
            </p>
          </div>

          <p v-if="editError" class="rounded-2xl bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-300">
            {{ editError }}
          </p>
        </div>

        <DialogFooter>
          <button
            @click="editTarget = null"
            class="rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-design hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            @click="saveEditor"
            :disabled="editBusy"
            class="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-design hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {{ editBusy ? 'Saving…' : 'Save' }}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Users, UserCheck, Crown, Bot, ArrowUpRight, ArrowDownRight, type LucideIcon } from '@lucide/vue'
import Card from '@/components/ui/card/Card.vue'
import CardContent from '@/components/ui/card/CardContent.vue'
import CardHeader from '@/components/ui/card/CardHeader.vue'
import CardTitle from '@/components/ui/card/CardTitle.vue'
import Badge from '@/components/ui/badge/Badge.vue'
import Input from '@/components/ui/input/Input.vue'
import Avatar from '@/components/ui/avatar/Avatar.vue'
import AvatarFallback from '@/components/ui/avatar/AvatarFallback.vue'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
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

const statCards = computed<{ label: string; value: number; icon: LucideIcon; change: string; changeType: 'up' | 'down' }[]>(() => [
  { label: 'Total Users', value: totalUsers.value, icon: Users, change: `${activeUsers.value} active`, changeType: 'up' },
  { label: 'Active Today', value: activeUsers.value, icon: UserCheck, change: `${Math.round(activeUsers.value / totalUsers.value * 100)}% active rate`, changeType: 'up' },
  { label: 'Premium Users', value: premiumUsers.value, icon: Crown, change: `${Math.round(premiumUsers.value / totalUsers.value * 100)}% of total`, changeType: 'up' },
  { label: 'AI Mode Users', value: aiModeUsers.value, icon: Bot, change: `${Math.round(aiModeUsers.value / totalUsers.value * 100)}% of total`, changeType: 'up' },
])

// ── Search & Filter ────────────────────────────────────────────────
const searchQuery = ref('')
const tierFilter = ref<'all' | 'free' | 'premium' | 'pro'>('all')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')

const filteredUsers = computed(() => {
  let result = users.value

  // search
  const q = searchQuery.value.toLowerCase().trim()
  if (q) {
    result = result.filter(
      (u) =>
        u.pushName.toLowerCase().includes(q) ||
        u.jid.toLowerCase().includes(q) ||
        u.session.toLowerCase().includes(q),
    )
  }

  // tier filter
  if (tierFilter.value !== 'all') {
    result = result.filter((u) => u.premiumTier === tierFilter.value)
  }

  // status filter
  if (statusFilter.value !== 'all') {
    result = result.filter((u) => u.status === statusFilter.value)
  }

  return result
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

function formatDate(date: Date): string {
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

const tierBadge = (tier: BotUser['premiumTier']): { label: string; variant: 'default' | 'secondary' | 'outline' } => {
  const map: Record<BotUser['premiumTier'], { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    free: { label: 'Free', variant: 'secondary' },
    premium: { label: 'Premium', variant: 'default' },
    pro: { label: 'Pro', variant: 'outline' },
  }
  return map[tier]
}
</script>

<template>
  <div class="space-y-7">
    <!-- Page Header -->
    <div>
      <h2 class="text-display text-foreground">Users</h2>
      <p class="text-body text-muted-foreground mt-1">
        Users who interact with your WhatsApp bot across all sessions.
      </p>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card v-for="stat in statCards" :key="stat.label">
        <CardContent class="p-5">
          <div class="flex items-start justify-between">
            <div class="space-y-1.5">
              <p class="text-body text-muted-foreground">{{ stat.label }}</p>
              <p class="text-2xl font-semibold tracking-tight text-foreground">{{ stat.value }}</p>
            </div>
            <div class="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <component :is="stat.icon" class="size-5 text-primary" />
            </div>
          </div>
          <div class="mt-4 flex items-center gap-1.5">
            <component
              :is="stat.changeType === 'up' ? ArrowUpRight : ArrowDownRight"
              :class="cn(
                'size-3.5',
                stat.changeType === 'up' && 'text-surface',
                stat.changeType === 'down' && 'text-destructive',
              )"
            />
            <span
              :class="cn(
                'text-xs font-medium',
                stat.changeType === 'up' && 'text-surface',
                stat.changeType === 'down' && 'text-destructive',
              )"
            >
              {{ stat.change }}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Filters & Search -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div class="relative w-full sm:w-72">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          v-model="searchQuery"
          placeholder="Cari user..."
          class="pl-8 h-9 text-sm"
        />
      </div>
      <div class="flex items-center gap-2">
        <select
          v-model="tierFilter"
          class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        >
          <option value="all">All Tiers</option>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
          <option value="pro">Pro</option>
        </select>
        <select
          v-model="statusFilter"
          class="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
    </div>

    <!-- Users Table -->
    <Card>
      <CardHeader class="flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle class="text-heading">Bot Users</CardTitle>
        <span class="text-xs text-muted-foreground">{{ filteredUsers.length }} users</span>
      </CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow class="hover:bg-transparent">
              <TableHead class="pl-6">User</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Messages</TableHead>
              <TableHead>AI Mode</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Groups</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead class="pr-6">Last Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="filteredUsers.length === 0">
              <TableRow>
                <TableCell colspan="8" class="text-center py-12 text-muted-foreground">
                  <div class="flex flex-col items-center gap-2">
                    <Users class="size-8 opacity-40" />
                    <p class="text-sm">No users found matching your filters.</p>
                  </div>
                </TableCell>
              </TableRow>
            </template>
            <TableRow v-for="user in filteredUsers" :key="user.id">
              <!-- User Info -->
              <TableCell class="pl-6">
                <div class="flex items-center gap-3">
                  <Avatar class="size-9 shrink-0 rounded-full">
                    <AvatarFallback class="rounded-full text-xs bg-primary/10 text-primary font-semibold">
                      {{ initials(user.pushName) }}
                    </AvatarFallback>
                  </Avatar>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-foreground truncate">
                        {{ user.pushName }}
                      </span>
                      <span
                        class="size-2 rounded-full shrink-0"
                        :class="user.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground'"
                      ></span>
                    </div>
                    <p class="text-xs text-muted-foreground truncate font-mono">
                      {{ user.jid.split('@')[0] }}
                    </p>
                  </div>
                </div>
              </TableCell>

              <!-- Session -->
              <TableCell>
                <span class="text-sm text-foreground">{{ user.session }}</span>
              </TableCell>

              <!-- Messages -->
              <TableCell class="font-mono text-xs">
                <span class="text-surface font-medium">{{ user.messagesIn }}</span>
                <span class="text-muted-foreground"> / </span>
                <span class="text-primary font-medium">{{ user.messagesOut }}</span>
              </TableCell>

              <!-- AI Mode -->
              <TableCell>
                <Badge
                  :variant="user.aiMode ? 'default' : 'secondary'"
                  class="rounded-md text-[10px] px-1.5 py-0"
                >
                  {{ user.aiMode ? 'AI' : 'CMD' }}
                </Badge>
              </TableCell>

              <!-- Premium Tier -->
              <TableCell>
                <Badge
                  :variant="tierBadge(user.premiumTier).variant"
                  class="rounded-md text-[10px] px-1.5 py-0"
                >
                  {{ tierBadge(user.premiumTier).label }}
                </Badge>
              </TableCell>

              <!-- Groups -->
              <TableCell>
                <span class="text-sm text-foreground">{{ user.groups }}</span>
              </TableCell>

              <!-- Registered -->
              <TableCell class="text-xs text-muted-foreground whitespace-nowrap">
                {{ formatDate(user.registeredAt) }}
              </TableCell>

              <!-- Last Active -->
              <TableCell class="pr-6">
                <span
                  class="text-xs"
                  :class="user.status === 'active' ? 'text-foreground' : 'text-muted-foreground'"
                >
                  {{ timeAgo(user.lastActive) }}
                </span>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Brain, MonitorSmartphone, Plus, Power, QrCode, Search } from '@lucide/vue'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Input from '@/components/ui/input/Input.vue'

type Status = 'connected' | 'connecting' | 'disconnected' | 'pairing'

interface Session {
  id: string
  pushName: string
  phoneNumber: string
  status: Status
  uptime: string
  lastActive: string
  messagesIn: number
  messagesOut: number
  aiMode: boolean
  platform: string
}

const sessions = ref<Session[]>([
  { id: 'session-01', pushName: 'Wahyu', phoneNumber: '6281234567890', status: 'connected', uptime: '3h 42m', lastActive: 'just now', messagesIn: 341, messagesOut: 89, aiMode: true, platform: 'android' },
  { id: 'session-02', pushName: 'Bot Support', phoneNumber: '6289876543210', status: 'connected', uptime: '7h 15m', lastActive: '1m ago', messagesIn: 612, messagesOut: 204, aiMode: true, platform: 'ios' },
  { id: 'session-03', pushName: 'Shop Bot', phoneNumber: '6281112223334', status: 'disconnected', uptime: '—', lastActive: '2h ago', messagesIn: 1284, messagesOut: 402, aiMode: false, platform: 'web' },
  { id: 'session-04', pushName: 'Test Session', phoneNumber: '6284445556667', status: 'connecting', uptime: '—', lastActive: '—', messagesIn: 0, messagesOut: 0, aiMode: false, platform: 'android' },
  { id: 'session-05', pushName: 'Premium Bot', phoneNumber: '6287778889990', status: 'pairing', uptime: '—', lastActive: '—', messagesIn: 0, messagesOut: 0, aiMode: true, platform: 'ios' },
])

const query = ref('')
const activeFilter = ref<'all' | Status>('all')

/* ── modals ── */
const newOpen = ref(false)
const form = ref({ name: '', phone: '', platform: 'android', aiMode: true })
const formValid = computed(() => form.value.name.trim().length > 1 && /^[0-9+]{8,16}$/.test(form.value.phone.trim()))

const confirmTarget = ref<{ session: Session; action: 'disconnect' | 'reconnect' } | null>(null)
const detailsTarget = ref<Session | null>(null)
const qrTarget = ref<Session | null>(null)

const createSession = (): void => {
  if (!formValid.value) return
  sessions.value.unshift({
    id: `session-${Date.now().toString(36)}`,
    pushName: form.value.name.trim(),
    phoneNumber: form.value.phone.trim(),
    status: 'pairing',
    uptime: '—',
    lastActive: '—',
    messagesIn: 0,
    messagesOut: 0,
    aiMode: form.value.aiMode,
    platform: form.value.platform,
  })
  newOpen.value = false
  form.value = { name: '', phone: '', platform: 'android', aiMode: true }
}

const askToggle = (session: Session): void => {
  confirmTarget.value = { session, action: session.status === 'connected' ? 'disconnect' : 'reconnect' }
}

const doToggle = (): void => {
  const target = confirmTarget.value
  if (!target) return
  target.session.status = target.action === 'disconnect' ? 'disconnected' : 'connected'
  target.session.uptime = target.action === 'disconnect' ? '—' : 'just now'
  target.session.lastActive = 'just now'
  confirmTarget.value = null
}

/* pseudo-QR preview (placeholder until backend streams live codes) */
const QR_SIZE = 21
const qrCells = computed(() => {
  const id = qrTarget.value?.id ?? 'preview'
  let seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 7)
  const rand = (): number => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  return Array.from({ length: QR_SIZE * QR_SIZE }, (_, i) => {
    const x = i % QR_SIZE
    const y = Math.floor(i / QR_SIZE)
    if ((x < 8 && y < 8) || (x >= QR_SIZE - 8 && y < 8) || (x < 8 && y >= QR_SIZE - 8)) return false
    return rand() > 0.52
  })
})

const filters = computed(() => {
  const counts: Record<string, number> = { all: sessions.value.length }
  for (const s of sessions.value) counts[s.status] = (counts[s.status] ?? 0) + 1
  return [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'connected', label: 'Connected', count: counts.connected ?? 0 },
    { key: 'pairing', label: 'Pairing', count: (counts.pairing ?? 0) + (counts.connecting ?? 0) },
    { key: 'disconnected', label: 'Offline', count: counts.disconnected ?? 0 },
  ] as const
})

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return sessions.value.filter((s) => {
    const matchStatus
      = activeFilter.value === 'all'
        || s.status === activeFilter.value
        || (activeFilter.value === 'pairing' && s.status === 'connecting')
    const matchQuery
      = !q
        || s.pushName.toLowerCase().includes(q)
        || s.phoneNumber.includes(q)
    return matchStatus && matchQuery
  })
})

const statusPill = (status: Status): string => {
  const map: Record<Status, string> = {
    connected: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    connecting: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    disconnected: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
    pairing: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
  }
  return map[status]
}

const statusDot = (status: Status): string => {
  const map: Record<Status, string> = {
    connected: 'bg-emerald-500',
    connecting: 'bg-amber-500 animate-pulse',
    disconnected: 'bg-rose-500',
    pairing: 'bg-sky-500 animate-pulse',
  }
  return map[status]
}

const initials = (name: string): string =>
  name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

const fieldLabel = 'mb-1.5 block text-xs font-semibold text-muted-foreground'
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-eyebrow text-muted-foreground">Fleet</p>
        <h2 class="mt-1 text-2xl font-bold tracking-tight">Sessions</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ sessions.filter(s => s.status === 'connected').length }} of {{ sessions.length }} WhatsApp sessions online.
        </p>
      </div>
      <button
        @click="newOpen = true"
        class="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-design hover:opacity-90"
      >
        <Plus class="size-4" />
        New session
      </button>
    </div>

    <!-- Search + filters -->
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="relative w-full lg:max-w-xs">
        <Search class="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          v-model="query"
          type="search"
          placeholder="Search name or number…"
          class="w-full rounded-full bg-card py-2.5 pr-4 pl-11 text-sm shadow-soft outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-emerald-500/40"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="f in filters"
          :key="f.key"
          :aria-pressed="activeFilter === f.key"
          @click="activeFilter = f.key"
          :class="cn(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-design',
            activeFilter === f.key
              ? 'bg-foreground text-background'
              : 'bg-card text-muted-foreground shadow-soft hover:text-foreground',
          )"
        >
          {{ f.label }}
          <span :class="cn('tabular-nums', activeFilter === f.key ? 'opacity-70' : 'text-muted-foreground/70')">{{ f.count }}</span>
        </button>
      </div>
    </div>

    <!-- Cards -->
    <div v-if="visible.length" class="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <article
        v-for="session in visible"
        :key="session.id"
        class="card-lift rounded-[24px] bg-card p-6 shadow-soft hover:shadow-lift"
      >
        <div class="flex items-start gap-4">
          <span class="flex size-13 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] p-3.5 text-sm font-bold text-primary">
            {{ initials(session.pushName) }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <h3 class="truncate text-base font-bold tracking-tight">{{ session.pushName }}</h3>
              <span :class="cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', statusPill(session.status))">
                <span :class="cn('size-1.5 rounded-full', statusDot(session.status))" />
                {{ session.status }}
              </span>
              <span v-if="session.aiMode" class="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                <Brain class="size-3" />
                AI
              </span>
            </div>
            <p class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span class="font-mono">{{ session.phoneNumber }}</span>
              <span aria-hidden="true">·</span>
              <span class="inline-flex items-center gap-1 capitalize">
                <MonitorSmartphone class="size-3" />
                {{ session.platform }}
              </span>
              <span aria-hidden="true">·</span>
              <span>active {{ session.lastActive }}</span>
            </p>
          </div>
          <button
            v-if="session.status === 'pairing'"
            @click="qrTarget = session"
            class="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 transition-design hover:bg-sky-500/20 dark:text-sky-300"
            :aria-label="`Show QR for ${session.pushName}`"
          >
            <QrCode class="size-5" />
          </button>
        </div>

        <dl class="mt-5 grid grid-cols-3 gap-2 text-center">
          <div class="rounded-2xl bg-muted/50 px-2 py-3">
            <dd class="text-lg font-bold tabular-nums">{{ session.messagesIn.toLocaleString() }}</dd>
            <dt class="mt-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Received</dt>
          </div>
          <div class="rounded-2xl bg-muted/50 px-2 py-3">
            <dd class="text-lg font-bold tabular-nums">{{ session.messagesOut.toLocaleString() }}</dd>
            <dt class="mt-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Sent</dt>
          </div>
          <div class="rounded-2xl bg-muted/50 px-2 py-3">
            <dd class="text-lg font-bold tabular-nums">{{ session.uptime }}</dd>
            <dt class="mt-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Uptime</dt>
          </div>
        </dl>

        <div class="mt-5 flex flex-wrap items-center gap-2">
          <button
            v-if="session.status === 'connected'"
            @click="askToggle(session)"
            class="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-600 transition-design hover:bg-rose-500/20 dark:text-rose-300"
          >
            <Power class="size-3.5" />
            Disconnect
          </button>
          <button
            v-else-if="session.status === 'disconnected'"
            @click="askToggle(session)"
            class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-600 transition-design hover:bg-emerald-500/20 dark:text-emerald-300"
          >
            <Power class="size-3.5" />
            Reconnect
          </button>
          <button
            v-else
            class="inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-xs font-semibold text-muted-foreground"
            disabled
          >
            {{ session.status === 'pairing' ? 'Waiting for scan…' : 'Connecting…' }}
          </button>
          <button
            @click="detailsTarget = session"
            class="ml-auto rounded-full px-4 py-2 text-xs font-semibold text-muted-foreground transition-design hover:bg-muted hover:text-foreground"
          >
            Details
          </button>
        </div>
      </article>
    </div>

    <!-- Empty state -->
    <div v-else class="flex flex-col items-center rounded-[24px] bg-card px-6 py-16 text-center shadow-soft">
      <span class="flex size-14 items-center justify-center rounded-full bg-muted">
        <Search class="size-6 text-muted-foreground" />
      </span>
      <p class="mt-4 text-base font-bold">No sessions found</p>
      <p class="mt-1 max-w-xs text-sm text-muted-foreground">Try a different name, number, or status filter.</p>
      <button @click="query = ''; activeFilter = 'all'" class="mt-5 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
        Clear filters
      </button>
    </div>

    <!-- ══ New session modal ══ -->
    <Dialog :open="newOpen" @update:open="newOpen = $event">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <p class="text-eyebrow text-muted-foreground">Fleet</p>
          <DialogTitle class="mt-1">New session</DialogTitle>
          <DialogDescription>Register a number. You'll pair it by scanning a QR code next.</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <label for="ns-name" :class="fieldLabel">Display name</label>
            <Input id="ns-name" v-model="form.name" placeholder="e.g. Shop Bot" class="rounded-2xl" />
          </div>
          <div>
            <label for="ns-phone" :class="fieldLabel">WhatsApp number</label>
            <Input id="ns-phone" v-model="form.phone" inputmode="tel" placeholder="e.g. 6281234567890" class="rounded-2xl font-mono" />
          </div>
          <div>
            <span :class="fieldLabel">Platform</span>
            <div class="flex gap-2">
              <button
                v-for="p in ['android', 'ios', 'web']"
                :key="p"
                @click="form.platform = p"
                :aria-pressed="form.platform === p"
                :class="cn(
                  'flex-1 rounded-2xl px-3 py-2 text-xs font-semibold capitalize transition-design',
                  form.platform === p ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
                )"
              >
                {{ p }}
              </button>
            </div>
          </div>
          <button
            @click="form.aiMode = !form.aiMode"
            :aria-pressed="form.aiMode"
            class="flex w-full items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3 text-left"
          >
            <span :class="cn('relative h-6 w-11 shrink-0 rounded-full transition-design', form.aiMode ? 'bg-emerald-500' : 'bg-muted-foreground/30')">
              <span :class="cn('absolute top-0.5 size-5 rounded-full bg-white transition-design', form.aiMode ? 'left-[22px]' : 'left-0.5')" />
            </span>
            <span>
              <span class="block text-sm font-semibold">AI mode</span>
              <span class="block text-xs text-muted-foreground">Auto-reply with AI when enabled</span>
            </span>
          </button>
        </div>
        <DialogFooter>
          <button @click="newOpen = false" class="rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-design hover:bg-muted hover:text-foreground">
            Cancel
          </button>
          <button
            @click="createSession"
            :disabled="!formValid"
            class="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-design hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create session
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ══ Disconnect / reconnect confirm ══ -->
    <Dialog :open="confirmTarget !== null" @update:open="!$event && (confirmTarget = null)">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader v-if="confirmTarget">
          <p class="text-eyebrow" :class="confirmTarget.action === 'disconnect' ? 'text-rose-500' : 'text-emerald-500'">
            {{ confirmTarget.action === 'disconnect' ? 'Disconnect' : 'Reconnect' }}
          </p>
          <DialogTitle class="mt-1">
            {{ confirmTarget.action === 'disconnect' ? 'Take session offline?' : 'Bring session back?' }}
          </DialogTitle>
          <DialogDescription>
            <span class="font-semibold text-foreground">{{ confirmTarget.session.pushName }}</span>
            ({{ confirmTarget.session.phoneNumber }})
            {{ confirmTarget.action === 'disconnect' ? 'will stop receiving and replying until reconnected.' : 'will resume receiving and replying.' }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button @click="confirmTarget = null" class="rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-design hover:bg-muted hover:text-foreground">
            Cancel
          </button>
          <button
            @click="doToggle"
            :class="cn(
              'rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-design hover:opacity-90',
              confirmTarget?.action === 'disconnect' ? 'bg-rose-500' : 'bg-emerald-500',
            )"
          >
            {{ confirmTarget?.action === 'disconnect' ? 'Disconnect' : 'Reconnect' }}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ══ Session details ══ -->
    <Dialog :open="detailsTarget !== null" @update:open="!$event && (detailsTarget = null)">
      <DialogContent v-if="detailsTarget" class="sm:max-w-md">
        <DialogHeader>
          <div class="flex items-center gap-3">
            <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] text-sm font-bold text-primary">
              {{ initials(detailsTarget.pushName) }}
            </span>
            <div class="min-w-0">
              <DialogTitle class="truncate">{{ detailsTarget.pushName }}</DialogTitle>
              <DialogDescription class="font-mono">{{ detailsTarget.phoneNumber }}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div class="flex flex-wrap items-center gap-2">
          <span :class="cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', statusPill(detailsTarget.status))">
            <span :class="cn('size-1.5 rounded-full', statusDot(detailsTarget.status))" />
            {{ detailsTarget.status }}
          </span>
          <span v-if="detailsTarget.aiMode" class="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-600 dark:text-violet-300">
            <Brain class="size-3" />
            AI mode on
          </span>
          <span class="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground capitalize">
            <MonitorSmartphone class="size-3" />
            {{ detailsTarget.platform }}
          </span>
        </div>
        <dl class="grid grid-cols-2 gap-2 text-center">
          <div class="rounded-2xl bg-muted/50 px-2 py-3">
            <dd class="text-lg font-bold tabular-nums">{{ detailsTarget.messagesIn.toLocaleString() }}</dd>
            <dt class="mt-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Received</dt>
          </div>
          <div class="rounded-2xl bg-muted/50 px-2 py-3">
            <dd class="text-lg font-bold tabular-nums">{{ detailsTarget.messagesOut.toLocaleString() }}</dd>
            <dt class="mt-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Sent</dt>
          </div>
          <div class="rounded-2xl bg-muted/50 px-2 py-3">
            <dd class="text-lg font-bold tabular-nums">{{ detailsTarget.uptime }}</dd>
            <dt class="mt-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Uptime</dt>
          </div>
          <div class="rounded-2xl bg-muted/50 px-2 py-3">
            <dd class="text-lg font-bold tabular-nums">{{ detailsTarget.lastActive }}</dd>
            <dt class="mt-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Last active</dt>
          </div>
        </dl>
        <DialogFooter>
          <button @click="detailsTarget = null" class="rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-design hover:bg-muted hover:text-foreground">
            Close
          </button>
          <button
            v-if="detailsTarget.status === 'connected' || detailsTarget.status === 'disconnected'"
            @click="askToggle(detailsTarget); detailsTarget = null"
            :class="cn(
              'rounded-full px-5 py-2.5 text-sm font-semibold transition-design hover:opacity-90',
              detailsTarget.status === 'connected'
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
            )"
          >
            {{ detailsTarget.status === 'connected' ? 'Disconnect' : 'Reconnect' }}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ══ Pairing QR ══ -->
    <Dialog :open="qrTarget !== null" @update:open="!$event && (qrTarget = null)">
      <DialogContent v-if="qrTarget" class="sm:max-w-sm">
        <DialogHeader>
          <p class="text-eyebrow text-sky-500">Pair device</p>
          <DialogTitle class="mt-1">{{ qrTarget.pushName }}</DialogTitle>
          <DialogDescription>Scan with WhatsApp → Linked devices → Link a device.</DialogDescription>
        </DialogHeader>
        <div class="mx-auto w-fit rounded-[20px] bg-white p-4 shadow-soft">
          <div class="relative aspect-square w-52" role="img" :aria-label="`Pairing code preview for ${qrTarget.pushName}`">
            <div
              class="absolute inset-0 grid"
              :style="{ gridTemplateColumns: `repeat(${QR_SIZE}, 1fr)`, gridTemplateRows: `repeat(${QR_SIZE}, 1fr)` }"
            >
              <span v-for="(on, i) in qrCells" :key="i" :class="on ? 'bg-[#051321]' : 'bg-transparent'" />
            </div>
            <span aria-hidden="true" class="absolute top-0 left-0 grid size-[33.3%] place-items-center bg-white">
              <span class="grid size-full place-items-center rounded-[20%] bg-[#051321]"><span class="grid size-[60%] place-items-center bg-white"><span class="size-[55%] bg-[#051321]" /></span></span>
            </span>
            <span aria-hidden="true" class="absolute top-0 right-0 grid size-[33.3%] place-items-center bg-white">
              <span class="grid size-full place-items-center rounded-[20%] bg-[#051321]"><span class="grid size-[60%] place-items-center bg-white"><span class="size-[55%] bg-[#051321]" /></span></span>
            </span>
            <span aria-hidden="true" class="absolute bottom-0 left-0 grid size-[33.3%] place-items-center bg-white">
              <span class="grid size-full place-items-center rounded-[20%] bg-[#051321]"><span class="grid size-[60%] place-items-center bg-white"><span class="size-[55%] bg-[#051321]" /></span></span>
            </span>
          </div>
        </div>
        <p class="rounded-2xl bg-muted/50 px-4 py-2.5 text-center text-xs text-muted-foreground">
          Preview layout — live QR arrives with backend integration.
        </p>
        <DialogFooter>
          <button @click="qrTarget = null" class="w-full rounded-full bg-muted px-5 py-2.5 text-sm font-semibold transition-design hover:text-foreground">
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Check, Copy, MonitorSmartphone, Plus, Power, QrCode, RefreshCw, Search, Trash2 } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { ApiError, api } from '@/lib/api'
import type { SessionItem, SessionQr, SessionStatus } from '@/lib/api-types'
import { timeAgo } from '@/lib/format'
import { useSessionsStore } from '@/stores/sessions'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Input from '@/components/ui/input/Input.vue'

const store = useSessionsStore()

onMounted(() => {
  if (store.items.length === 0) void store.fetchAll()
})

const query = ref('')
const activeFilter = ref<'all' | SessionStatus>('all')

/* ── modals ── */
const newOpen = ref(false)
const form = ref({ id: '', phone: '' })
const createError = ref('')
const confirmTarget = ref<{ session: SessionItem; action: 'disconnect' | 'reconnect' | 'delete' } | null>(null)
const detailsTarget = ref<SessionItem | null>(null)
const qrId = ref<string | null>(null)
const pairPhone = ref('')
const copied = ref(false)

const idValid = computed(() => /^[a-zA-Z0-9_-]{2,32}$/.test(form.value.id.trim()))
const phoneTrimmed = computed(() => form.value.phone.trim())
const phoneValid = computed(() => phoneTrimmed.value === '' || /^[0-9+]{8,16}$/.test(phoneTrimmed.value))
const formValid = computed(() => idValid.value && phoneValid.value)

async function createSession(): Promise<void> {
  if (!formValid.value || store.busyId) return
  createError.value = ''
  const id = form.value.id.trim()
  try {
    await store.create(id, phoneTrimmed.value || undefined)
    newOpen.value = false
    form.value = { id: '', phone: '' }
    qrId.value = id
  } catch (e) {
    createError.value = e instanceof ApiError ? e.message : 'Failed to create session'
  }
}

function askToggle(session: SessionItem): void {
  confirmTarget.value = { session, action: session.status === 'connected' ? 'disconnect' : 'reconnect' }
}

function askDelete(session: SessionItem): void {
  confirmTarget.value = { session, action: 'delete' }
}

// Dari modal Details: tutup dulu, buka konfirmasi di tick berikut.
// Buka-tutup dua Dialog Radix dalam satu tick membuat dialog kedua tidak mount.
function askFromDetails(session: SessionItem, action: 'disconnect' | 'reconnect' | 'delete'): void {
  const snapshot = session
  detailsTarget.value = null
  void nextTick(() => {
    confirmTarget.value = { session: snapshot, action }
  })
}

async function doConfirm(): Promise<void> {
  const target = confirmTarget.value
  if (!target || store.busyId) return
  try {
    if (target.action === 'delete') {
      await store.remove(target.session.id)
    } else {
      const action = await store.toggle(target.session)
      // Reconnect: buka modal link agar user melihat status live — termasuk
      // QR baru bila sesi butuh scan ulang.
      if (action === 'reconnect') qrId.value = target.session.id
    }
    confirmTarget.value = null
  } catch {
    // store.error sudah diisi — dialog tetap terbuka agar user bisa retry/cancel.
  }
}

/* ── QR link ── */
const qrSession = computed(() => store.items.find((s) => s.id === qrId.value) ?? null)
const qrDataUrl = computed(() => (qrId.value ? store.linkQr[qrId.value] : undefined))
const pairingCode = computed(() => (qrId.value ? store.linkCode[qrId.value] : undefined))
const linkState = computed(() => (qrId.value ? store.linkStatus[qrId.value] : undefined))

async function refreshQr(id: string): Promise<void> {
  try {
    const qr = await api<SessionQr>(`/api/sessions/${id}/qr`)
    if (qr.dataUrl) store.linkQr = { ...store.linkQr, [id]: qr.dataUrl }
  } catch {
    // WS akan mengirim QR saat tersedia.
  }
}

watch(qrId, (id, prev) => {
  if (prev) store.clearLink(prev)
  pairPhone.value = ''
  copied.value = false
  if (id) {
    const session = store.items.find((s) => s.id === id)
    if (session?.phoneNumber) pairPhone.value = session.phoneNumber
    store.connectLink(id)
    void refreshQr(id)
  }
})

function requestPairing(): void {
  const phone = pairPhone.value.trim()
  if (!phone) return
  copied.value = false
  store.requestPairing(phone)
}

function closeQr(): void {
  if (qrId.value && store.linkStatus[qrId.value] === 'connected') void store.fetchAll()
  qrId.value = null
}

// Device terhubung → beri jeda lihat status sukses, lalu tutup + refresh list.
watch(linkState, (state) => {
  const id = qrId.value
  if (id && state === 'connected') {
    window.setTimeout(() => {
      if (qrId.value === id) closeQr()
    }, 1500)
  }
})

async function copyCode(): Promise<void> {
  const code = pairingCode.value
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    copied.value = true
  } catch {
    copied.value = false
  }
}


/* ── list ── */
const filters = computed(() => {
  const counts: Record<string, number> = { all: store.items.length }
  for (const s of store.items) counts[s.status] = (counts[s.status] ?? 0) + 1
  return [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'connected', label: 'Connected', count: counts.connected ?? 0 },
    { key: 'pairing', label: 'Pairing', count: counts.pairing ?? 0 },
    { key: 'disconnected', label: 'Offline', count: counts.disconnected ?? 0 },
  ] as const
})

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return store.items.filter((s) => {
    const matchStatus = activeFilter.value === 'all' || s.status === activeFilter.value
    const matchQuery
      = !q
        || s.id.toLowerCase().includes(q)
        || (s.phoneNumber ?? '').includes(q)
    return matchStatus && matchQuery
  })
})

const connectedCount = computed(() => store.items.filter((s) => s.status === 'connected').length)

const statusPill = (status: SessionStatus): string => {
  const map: Record<SessionStatus, string> = {
    connected: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    connecting: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    disconnected: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
    pairing: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
  }
  return map[status]
}

const statusDot = (status: SessionStatus): string => {
  const map: Record<SessionStatus, string> = {
    connected: 'bg-emerald-500',
    connecting: 'bg-amber-500 animate-pulse',
    disconnected: 'bg-rose-500',
    pairing: 'bg-sky-500 animate-pulse',
  }
  return map[status]
}

const initials = (name: string): string =>
  name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

const displayOf = (s: SessionItem): string => s.phoneNumber ?? s.id

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
          {{ connectedCount }} of {{ store.items.length }} WhatsApp sessions online.
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

    <div v-if="store.error && store.items.length === 0" class="rounded-[24px] bg-card p-6 text-center shadow-soft">
      <p class="text-sm font-semibold">Couldn't load sessions</p>
      <p class="mt-1 text-xs text-muted-foreground">{{ store.error }}</p>
      <button @click="store.fetchAll()" class="mt-4 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
        Retry
      </button>
    </div>

    <template v-else>
      <!-- Search + filters -->
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div class="relative w-full lg:max-w-xs">
          <Search class="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="query"
            type="search"
            placeholder="Search id or number…"
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
            <span class="flex size-13 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] p-3.5 font-mono text-xs font-bold text-primary">
              {{ initials(displayOf(session)) }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <h3 class="truncate font-mono text-base font-bold tracking-tight">{{ displayOf(session) }}</h3>
                <span :class="cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', statusPill(session.status))">
                  <span :class="cn('size-1.5 rounded-full', statusDot(session.status))" />
                  {{ session.status }}
                </span>
              </div>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span class="font-mono">{{ session.id }}</span>
                <span aria-hidden="true">·</span>
                <span>active {{ session.lastActive ? timeAgo(session.lastActive) : '—' }}</span>
              </p>
            </div>
            <button
              v-if="session.status === 'pairing' || session.status === 'disconnected'"
              @click="qrId = session.id"
              class="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 transition-design hover:bg-sky-500/20 dark:text-sky-300"
              :aria-label="`Show QR for ${displayOf(session)}`"
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
              :disabled="store.busyId === session.id"
              class="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-600 transition-design hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-300"
            >
              <Power class="size-3.5" />
              Disconnect
            </button>
            <button
              v-else-if="session.status === 'disconnected'"
              @click="askToggle(session)"
              :disabled="store.busyId === session.id"
              class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-600 transition-design hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-300"
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
        <p class="mt-1 max-w-xs text-sm text-muted-foreground">Try a different id, number, or status filter.</p>
        <button @click="query = ''; activeFilter = 'all'" class="mt-5 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
          Clear filters
        </button>
      </div>
    </template>

    <!-- ══ New session modal ══ -->
    <Dialog :open="newOpen" @update:open="newOpen = $event">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <p class="text-eyebrow text-muted-foreground">Fleet</p>
          <DialogTitle class="mt-1">New session</DialogTitle>
          <DialogDescription>Register an id. You'll pair it by scanning a QR code next.</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div>
            <label for="ns-name" :class="fieldLabel">Session id</label>
            <Input id="ns-name" v-model="form.id" placeholder="e.g. shop-bot" class="rounded-2xl font-mono" />
            <p class="mt-1 text-[11px] text-muted-foreground">Letters, numbers, dash, underscore · 2–32 chars.</p>
          </div>
          <div>
            <label for="ns-phone" :class="fieldLabel">WhatsApp number (optional)</label>
            <Input id="ns-phone" v-model="form.phone" inputmode="tel" placeholder="e.g. 6281234567890" class="rounded-2xl font-mono" />
            <p class="mt-1 text-[11px] text-muted-foreground">Needed for pairing-code login without camera scan.</p>
          </div>
          <p v-if="createError" class="rounded-2xl bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-600 dark:text-rose-300">
            {{ createError }}
          </p>
        </div>
        <DialogFooter>
          <button @click="newOpen = false" class="rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-design hover:bg-muted hover:text-foreground">
            Cancel
          </button>
          <button
            @click="createSession"
            :disabled="!formValid || !!store.busyId"
            class="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-design hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {{ store.busyId ? 'Creating…' : 'Create session' }}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ══ Disconnect / reconnect / delete confirm ══ -->
    <Dialog :open="confirmTarget !== null" @update:open="!$event && (confirmTarget = null)">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader v-if="confirmTarget">
          <p class="text-eyebrow" :class="confirmTarget.action === 'disconnect' || confirmTarget.action === 'delete' ? 'text-rose-500' : 'text-emerald-500'">
            {{ confirmTarget.action === 'disconnect' ? 'Disconnect' : confirmTarget.action === 'delete' ? 'Delete' : 'Reconnect' }}
          </p>
          <DialogTitle class="mt-1">
            {{ confirmTarget.action === 'disconnect' ? 'Take session offline?' : confirmTarget.action === 'delete' ? 'Delete this session?' : 'Bring session back?' }}
          </DialogTitle>
          <DialogDescription>
            <span class="font-mono font-semibold text-foreground">{{ displayOf(confirmTarget.session) }}</span>
            ({{ confirmTarget.session.id }})
            {{ confirmTarget.action === 'disconnect'
              ? 'will stop receiving and replying until reconnected.'
              : confirmTarget.action === 'delete'
                ? 'will disconnect and remove it from the fleet.'
                : 'will resume receiving and replying.' }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button @click="confirmTarget = null" class="rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-design hover:bg-muted hover:text-foreground">
            Cancel
          </button>
          <button
            @click="doConfirm"
            :disabled="!!store.busyId"
            :class="cn(
              'rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-design hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
              confirmTarget?.action === 'reconnect' ? 'bg-emerald-500' : 'bg-rose-500',
            )"
          >
            {{ store.busyId ? 'Working…' : confirmTarget?.action === 'disconnect' ? 'Disconnect' : confirmTarget?.action === 'delete' ? 'Delete' : 'Reconnect' }}
          </button>
        </DialogFooter>
        <p v-if="store.error" class="mt-2 text-xs font-semibold text-rose-500">{{ store.error }}</p>
      </DialogContent>
    </Dialog>

    <!-- ══ Session details ══ -->
    <Dialog :open="detailsTarget !== null" @update:open="!$event && (detailsTarget = null)">
      <DialogContent v-if="detailsTarget" class="sm:max-w-md">
        <DialogHeader>
          <div class="flex items-center gap-3">
            <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] font-mono text-xs font-bold text-primary">
              {{ initials(displayOf(detailsTarget)) }}
            </span>
            <div class="min-w-0">
              <DialogTitle class="truncate font-mono">{{ displayOf(detailsTarget) }}</DialogTitle>
              <DialogDescription class="font-mono">{{ detailsTarget.id }}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div class="flex flex-wrap items-center gap-2">
          <span :class="cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', statusPill(detailsTarget.status))">
            <span :class="cn('size-1.5 rounded-full', statusDot(detailsTarget.status))" />
            {{ detailsTarget.status }}
          </span>
          <span class="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            <MonitorSmartphone class="size-3" />
            WhatsApp
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
            <dd class="text-lg font-bold tabular-nums">{{ detailsTarget.lastActive ? timeAgo(detailsTarget.lastActive) : '—' }}</dd>
            <dt class="mt-0.5 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Last active</dt>
          </div>
        </dl>
        <DialogFooter class="flex-wrap">
          <button
            @click="detailsTarget && askFromDetails(detailsTarget, 'delete')"
            class="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-rose-600 transition-design hover:bg-rose-500/10 dark:text-rose-300"
          >
            <Trash2 class="size-4" />
            Delete
          </button>
          <span class="flex-1" />
          <button @click="detailsTarget = null" class="rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-design hover:bg-muted hover:text-foreground">
            Close
          </button>
          <button
            v-if="detailsTarget.status === 'connected' || detailsTarget.status === 'disconnected'"
            @click="detailsTarget && askFromDetails(detailsTarget, detailsTarget.status === 'connected' ? 'disconnect' : 'reconnect')"
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

    <!-- ══ Pairing QR + code ══ -->
    <Dialog :open="qrId !== null" @update:open="!$event && closeQr()">
      <DialogContent v-if="qrSession" class="sm:max-w-sm">
        <DialogHeader>
          <p class="text-eyebrow text-sky-500">Pair device</p>
          <DialogTitle class="mt-1 font-mono">{{ displayOf(qrSession) }}</DialogTitle>
          <DialogDescription>Scan with WhatsApp → Linked devices → Link a device. Or use a pairing code below.</DialogDescription>
        </DialogHeader>
        <div class="mx-auto w-fit rounded-[20px] bg-white p-4 shadow-soft">
          <img
            v-if="qrDataUrl"
            :src="qrDataUrl"
            alt="WhatsApp pairing QR"
            class="aspect-square w-52 rounded-lg"
          />
          <div v-else class="grid aspect-square w-52 animate-pulse place-items-center rounded-lg bg-muted">
            <QrCode class="size-10 text-muted-foreground" />
          </div>
        </div>
        <p class="rounded-2xl bg-muted/50 px-4 py-2.5 text-center text-xs text-muted-foreground">
          {{ linkState === 'connected' ? 'Device linked — you can close this.' : qrDataUrl ? 'QR refreshes automatically until linked.' : 'Waiting for QR from WhatsApp…' }}
        </p>
        <div class="space-y-2 rounded-2xl bg-muted/50 p-4">
          <p class="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Pairing code</p>
          <div v-if="pairingCode" class="flex items-center gap-2">
            <code class="flex-1 rounded-xl bg-background px-4 py-2.5 text-center font-mono text-lg font-bold tracking-[0.2em] shadow-soft">{{ pairingCode }}</code>
            <button
              @click="copyCode"
              aria-label="Copy pairing code"
              class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-design hover:text-foreground"
            >
              <Check v-if="copied" class="size-4 text-emerald-500" />
              <Copy v-else class="size-4" />
            </button>
          </div>
          <div v-else class="flex gap-2">
            <Input v-model="pairPhone" inputmode="tel" placeholder="6281234567890" class="rounded-xl font-mono" />
            <button
              @click="requestPairing"
              :disabled="!pairPhone.trim()"
              class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-600 transition-design hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-sky-300"
            >
              <RefreshCw class="size-3.5" />
              Get code
            </button>
          </div>
        </div>
        <p v-if="store.linkError" class="text-center text-xs font-semibold text-rose-500">{{ store.linkError }}</p>
        <DialogFooter>
          <button @click="closeQr" class="w-full rounded-full bg-muted px-5 py-2.5 text-sm font-semibold transition-design hover:text-foreground">
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

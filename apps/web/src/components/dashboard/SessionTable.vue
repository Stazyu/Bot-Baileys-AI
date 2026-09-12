<script setup lang="ts">
import { Brain } from '@lucide/vue'
import { cn } from '@/lib/utils'

interface Session {
  id: string
  phoneNumber: string
  pushName: string
  status: 'connected' | 'connecting' | 'disconnected' | 'pairing'
  uptime: string
  messagesIn: number
  messagesOut: number
  aiMode: boolean
  platform: string
}

const sessions: Session[] = [
  { id: 'session-01', phoneNumber: '6281234567890', pushName: 'Wahyu', status: 'connected', uptime: '3h 42m', messagesIn: 341, messagesOut: 89, aiMode: true, platform: 'android' },
  { id: 'session-02', phoneNumber: '6289876543210', pushName: 'Bot Support', status: 'connected', uptime: '7h 15m', messagesIn: 612, messagesOut: 204, aiMode: true, platform: 'ios' },
  { id: 'session-03', phoneNumber: '6281112223334', pushName: 'Shop Bot', status: 'disconnected', uptime: '—', messagesIn: 0, messagesOut: 0, aiMode: false, platform: 'web' },
  { id: 'session-04', phoneNumber: '6284445556667', pushName: 'Test Session', status: 'connecting', uptime: '—', messagesIn: 0, messagesOut: 0, aiMode: false, platform: 'android' },
  { id: 'session-05', phoneNumber: '6287778889990', pushName: 'Premium Bot', status: 'pairing', uptime: '—', messagesIn: 0, messagesOut: 0, aiMode: true, platform: 'ios' },
]

const statusPill = (status: Session['status']): string => {
  const map: Record<Session['status'], string> = {
    connected: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    connecting: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    disconnected: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
    pairing: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
  }
  return map[status]
}

const statusDot = (status: Session['status']): string => {
  const map: Record<Session['status'], string> = {
    connected: 'bg-emerald-500',
    connecting: 'bg-amber-500 animate-pulse',
    disconnected: 'bg-rose-500',
    pairing: 'bg-sky-500 animate-pulse',
  }
  return map[status]
}

const initials = (name: string): string =>
  name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
</script>

<template>
  <section class="rounded-[24px] bg-card px-3 py-6 shadow-soft sm:px-4">
    <header class="flex flex-wrap items-center justify-between gap-3 px-3 pb-3 sm:px-4">
      <div>
        <p class="text-eyebrow text-muted-foreground">Live fleet</p>
        <h3 class="mt-1 text-xl font-bold tracking-tight">WhatsApp Sessions</h3>
      </div>
      <div class="flex items-center gap-2">
        <span class="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {{ sessions.length }} sessions
        </span>
      </div>
    </header>

    <ul class="space-y-1">
      <li
        v-for="session in sessions"
        :key="session.id"
        class="flex items-center gap-4 rounded-2xl px-3 py-3.5 sm:px-4"
      >
        <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] text-[13px] font-bold text-primary">
          {{ initials(session.pushName) }}
        </span>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p class="truncate text-sm font-semibold">{{ session.pushName }}</p>
            <span :class="cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', statusPill(session.status))">
              <span :class="cn('size-1.5 rounded-full', statusDot(session.status))" />
              {{ session.status }}
            </span>
            <span v-if="session.aiMode" class="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
              <Brain class="size-3" />
              AI
            </span>
          </div>
          <p class="mt-1 truncate text-xs text-muted-foreground">
            <span class="font-mono">{{ session.phoneNumber }}</span>
            <span aria-hidden="true"> · </span>
            <span class="capitalize">{{ session.platform }}</span>
            <span aria-hidden="true"> · </span>
            <span>{{ session.uptime }}</span>
          </p>
        </div>

        <div class="hidden shrink-0 text-right sm:block">
          <p class="text-sm font-bold tabular-nums">{{ session.messagesIn + session.messagesOut }}</p>
          <p class="text-[11px] tabular-nums text-muted-foreground">↓{{ session.messagesIn }} ↑{{ session.messagesOut }}</p>
        </div>

      </li>
    </ul>
  </section>
</template>

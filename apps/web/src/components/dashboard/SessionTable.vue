<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSessionsStore } from '@/stores/sessions'
import { initials, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SessionStatus } from '@/lib/api-types'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'

const store = useSessionsStore()

onMounted(() => {
  if (store.items.length === 0) void store.fetchAll()
})

const sessions = computed(() => store.items.slice(0, 5))

function displayName(id: string, phone: string | null): string {
  return phone ?? id
}

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
          {{ store.items.length }} sessions
        </span>
      </div>
    </header>

    <div v-if="store.loading && sessions.length === 0" class="space-y-2 px-3 sm:px-4">
      <Skeleton v-for="i in 3" :key="i" class="h-[76px] w-full rounded-2xl" />
    </div>
    <div v-else-if="store.error && sessions.length === 0" class="px-6 py-10 text-center">
      <p class="text-sm font-semibold">Couldn't load sessions</p>
      <p class="mt-1 text-xs text-muted-foreground">{{ store.error }}</p>
      <button @click="store.fetchAll()" class="mt-4 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
        Retry
      </button>
    </div>
    <ul v-else-if="sessions.length" class="space-y-1">
      <li
        v-for="session in sessions"
        :key="session.id"
        class="flex items-center gap-4 rounded-2xl px-3 py-3.5 sm:px-4"
      >
        <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] text-[13px] font-bold text-primary">
          {{ initials(displayName(session.id, session.phoneNumber)) }}
        </span>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p class="truncate font-mono text-sm font-semibold">{{ displayName(session.id, session.phoneNumber) }}</p>
            <span :class="cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', statusPill(session.status))">
              <span :class="cn('size-1.5 rounded-full', statusDot(session.status))" />
              {{ session.status }}
            </span>
          </div>
          <p class="mt-1 truncate text-xs text-muted-foreground">
            <span>{{ session.id }}</span>
            <span aria-hidden="true"> · </span>
            <span>uptime {{ session.uptime }}</span>
            <span v-if="session.lastActive" aria-hidden="true"> · {{ timeAgo(session.lastActive) }}</span>
          </p>
        </div>

        <div class="hidden shrink-0 text-right sm:block">
          <p class="text-sm font-bold tabular-nums">{{ (session.messagesIn + session.messagesOut).toLocaleString() }}</p>
          <p class="text-[11px] tabular-nums text-muted-foreground">↓{{ session.messagesIn.toLocaleString() }} ↑{{ session.messagesOut.toLocaleString() }}</p>
        </div>
      </li>
    </ul>
    <p v-else class="px-6 py-10 text-center text-sm text-muted-foreground">
      No sessions yet — create one from the Sessions page.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Activity } from '@lucide/vue'
import StatsCards from '@/components/dashboard/StatsCards.vue'
import SessionList from '@/components/dashboard/SessionTable.vue'
import RecentActivity from '@/components/dashboard/RecentActivity.vue'
import SystemHealth from '@/components/dashboard/SystemHealth.vue'
import MessageTraffic from '@/components/dashboard/MessageTraffic.vue'
import { api } from '@/lib/api'
import type { DashboardStats, HealthSnapshot, TrafficData, UsersSummary } from '@/lib/api-types'
import { usePoll } from '@/composables/usePoll'
import { useSessionsStore } from '@/stores/sessions'

const store = useSessionsStore()
const stats = ref<DashboardStats | null>(null)
const traffic = ref<TrafficData | null>(null)
const health = ref<HealthSnapshot | null>(null)
const aiUsers = ref<number | null>(null)

async function loadHero(): Promise<void> {
  const [s, t, h, u] = await Promise.all([
    api<DashboardStats>('/api/dashboard/stats').catch(() => null),
    api<TrafficData>('/api/dashboard/traffic', { query: { range: '24h' } }).catch(() => null),
    api<HealthSnapshot>('/api/health').catch(() => null),
    api<UsersSummary>('/api/users/summary').catch(() => null),
  ])
  if (s) stats.value = s
  if (t) traffic.value = t
  if (h) health.value = h
  if (u) aiUsers.value = u.aiMode
}

onMounted(() => {
  if (store.items.length === 0) void store.fetchAll()
  void loadHero()
  usePoll(() => void loadHero(), 30_000)
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 11) return 'Good morning.'
  if (hour < 18) return 'Good afternoon.'
  return 'Good evening.'
})

const connected = computed(() => store.items.filter((s) => s.status === 'connected').length)
const totalSessions = computed(() => store.items.length)
const offlineCount = computed(() => totalSessions.value - connected.value)

const liveLabel = computed(() =>
  totalSessions.value === 0 ? 'No sessions yet' : `${connected.value} of ${totalSessions.value} sessions live`,
)

const mood = computed(() => {
  if (totalSessions.value === 0) return 'Connect your first session.'
  if (offlineCount.value === 0) return 'Your bots are humming.'
  return 'Some bots need you.'
})

const attention = computed(() => {
  if (totalSessions.value === 0) return 'create a session to begin.'
  if (offlineCount.value === 0) return 'all sessions live.'
  return `${offlineCount.value} session${offlineCount.value > 1 ? 's' : ''} needs your attention.`
})

const lastHourTotal = computed<number | null>(() => {
  const t = traffic.value
  if (!t || t.incoming.length === 0) return null
  const i = t.incoming.length - 1
  return (t.incoming[i] ?? 0) + (t.outgoing[i] ?? 0)
})

const ringFrac = computed(() => (totalSessions.value === 0 ? 0 : connected.value / totalSessions.value))
const ringOffset = computed(() => (326.7 * (1 - ringFrac.value)).toFixed(1))
const ringPct = computed(() => `${Math.round(ringFrac.value * 100)}%`)
const ringLabel = computed(() => (health.value?.status === 'degraded' ? 'degraded' : 'healthy'))

const medianReply = computed(() => {
  const ms = health.value?.replyP50Ms
  return ms === null || ms === undefined ? null : (ms / 1000).toFixed(1)
})
</script>

<template>
  <div class="space-y-6">
    <!-- ══ Hero — living status panel ══ -->
    <section
      class="animate-fade-up relative overflow-hidden rounded-[32px] bg-[#051321] text-white shadow-lift"
    >
      <!-- ambient blobs -->
      <div aria-hidden="true" class="pointer-events-none absolute inset-0">
        <div class="animate-drift absolute -top-24 -left-16 size-72 rounded-full bg-emerald-400/25 blur-3xl" />
        <div class="animate-drift-alt absolute top-10 right-[12%] size-56 rounded-full bg-teal-300/15 blur-3xl" />
        <div class="absolute -right-20 -bottom-28 size-80 rounded-full bg-lime-300/10 blur-3xl" />
        <div
          class="absolute inset-0 opacity-[0.14]"
          style="background-image: radial-gradient(rgb(255 255 255 / 0.5) 1px, transparent 1px); background-size: 22px 22px;"
        />
      </div>

      <div class="relative flex flex-col gap-8 p-7 sm:p-9 lg:flex-row lg:items-center lg:justify-between">
        <!-- greeting -->
        <div class="max-w-xl">
          <div class="flex flex-wrap items-center gap-2.5">
            <span class="inline-flex items-center gap-2 rounded-full bg-white/10 py-1 pr-3.5 pl-1.5 text-xs font-semibold backdrop-blur">
              <span class="relative flex size-5 items-center justify-center">
                <span class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span class="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
              </span>
              {{ liveLabel }}
            </span>
            <span v-if="aiUsers !== null" class="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200">
              {{ aiUsers }} in AI mode
            </span>
          </div>
          <h2 class="mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {{ greeting }}
            <span class="text-emerald-300">{{ mood }}</span>
          </h2>
          <p class="mt-2.5 max-w-md text-sm leading-relaxed text-white/65">
            {{ stats ? `${stats.messagesToday.toLocaleString()} messages processed today` : 'Loading stats…' }} ·
            {{ lastHourTotal === null ? '—' : lastHourTotal.toLocaleString() }} in the last hour · {{ attention }}
          </p>
        </div>

        <!-- live orb stats -->
        <div class="flex items-center gap-6 lg:gap-8">
          <div class="relative flex size-36 shrink-0 items-center justify-center sm:size-44">
            <svg viewBox="0 0 120 120" class="absolute inset-0 size-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgb(255 255 255 / 0.12)" stroke-width="10" />
              <circle
                cx="60" cy="60" r="52" fill="none" stroke="url(#orbGrad)" stroke-width="10"
                stroke-linecap="round" stroke-dasharray="326.7" :stroke-dashoffset="ringOffset"
              />
              <defs>
                <linearGradient id="orbGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#34d399" />
                  <stop offset="100%" stop-color="#a3e635" />
                </linearGradient>
              </defs>
            </svg>
            <div class="text-center">
              <p class="text-3xl font-bold tracking-tight sm:text-4xl">{{ ringPct }}</p>
              <p class="text-[11px] font-semibold tracking-widest text-white/55 uppercase">{{ ringLabel }}</p>
            </div>
          </div>
          <dl class="space-y-4">
            <div class="flex items-center gap-3">
              <span class="flex size-10 items-center justify-center rounded-full bg-emerald-400/15">
                <Activity class="size-5 text-emerald-300" />
              </span>
              <div>
                <dt class="text-[11px] font-semibold tracking-widest text-white/50 uppercase">Throughput</dt>
                <dd class="text-lg leading-tight font-bold">{{ lastHourTotal?.toLocaleString() ?? '—' }}<span class="text-xs font-medium text-white/55">/hour</span></dd>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="flex size-10 items-center justify-center rounded-full bg-amber-300/15 text-lg leading-none">⚡</span>
              <div>
                <dt class="text-[11px] font-semibold tracking-widest text-white/50 uppercase">Median reply</dt>
                <dd class="text-lg leading-tight font-bold">{{ medianReply ?? '—' }}<span v-if="medianReply !== null" class="text-xs font-medium text-white/55">s</span></dd>
              </div>
            </div>
          </dl>
        </div>
      </div>

      <!-- curved divider into page -->
      <svg viewBox="0 0 1440 36" preserveAspectRatio="none" class="relative block h-7 w-full text-[#f6f8f7] dark:text-[#0e1318]">
        <path d="M0 36h1440V20C1200 34 960 36 720 28 480 20 240 8 0 18v18Z" fill="currentColor" />
      </svg>
    </section>

    <!-- ══ Stats ══ -->
    <div>
      <StatsCards />
    </div>

    <!-- ══ Bento grid ══ -->
    <div class="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div class="flex flex-col gap-5 xl:col-span-2">
        <MessageTraffic />
        <SessionList />
      </div>
      <div class="flex flex-col gap-5">
        <SystemHealth />
        <RecentActivity />
      </div>
    </div>
  </div>
</template>

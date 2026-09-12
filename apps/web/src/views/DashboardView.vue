<script setup lang="ts">
import { Activity } from '@lucide/vue'
import StatsCards from '@/components/dashboard/StatsCards.vue'
import SessionList from '@/components/dashboard/SessionTable.vue'
import RecentActivity from '@/components/dashboard/RecentActivity.vue'
import SystemHealth from '@/components/dashboard/SystemHealth.vue'
import MessageTraffic from '@/components/dashboard/MessageTraffic.vue'
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
              2 of 3 sessions live
            </span>
            <span class="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200">
              AI mode on
            </span>
          </div>
          <h2 class="mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Good afternoon, Wahyu.
            <span class="text-emerald-300">Your bots are humming.</span>
          </h2>
          <p class="mt-2.5 max-w-md text-sm leading-relaxed text-white/65">
            8,421 messages processed today · 342 in the last hour ·
            1 session needs your attention.
          </p>
        </div>

        <!-- live orb stats -->
        <div class="flex items-center gap-6 lg:gap-8">
          <div class="relative flex size-36 shrink-0 items-center justify-center sm:size-44">
            <svg viewBox="0 0 120 120" class="absolute inset-0 size-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgb(255 255 255 / 0.12)" stroke-width="10" />
              <circle
                cx="60" cy="60" r="52" fill="none" stroke="url(#orbGrad)" stroke-width="10"
                stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="109"
              />
              <defs>
                <linearGradient id="orbGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#34d399" />
                  <stop offset="100%" stop-color="#a3e635" />
                </linearGradient>
              </defs>
            </svg>
            <div class="text-center">
              <p class="text-3xl font-bold tracking-tight sm:text-4xl">67%</p>
              <p class="text-[11px] font-semibold tracking-widest text-white/55 uppercase">healthy</p>
            </div>
          </div>
          <dl class="space-y-4">
            <div class="flex items-center gap-3">
              <span class="flex size-10 items-center justify-center rounded-full bg-emerald-400/15">
                <Activity class="size-5 text-emerald-300" />
              </span>
              <div>
                <dt class="text-[11px] font-semibold tracking-widest text-white/50 uppercase">Throughput</dt>
                <dd class="text-lg leading-tight font-bold">342<span class="text-xs font-medium text-white/55">/hour</span></dd>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="flex size-10 items-center justify-center rounded-full bg-amber-300/15 text-lg leading-none">⚡</span>
              <div>
                <dt class="text-[11px] font-semibold tracking-widest text-white/50 uppercase">Median reply</dt>
                <dd class="text-lg leading-tight font-bold">1.8<span class="text-xs font-medium text-white/55">s</span></dd>
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

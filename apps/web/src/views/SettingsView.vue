<script setup lang="ts">
import {
  AlertTriangle,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Coins,
  Command,
  KeyRound,
  type LucideIcon,
  Moon,
  Palette,
  Phone,
  Save,
  Sun,
  Wand2,
  Wrench,
} from '@lucide/vue'
import { onClickOutside, useColorMode } from '@vueuse/core'
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { RouterLink } from 'vue-router'
import SettingsNav from '@/components/settings/SettingsNav.vue'
import SettingRow from '@/components/settings/SettingRow.vue'
import SettingSection from '@/components/settings/SettingSection.vue'
import SettingSwitch from '@/components/settings/SettingSwitch.vue'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ApiError, api } from '@/lib/api'
import type { DashboardStats, SettingsData, SettingsPatchResult } from '@/lib/api-types'
import { useSessionsStore } from '@/stores/sessions'

interface SettingsSection {
  id: string
  title: string
  icon: LucideIcon
}

const sections: SettingsSection[] = [
  { id: 'profile', title: 'Profil Bot', icon: Bot },
  { id: 'prefixes', title: 'Prefix & Command', icon: Command },
  { id: 'sessions', title: 'Sesi WhatsApp', icon: Phone },
  { id: 'ai', title: 'Perilaku AI', icon: Brain },
  { id: 'tiers', title: 'Limit & Premium', icon: Coins },
  { id: 'maintenance', title: 'Mode Maintenance', icon: Wrench },
  { id: 'appearance', title: 'Tampilan', icon: Palette },
  { id: 'security', title: 'Keamanan Akses', icon: KeyRound },
]

const activeSection = ref<string>('profile')
const sessionsStore = useSessionsStore()

// ── Remote state ────────────────────────────────────────────────
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const saveNote = ref('')
const stats = ref<{ activeSessions: number; registeredUsers: number } | null>(null)

// ── Profile ─────────────────────────────────────────────────────
const profile = ref({
  botName: '',
  ownerJid: '',
  ownerNumber: '',
  version: '',
})

// ── Prefixes ────────────────────────────────────────────────────
const prefixes = ref<string>('')
const commandCooldown = ref<number>(2)

// ── AI Behavior ─────────────────────────────────────────────────
const ai = ref({
  provider: 'openrouter',
  model: '',
  systemPromptName: 'default',
  maxToolRounds: 4,
  streamResponses: true,
  groupAutoReply: true,
  groupMentionOnly: true,
  toolsEnabled: {} as Record<string, boolean>,
})

const toolLabels: Record<string, string> = {
  webSearch: 'Web Search',
  webFetch: 'Web Fetch',
  downloadSocial: 'Social Download',
  downloadYoutube: 'YouTube Download',
  pinterestSearch: 'Pinterest Search',
  pinterestSticker: 'Pinterest Sticker',
}

const toolDescriptions: Record<string, string> = {
  webSearch: 'Cari informasi di web via DuckDuckGo.',
  webFetch: 'Ambil dan baca isi halaman web.',
  downloadSocial: 'Unduh media dari IG / TikTok / FB / X.',
  downloadYoutube: 'Unduh video atau audio YouTube.',
  pinterestSearch: 'Cari gambar di Pinterest.',
  pinterestSticker: 'Buat sticker WhatsApp dari Pinterest.',
}

// ── Tiers ───────────────────────────────────────────────────────
const tiers = ref({
  freeAiChats: 20,
  freeGroupAi: 50,
  freeCommandUses: 20,
  premiumAiChats: 200,
  premiumGroupAi: 500,
  premiumCommandUses: 200,
})

const limitToggles = ref({
  privateAi: true,
  groupAi: true,
  command: true,
})

// ── Maintenance ─────────────────────────────────────────────────
const maintenance = ref({
  enabled: false,
  message: '',
  bypassOwners: true,
})

// ── Appearance ──────────────────────────────────────────────────
const colorMode = useColorMode()
const isDark = computed({
  get: (): boolean => colorMode.value === 'dark',
  set: (val: boolean): void => {
    colorMode.value = val ? 'dark' : 'light'
  },
})

// ── Security ────────────────────────────────────────────────────
const PIN_KEY = 'dashboard.pin'
const security = ref({
  dashboardPin: '',
  blockUnknownJid: false,
  logAllMessages: true,
  rateLimitPerMinute: 30,
})

function readPin(): string {
  try {
    return localStorage.getItem(PIN_KEY) ?? ''
  } catch {
    return ''
  }
}

// ── Load / save ─────────────────────────────────────────────────
async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  saveNote.value = ''
  try {
    const [s, st] = await Promise.all([
      api<SettingsData>('/api/settings'),
      api<DashboardStats>('/api/dashboard/stats').catch(() => null),
    ])
    profile.value = {
      botName: s.profile.botName,
      ownerJid: s.profile.ownerNumbers[0] ?? '',
      ownerNumber: (s.profile.ownerNumbers[0] ?? '').split('@')[0] ?? '',
      version: s.profile.version,
    }
    prefixes.value = s.prefixes.list.join(', ')
    commandCooldown.value = s.prefixes.commandCooldownSec
    ai.value = {
      provider: s.ai.provider,
      model: s.ai.model,
      systemPromptName: s.ai.systemPromptName,
      maxToolRounds: s.ai.maxToolRounds,
      streamResponses: s.ai.streamResponses,
      groupAutoReply: s.ai.groupAutoReply,
      groupMentionOnly: s.ai.groupMentionOnly,
      toolsEnabled: { ...s.ai.toolsEnabled },
    }
    for (const key of Object.keys(toolLabels)) {
      if (!(key in ai.value.toolsEnabled)) ai.value.toolsEnabled[key] = true
    }
    tiers.value = {
      freeAiChats: s.tiers.free.ai,
      freeGroupAi: s.tiers.free.group,
      freeCommandUses: s.tiers.free.command,
      premiumAiChats: s.tiers.premium.ai,
      premiumGroupAi: s.tiers.premium.group,
      premiumCommandUses: s.tiers.premium.command,
    }
    limitToggles.value = {
      privateAi: s.tiers.enforcePrivateAi,
      groupAi: s.tiers.enforceGroupAi,
      command: s.tiers.enforceCommand,
    }
    maintenance.value = {
      enabled: s.maintenance.enabled,
      message: s.maintenance.message,
      bypassOwners: maintenance.value.bypassOwners,
    }
    security.value = {
      dashboardPin: readPin(),
      blockUnknownJid: s.security.blockUnknownJid,
      logAllMessages: s.security.logAllMessages,
      rateLimitPerMinute: s.security.rateLimitPerMinute,
    }
    if (st) stats.value = { activeSessions: st.activeSessions, registeredUsers: st.registeredUsers }
    unsaved.value = false
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Failed to load settings'
  } finally {
    loading.value = false
  }
  if (sessionsStore.items.length === 0) void sessionsStore.fetchAll()
}

// ── Unsaved-changes indicator ──────────────────────────────────
const unsaved = ref<boolean>(false)
function markDirty(): void {
  unsaved.value = true
  saveNote.value = ''
}
function resetAll(): void {
  void load()
}
async function saveAll(): Promise<void> {
  if (saving.value) return
  saving.value = true
  saveNote.value = ''
  try {
    try {
      localStorage.setItem(PIN_KEY, security.value.dashboardPin)
    } catch {
      // PIN browser-lokal opsional — abaikan bila storage diblokir.
    }
    const ownerJid = profile.value.ownerJid.trim() || `${profile.value.ownerNumber.trim()}@s.whatsapp.net`
    const res = await api<SettingsPatchResult>('/api/settings', {
      method: 'PATCH',
      body: {
        profile: { botName: profile.value.botName.trim(), ownerNumbers: [ownerJid] },
        prefixes: {
          list: prefixes.value.split(',').map((p) => p.trim()).filter((p) => p.length > 0),
          commandCooldownSec: commandCooldown.value,
        },
        ai: {
          provider: ai.value.provider,
          model: ai.value.model,
          systemPromptName: ai.value.systemPromptName,
          maxToolRounds: ai.value.maxToolRounds,
          streamResponses: ai.value.streamResponses,
          groupAutoReply: ai.value.groupAutoReply,
          groupMentionOnly: ai.value.groupMentionOnly,
          toolsEnabled: ai.value.toolsEnabled,
        },
        tiers: {
          free: { ai: tiers.value.freeAiChats, group: tiers.value.freeGroupAi, command: tiers.value.freeCommandUses },
          premium: { ai: tiers.value.premiumAiChats, group: tiers.value.premiumGroupAi, command: tiers.value.premiumCommandUses },
          enforcePrivateAi: limitToggles.value.privateAi,
          enforceGroupAi: limitToggles.value.groupAi,
          enforceCommand: limitToggles.value.command,
        },
        maintenance: { enabled: maintenance.value.enabled, message: maintenance.value.message },
        security: {
          blockUnknownJid: security.value.blockUnknownJid,
          logAllMessages: security.value.logAllMessages,
          rateLimitPerMinute: security.value.rateLimitPerMinute,
        },
      },
    })
    unsaved.value = false
    const applied = Object.keys(res.applied).length
    saveNote.value = res.requiresRestart.includes('ai')
      ? `Tersimpan — ${applied} diterapkan live. Perubahan AI butuh restart bot.`
      : `Tersimpan — ${applied} diterapkan live.`
  } catch (e) {
    saveNote.value = `Gagal menyimpan: ${e instanceof ApiError ? e.message : 'network error'}`
  } finally {
    saving.value = false
  }
}

const inputSoft = 'rounded-2xl border-transparent bg-muted/50 focus-visible:ring-emerald-500/40'

// ── Provider dropdown (custom, OS select can't be styled) ────────
const providerOptions = [
  { value: 'openrouter', label: 'OpenRouter', desc: 'Banyak model, satu API key.' },
  { value: 'openai', label: 'OpenAI', desc: 'GPT langsung dari OpenAI.' },
  { value: 'ollama', label: 'Ollama (lokal)', desc: 'Jalan di mesin sendiri.' },
  { value: 'other', label: 'Custom', desc: 'Endpoint OpenAI-compatible.' },
]
const providerOpen = ref(false)
const providerWrap = useTemplateRef<HTMLElement>('providerWrap')
onClickOutside(providerWrap, () => { providerOpen.value = false })
const providerLabel = computed(() => providerOptions.find((o) => o.value === ai.value.provider)?.label ?? ai.value.provider)
function selectProvider(value: string): void {
  ai.value.provider = value
  providerOpen.value = false
  markDirty()
}

onMounted(() => void load())
</script>

<template>
  <div class="space-y-6">
    <!-- Page header -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-eyebrow text-muted-foreground">Configure</p>
        <h2 class="mt-1 text-2xl font-bold tracking-tight">Pengaturan Panel</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Konfigurasi bot, perilaku AI, sesi WhatsApp, dan preferensi tampilan.
        </p>
      </div>
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-150"
        leave-to-class="opacity-0"
      >
        <span
          v-if="unsaved"
          class="inline-flex items-center gap-1.5 self-start rounded-full bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-300"
        >
          <AlertTriangle class="size-3" />
          Perubahan belum disimpan
        </span>
      </Transition>
    </div>

    <!-- Body: nav + content -->
    <div class="flex flex-col gap-5 pb-10 md:flex-row md:items-start">
      <!-- Sticky sub-nav -->
      <SettingsNav
        :sections="sections"
        :active-id="activeSection"
        @select="(id) => (activeSection = id)"
      />

      <!-- Content -->
      <div class="min-w-0 flex-1 space-y-5">
        <!-- ─── Profil Bot ──────────────────────────────────── -->
        <section v-show="activeSection === 'profile'" class="rounded-[24px] bg-card p-6 shadow-soft sm:p-7">
          <div class="flex items-center gap-3">
            <span class="flex size-10 items-center justify-center rounded-full bg-primary/[0.07] text-primary">
              <Bot class="size-5" />
            </span>
            <div>
              <h3 class="text-lg font-bold tracking-tight">Profil Bot</h3>
              <p class="text-xs text-muted-foreground">Identitas utama bot dan informasi owner.</p>
            </div>
          </div>
          <div class="mt-6 space-y-6">
            <div class="flex items-center gap-4 rounded-2xl bg-muted/50 p-4">
              <span class="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-white">
                <Bot class="size-6" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold">{{ profile.botName }}</p>
                <p class="truncate font-mono text-xs text-muted-foreground">{{ profile.ownerJid }}</p>
                <div class="flex flex-wrap gap-1.5 pt-1.5">
                  <span class="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">v{{ profile.version }}</span>
                  <span class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
                    <span class="size-1.5 rounded-full bg-emerald-500" />
                    Aktif
                  </span>
                </div>
              </div>
            </div>

            <SettingRow label="Nama Bot" description="Nama yang ditampilkan pada pesan bot." html-for="bot-name">
              <Input id="bot-name" v-model="profile.botName" :class="inputSoft" @input="markDirty" />
            </SettingRow>
            <SettingRow label="Nomor Owner" description="Nomor WhatsApp owner (format internasional)." html-for="owner-number">
              <Input id="owner-number" v-model="profile.ownerNumber" :class="cn(inputSoft, 'font-mono')" @input="markDirty" />
            </SettingRow>
            <SettingRow label="Owner JID" description="JID lengkap, digunakan untuk whitelist command owner." html-for="owner-jid">
              <Input id="owner-jid" v-model="profile.ownerJid" :class="cn(inputSoft, 'font-mono text-xs')" @input="markDirty" />
            </SettingRow>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-2xl bg-muted/50 p-4">
                <p class="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Sesi Terhubung</p>
                <p class="mt-1 text-sm font-bold">{{ stats ? `${stats.activeSessions} sesi` : '—' }}</p>
              </div>
              <div class="rounded-2xl bg-muted/50 p-4">
                <p class="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Pengguna Terdaftar</p>
                <p class="mt-1 text-sm font-bold">{{ stats ? stats.registeredUsers : '—' }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- ─── Prefix & Command ────────────────────────────── -->
        <section v-show="activeSection === 'prefixes'" class="rounded-[24px] bg-card p-6 shadow-soft sm:p-7">
          <div class="flex items-center gap-3">
            <span class="flex size-10 items-center justify-center rounded-full bg-primary/[0.07] text-primary">
              <Command class="size-5" />
            </span>
            <div>
              <h3 class="text-lg font-bold tracking-tight">Prefix & Command</h3>
              <p class="text-xs text-muted-foreground">Atur karakter pemicu perintah dan jeda antar penggunaan.</p>
            </div>
          </div>
          <div class="mt-6 space-y-6">
            <SettingRow label="Prefix yang Diizinkan" description="Pisahkan dengan koma. Pesan yang diawali karakter ini akan dianggap perintah." html-for="prefixes">
              <Input id="prefixes" v-model="prefixes" placeholder="!, ., #, /" :class="inputSoft" @input="markDirty" />
            </SettingRow>
            <SettingRow label="Cooldown Default" description="Jeda minimum (detik) antar penggunaan perintah yang sama per pengguna." html-for="cooldown">
              <Input id="cooldown" v-model.number="commandCooldown" type="number" min="0" :class="inputSoft" @input="markDirty" />
            </SettingRow>

            <div class="rounded-2xl bg-muted/50 p-4">
              <p class="mb-3 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Contoh Penggunaan</p>
              <div class="flex flex-wrap gap-2">
                <code class="rounded-full bg-background px-3 py-1 font-mono text-xs font-semibold shadow-soft">!ping</code>
                <code class="rounded-full bg-background px-3 py-1 font-mono text-xs font-semibold shadow-soft">.help</code>
                <code class="rounded-full bg-background px-3 py-1 font-mono text-xs font-semibold shadow-soft">#status</code>
                <code class="rounded-full bg-background px-3 py-1 font-mono text-xs font-semibold shadow-soft">/ai</code>
              </div>
            </div>
          </div>
        </section>

        <!-- ─── Sesi WhatsApp ───────────────────────────────── -->
        <section v-show="activeSection === 'sessions'" class="rounded-[24px] bg-card p-6 shadow-soft sm:p-7">
          <div class="flex items-center gap-3">
            <span class="flex size-10 items-center justify-center rounded-full bg-primary/[0.07] text-primary">
              <Phone class="size-5" />
            </span>
            <div>
              <h3 class="text-lg font-bold tracking-tight">Sesi WhatsApp</h3>
              <p class="text-xs text-muted-foreground">Daftar sesi Baileys yang sedang terhubung ke bot.</p>
            </div>
          </div>
          <div class="mt-6 space-y-3">
            <div
              v-for="s in sessionsStore.items.slice(0, 4)"
              :key="s.id"
              class="flex items-center justify-between rounded-2xl bg-muted/50 p-4"
            >
              <div class="flex min-w-0 items-center gap-3">
                <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                  <Phone class="size-4" />
                </span>
                <div class="min-w-0">
                  <p class="truncate font-mono text-sm font-bold">{{ s.phoneNumber ?? s.id }}</p>
                  <p class="truncate font-mono text-xs text-muted-foreground">{{ s.id }}</p>
                </div>
              </div>
              <span
                class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold"
                :class="s.status === 'connected'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                  : s.status === 'pairing'
                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300'
                    : 'bg-muted text-muted-foreground'"
              >
                <span class="relative flex size-2">
                  <span v-if="s.status === 'connected'" class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span class="relative inline-flex size-2 rounded-full" :class="s.status === 'connected' ? 'bg-emerald-500' : s.status === 'pairing' ? 'bg-sky-500' : 'bg-muted-foreground'" />
                </span>
                {{ s.status === 'connected' ? 'Aktif' : s.status }}
              </span>
            </div>
            <p v-if="sessionsStore.items.length === 0" class="px-1 text-xs text-muted-foreground">
              Belum ada sesi — buat dari halaman Sessions.
            </p>
            <p class="px-1 text-xs text-muted-foreground">
              Manajemen sesi lengkap (pairing QR, disconnect, reconnect) tersedia di
              <RouterLink :to="{ name: 'sessions' }" class="font-semibold text-emerald-600 dark:text-emerald-300">halaman Sessions</RouterLink>.
            </p>
          </div>
        </section>

        <!-- ─── Perilaku AI ─────────────────────────────────── -->
        <section v-show="activeSection === 'ai'" class="rounded-[24px] bg-card p-6 shadow-soft sm:p-7">
          <div class="flex items-center gap-3">
            <span class="flex size-10 items-center justify-center rounded-full bg-primary/[0.07] text-primary">
              <Brain class="size-5" />
            </span>
            <div>
              <h3 class="text-lg font-bold tracking-tight">Perilaku AI</h3>
              <p class="text-xs text-muted-foreground">Konfigurasi provider, model, dan tool yang boleh dipakai AI.</p>
            </div>
          </div>
          <div class="mt-6 space-y-8">
            <SettingSection title="Model" description="Pilih provider dan model LLM yang digunakan.">
              <SettingRow label="Provider">
                <div ref="providerWrap" class="relative">
                  <button
                    type="button"
                    @click="providerOpen = !providerOpen"
                    @keydown.escape="providerOpen = false"
                    :aria-expanded="providerOpen"
                    aria-haspopup="listbox"
                    class="flex h-10 w-full items-center justify-between rounded-2xl bg-muted/50 px-3.5 text-sm transition-design outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                  >
                    <span class="font-medium">{{ providerLabel }}</span>
                    <ChevronDown class="size-4 shrink-0 text-muted-foreground transition-design" :class="providerOpen && 'rotate-180'" />
                  </button>
                  <Transition
                    enter-active-class="transition duration-150 ease-out"
                    enter-from-class="opacity-0 -translate-y-1"
                    leave-active-class="transition duration-100 ease-in"
                    leave-to-class="opacity-0 -translate-y-1"
                  >
                    <ul
                      v-if="providerOpen"
                      role="listbox"
                      class="absolute z-20 mt-2 w-full space-y-1 rounded-2xl bg-card p-1.5 shadow-lift"
                    >
                      <li v-for="opt in providerOptions" :key="opt.value">
                        <button
                          type="button"
                          role="option"
                          :aria-selected="ai.provider === opt.value"
                          @click="selectProvider(opt.value)"
                          :class="cn(
                            'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-design',
                            ai.provider === opt.value ? 'bg-emerald-500/10' : 'hover:bg-muted/60',
                          )"
                        >
                          <span>
                            <span class="block text-sm font-semibold">{{ opt.label }}</span>
                            <span class="block text-xs text-muted-foreground">{{ opt.desc }}</span>
                          </span>
                          <Check v-if="ai.provider === opt.value" class="size-4 shrink-0 text-emerald-500" />
                        </button>
                      </li>
                    </ul>
                  </Transition>
                </div>
              </SettingRow>
              <SettingRow label="Model" html-for="ai-model">
                <Input id="ai-model" v-model="ai.model" :class="cn(inputSoft, 'font-mono text-xs')" @input="markDirty" />
              </SettingRow>
              <SettingRow label="System Prompt" html-for="ai-prompt">
                <Input id="ai-prompt" v-model="ai.systemPromptName" :class="inputSoft" @input="markDirty" />
              </SettingRow>
              <SettingRow label="Maks. Putaran Tool" description="Batas maksimum iterasi function calling per pesan (1–10)." html-for="ai-rounds">
                <Input id="ai-rounds" v-model.number="ai.maxToolRounds" type="number" min="0" max="10" :class="inputSoft" @input="markDirty" />
              </SettingRow>
            </SettingSection>

            <SettingSection title="Fitur" description="Aktif/nonaktifkan perilaku AI di chat pribadi dan grup.">
              <SettingSwitch
                v-model="ai.streamResponses"
                label="Streaming respons"
                description="Kirim jawaban AI sedikit demi sedikit menggunakan typing indicator."
                @update:model-value="markDirty"
              />
              <SettingSwitch
                v-model="ai.groupAutoReply"
                label="Auto-reply di grup"
                description="Bot membalas pesan di grup ketika disebut atau di-reply."
                @update:model-value="markDirty"
              />
              <SettingSwitch
                v-model="ai.groupMentionOnly"
                label="Hanya saat di-tag / di-reply"
                description="Jika dimatikan, bot akan membalas semua pesan grup."
                @update:model-value="markDirty"
              />
            </SettingSection>

            <SettingSection title="Tools (Function Calling)" description="Aktifkan/nonaktifkan tool yang dapat dipakai AI.">
              <div class="grid gap-3 sm:grid-cols-2">
                <SettingSwitch
                  v-for="(_, key) in ai.toolsEnabled"
                  :key="key"
                  :model-value="ai.toolsEnabled[key] ?? true"
                  :label="toolLabels[key] ?? key"
                  :description="toolDescriptions[key] ?? 'Aktifkan tool untuk AI.'"
                  @update:model-value="(v) => { ai.toolsEnabled[key] = v; markDirty() }"
                />
              </div>
            </SettingSection>
          </div>
        </section>

        <!-- ─── Limit & Premium ─────────────────────────────── -->
        <section v-show="activeSection === 'tiers'" class="rounded-[24px] bg-card p-6 shadow-soft sm:p-7">
          <div class="flex items-center gap-3">
            <span class="flex size-10 items-center justify-center rounded-full bg-primary/[0.07] text-primary">
              <Coins class="size-5" />
            </span>
            <div>
              <h3 class="text-lg font-bold tracking-tight">Limit & Premium</h3>
              <p class="text-xs text-muted-foreground">Batas harian chat AI dan penggunaan perintah per tier pengguna.</p>
            </div>
          </div>
          <div class="mt-6 space-y-8">
            <SettingSection title="Free">
              <SettingRow label="Chat AI / hari" html-for="tier-free-ai">
                <Input id="tier-free-ai" v-model.number="tiers.freeAiChats" type="number" min="0" :class="inputSoft" @input="markDirty" />
              </SettingRow>
              <SettingRow label="Perintah / hari" html-for="tier-free-cmd">
                <Input id="tier-free-cmd" v-model.number="tiers.freeCommandUses" type="number" min="0" :class="inputSoft" @input="markDirty" />
              </SettingRow>
              <SettingRow label="Grup AI / hari" html-for="tier-free-group">
                <Input id="tier-free-group" v-model.number="tiers.freeGroupAi" type="number" min="0" :class="inputSoft" @input="markDirty" />
              </SettingRow>
            </SettingSection>

            <SettingSection title="Premium">
              <SettingRow label="Chat AI / hari" html-for="tier-premium-ai">
                <Input id="tier-premium-ai" v-model.number="tiers.premiumAiChats" type="number" min="0" :class="inputSoft" @input="markDirty" />
              </SettingRow>
              <SettingRow label="Perintah / hari" html-for="tier-premium-cmd">
                <Input id="tier-premium-cmd" v-model.number="tiers.premiumCommandUses" type="number" min="0" :class="inputSoft" @input="markDirty" />
              </SettingRow>
              <SettingRow label="Grup AI / hari" html-for="tier-premium-group">
                <Input id="tier-premium-group" v-model.number="tiers.premiumGroupAi" type="number" min="0" :class="inputSoft" @input="markDirty" />
              </SettingRow>
            </SettingSection>

            <SettingSection title="Pro">
              <div class="rounded-2xl bg-violet-500/10 p-4">
                <p class="text-sm font-bold text-violet-600 dark:text-violet-300">Unlimited</p>
                <p class="mt-0.5 text-xs text-muted-foreground">Tier Pro tidak dibatasi — limit harian dinonaktifkan di backend dan tidak bisa diubah dari sini.</p>
              </div>
            </SettingSection>

            <SettingSection title="Enforcement" description="Aktif/nonaktifkan penegakan limit harian per fitur.">
              <SettingSwitch
                v-model="limitToggles.privateAi"
                label="Limit AI pribadi"
                description="Batasi chat AI harian di chat pribadi sesuai tier."
                @update:model-value="markDirty"
              />
              <SettingSwitch
                v-model="limitToggles.groupAi"
                label="Limit AI grup"
                description="Batasi auto-reply AI harian di grup sesuai tier."
                @update:model-value="markDirty"
              />
              <SettingSwitch
                v-model="limitToggles.command"
                label="Limit perintah"
                description="Batasi penggunaan perintah harian sesuai tier."
                @update:model-value="markDirty"
              />
            </SettingSection>
          </div>
        </section>

        <!-- ─── Maintenance ─────────────────────────────────── -->
        <section v-show="activeSection === 'maintenance'" class="rounded-[24px] bg-card p-6 shadow-soft sm:p-7">
          <div class="flex items-center gap-3">
            <span class="flex size-10 items-center justify-center rounded-full bg-primary/[0.07] text-primary">
              <Wrench class="size-5" />
            </span>
            <div>
              <h3 class="text-lg font-bold tracking-tight">Mode Maintenance</h3>
              <p class="text-xs text-muted-foreground">Nonaktifkan sementara bot untuk semua pengguna.</p>
            </div>
          </div>
          <div class="mt-6 space-y-6">
            <SettingSection>
              <SettingSwitch
                v-model="maintenance.enabled"
                label="Aktifkan maintenance"
                description="Bot menolak semua pesan kecuali owner (jika bypass diaktifkan)."
                @update:model-value="markDirty"
              />
              <SettingSwitch
                v-model="maintenance.bypassOwners"
                label="Bypass untuk owner"
                description="Owner tetap bisa menggunakan bot walaupun maintenance aktif."
                @update:model-value="markDirty"
              />
            </SettingSection>

            <SettingRow label="Pesan Maintenance" description="Pesan yang dikirim ke pengguna ketika bot dalam mode maintenance." html-for="maint-msg">
              <Input id="maint-msg" v-model="maintenance.message" :class="inputSoft" @input="markDirty" />
            </SettingRow>

            <div class="rounded-2xl bg-amber-500/10 p-4">
              <div class="flex gap-3">
                <AlertTriangle class="size-5 shrink-0 text-amber-500" />
                <div>
                  <p class="text-sm font-bold">Pratinjau Pesan</p>
                  <p class="mt-0.5 text-xs text-muted-foreground italic">"{{ maintenance.message }}"</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ─── Tampilan ────────────────────────────────────── -->
        <section v-show="activeSection === 'appearance'" class="rounded-[24px] bg-card p-6 shadow-soft sm:p-7">
          <div class="flex items-center gap-3">
            <span class="flex size-10 items-center justify-center rounded-full bg-primary/[0.07] text-primary">
              <Palette class="size-5" />
            </span>
            <div>
              <h3 class="text-lg font-bold tracking-tight">Tampilan</h3>
              <p class="text-xs text-muted-foreground">Preferensi visual dashboard.</p>
            </div>
          </div>
          <div class="mt-6 space-y-6">
            <SettingSection>
              <SettingSwitch
                :model-value="isDark"
                :label="isDark ? 'Mode Gelap Aktif' : 'Mode Terang Aktif'"
                :description="isDark
                  ? 'Tampilan menggunakan palet warna gelap.'
                  : 'Tampilan menggunakan palet warna terang.'"
                @update:model-value="(v) => (isDark = v)"
              />
            </SettingSection>

            <div>
              <p class="mb-3 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Pratinjau</p>
              <div class="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  :class="cn(
                    'flex flex-col items-start gap-2 rounded-[20px] bg-muted/50 p-4 text-left transition-design',
                    !isDark && 'bg-emerald-500/10',
                  )"
                  @click="isDark = false"
                >
                  <div class="flex w-full items-center justify-between">
                    <Sun class="size-4 text-amber-500" />
                    <span v-if="!isDark" class="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold text-white">Aktif</span>
                  </div>
                  <div class="w-full space-y-1.5">
                    <div class="h-2 w-3/4 rounded-full bg-foreground" />
                    <div class="h-2 w-1/2 rounded-full bg-muted-foreground/50" />
                  </div>
                  <p class="text-xs font-bold">Light</p>
                </button>

                <button
                  type="button"
                  :class="cn(
                    'flex flex-col items-start gap-2 rounded-[20px] bg-muted/50 p-4 text-left transition-design',
                    isDark && 'bg-emerald-500/10',
                  )"
                  @click="isDark = true"
                >
                  <div class="flex w-full items-center justify-between">
                    <Moon class="size-4 text-sky-400" />
                    <span v-if="isDark" class="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-bold text-white">Aktif</span>
                  </div>
                  <div class="w-full space-y-1.5">
                    <div class="h-2 w-3/4 rounded-full bg-foreground" />
                    <div class="h-2 w-1/2 rounded-full bg-muted-foreground" />
                  </div>
                  <p class="text-xs font-bold">Dark</p>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- ─── Keamanan Akses ──────────────────────────────── -->
        <section v-show="activeSection === 'security'" class="rounded-[24px] bg-card p-6 shadow-soft sm:p-7">
          <div class="flex items-center gap-3">
            <span class="flex size-10 items-center justify-center rounded-full bg-primary/[0.07] text-primary">
              <KeyRound class="size-5" />
            </span>
            <div>
              <h3 class="text-lg font-bold tracking-tight">Keamanan Akses</h3>
              <p class="text-xs text-muted-foreground">PIN dashboard, filter JID, dan logging pesan.</p>
            </div>
          </div>
          <div class="mt-6 space-y-6">
            <SettingRow label="PIN Dashboard" description="PIN lokal peramban ini — disimpan di perangkat, tidak dikirim ke server." html-for="pin">
              <Input id="pin" v-model="security.dashboardPin" type="password" placeholder="••••••" :class="cn(inputSoft, 'font-mono tracking-widest')" @input="markDirty" />
            </SettingRow>
            <SettingRow label="Rate Limit" description="Batas pesan per pengguna per menit." html-for="rate-limit">
              <Input id="rate-limit" v-model.number="security.rateLimitPerMinute" type="number" min="1" :class="inputSoft" @input="markDirty" />
            </SettingRow>

            <SettingSection title="Filter & Logging">
              <SettingSwitch
                v-model="security.blockUnknownJid"
                label="Blokir JID tidak dikenal"
                description="Tolak pesan dari JID yang belum pernah terdaftar di database."
                @update:model-value="markDirty"
              />
              <SettingSwitch
                v-model="security.logAllMessages"
                label="Log semua pesan"
                description="Simpan salinan semua pesan masuk/keluar untuk audit."
                @update:model-value="markDirty"
              />
            </SettingSection>
          </div>
        </section>

        <!-- Footer actions -->
        <p v-if="saveNote || loadError" class="pt-1 text-right text-xs font-semibold text-muted-foreground">{{ saveNote || loadError }}</p>
        <div v-if="activeSection !== 'appearance'" class="flex items-center justify-end gap-2 pt-1">
          <button
            :disabled="!unsaved"
            @click="resetAll"
            class="rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-design hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
          <button
            :disabled="!unsaved || saving"
            @click="saveAll"
            class="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-design hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save class="size-4" />
            {{ saving ? 'Menyimpan…' : 'Simpan Perubahan' }}
          </button>
        </div>
        <div v-else class="flex items-center justify-end gap-2 pt-1">
          <button
            @click="markDirty"
            class="inline-flex items-center gap-2 rounded-full bg-muted px-5 py-2.5 text-sm font-semibold transition-design hover:text-foreground"
          >
            <Wand2 class="size-4" />
            Terapkan Perubahan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

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
import { computed, ref, useTemplateRef } from 'vue'
import SettingsNav from '@/components/settings/SettingsNav.vue'
import SettingRow from '@/components/settings/SettingRow.vue'
import SettingSection from '@/components/settings/SettingSection.vue'
import SettingSwitch from '@/components/settings/SettingSwitch.vue'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

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

// ── Profile ─────────────────────────────────────────────────────
const profile = ref({
  botName: 'Bot-Baileys-AI',
  ownerJid: '6281578794887@s.whatsapp.net',
  ownerNumber: '+62 815-7879-4887',
  version: '2.0.0',
  registeredAt: '2026-05-01',
  lastConnected: '25/7/2026, 19.51.07',
})

// ── Prefixes ────────────────────────────────────────────────────
const prefixes = ref<string>('!, ., #, /')
const commandCooldown = ref<number>(2)

// ── AI Behavior ─────────────────────────────────────────────────
const ai = ref({
  provider: 'openrouter',
  model: 'anthropic/claude-3.5-sonnet',
  systemPromptName: 'default',
  maxToolRounds: 4,
  streamResponses: true,
  groupAutoReply: true,
  groupMentionOnly: true,
  toolsEnabled: {
    webSearch: true,
    webFetch: true,
    downloadSocial: true,
    downloadYoutube: true,
    pinterestSearch: true,
    pinterestSticker: true,
  },
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
  freeCommandUses: 30,
  premiumAiChats: 200,
  premiumCommandUses: 500,
  proAiChats: 1000,
  proCommandUses: 5000,
})

// ── Maintenance ─────────────────────────────────────────────────
const maintenance = ref({
  enabled: false,
  message: '🔧 Bot sedang dalam maintenance. Silakan coba lagi nanti.',
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
const security = ref({
  dashboardPin: '',
  blockUnknownJid: false,
  logAllMessages: true,
  rateLimitPerMinute: 30,
})

// ── Unsaved-changes indicator ──────────────────────────────────
const unsaved = ref<boolean>(false)
function markDirty(): void {
  unsaved.value = true
}
function resetAll(): void {
  unsaved.value = false
}
function saveAll(): void {
  unsaved.value = false
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
                <p class="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Terakhir Terhubung</p>
                <p class="mt-1 text-sm font-bold">{{ profile.lastConnected }}</p>
              </div>
              <div class="rounded-2xl bg-muted/50 p-4">
                <p class="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Tanggal Registrasi</p>
                <p class="mt-1 text-sm font-bold">{{ profile.registeredAt }}</p>
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
            <div class="flex items-center justify-between rounded-2xl bg-muted/50 p-4">
              <div class="flex items-center gap-3">
                <span class="flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                  <Phone class="size-4" />
                </span>
                <div>
                  <p class="text-sm font-bold">main</p>
                  <p class="font-mono text-xs text-muted-foreground">+62 815-7879-4887</p>
                </div>
              </div>
              <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
                <span class="relative flex size-2">
                  <span class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span class="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Aktif
              </span>
            </div>
            <p class="px-1 text-xs text-muted-foreground">
              Manajemen sesi lengkap (pairing QR, disconnect, reconnect) tersedia di halaman Sessions.
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
                  v-model="ai.toolsEnabled[key]"
                  :label="toolLabels[key] ?? key"
                  :description="toolDescriptions[key] ?? 'Aktifkan tool untuk AI.'"
                  @update:model-value="markDirty"
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
            </SettingSection>

            <SettingSection title="Premium">
              <SettingRow label="Chat AI / hari" html-for="tier-premium-ai">
                <Input id="tier-premium-ai" v-model.number="tiers.premiumAiChats" type="number" min="0" :class="inputSoft" @input="markDirty" />
              </SettingRow>
              <SettingRow label="Perintah / hari" html-for="tier-premium-cmd">
                <Input id="tier-premium-cmd" v-model.number="tiers.premiumCommandUses" type="number" min="0" :class="inputSoft" @input="markDirty" />
              </SettingRow>
            </SettingSection>

            <SettingSection title="Pro">
              <SettingRow label="Chat AI / hari" html-for="tier-pro-ai">
                <Input id="tier-pro-ai" v-model.number="tiers.proAiChats" type="number" min="0" :class="inputSoft" @input="markDirty" />
              </SettingRow>
              <SettingRow label="Perintah / hari" html-for="tier-pro-cmd">
                <Input id="tier-pro-cmd" v-model.number="tiers.proCommandUses" type="number" min="0" :class="inputSoft" @input="markDirty" />
              </SettingRow>
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
            <SettingRow label="PIN Dashboard" description="PIN akan diminta setiap kali dashboard dibuka di peramban baru." html-for="pin">
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
        <div v-if="activeSection !== 'appearance'" class="flex items-center justify-end gap-2 pt-1">
          <button
            :disabled="!unsaved"
            @click="resetAll"
            class="rounded-full px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-design hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
          <button
            :disabled="!unsaved"
            @click="saveAll"
            class="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-design hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save class="size-4" />
            Simpan Perubahan
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

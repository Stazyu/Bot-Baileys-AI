<script setup lang="ts">
import { ref, computed } from 'vue'
import { Brain, MessageSquareText, Search, Send, ChevronLeft } from '@lucide/vue'
import { cn } from '@/lib/utils'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'

// ── Types ──────────────────────────────────────────────────────────
interface ChatMessage {
  id: string
  fromMe: boolean
  from: string
  pushName: string
  body: string
  timestamp: Date
}

interface Conversation {
  id: string
  sessionId: string
  userJid: string
  pushName: string
  lastMessage: string
  lastMessageAt: Date
  unread: number
  aiMode: boolean
  messages: ChatMessage[]
}

// ── Mock Data ──────────────────────────────────────────────────────
const conversations = ref<Conversation[]>([
  {
    id: 'conv-1',
    sessionId: 'Wahyu',
    userJid: '6281234567890@s.whatsapp.net',
    pushName: 'Budi Santoso',
    lastMessage: 'Tolong bikin stiker dari gambar ini',
    lastMessageAt: new Date(Date.now() - 2 * 60 * 1000),
    unread: 0,
    aiMode: true,
    messages: [
      { id: 'm1', fromMe: false, from: '6281234567890@s.whatsapp.net', pushName: 'Budi Santoso', body: 'Halo bot, bisa bantu?', timestamp: new Date(Date.now() - 10 * 60 * 1000) },
      { id: 'm2', fromMe: true, from: 'bot', pushName: 'Bot', body: 'Halo Budi! Ada yang bisa saya bantu? 😊', timestamp: new Date(Date.now() - 9 * 60 * 1000) },
      { id: 'm3', fromMe: false, from: '6281234567890@s.whatsapp.net', pushName: 'Budi Santoso', body: 'Tolong bikin stiker dari gambar ini', timestamp: new Date(Date.now() - 2 * 60 * 1000) },
    ],
  },
  {
    id: 'conv-2',
    sessionId: 'Wahyu',
    userJid: '6289876543210@s.whatsapp.net',
    pushName: 'Siti Rahayu',
    lastMessage: 'Cariin resep nasi goreng dong',
    lastMessageAt: new Date(Date.now() - 15 * 60 * 1000),
    unread: 2,
    aiMode: true,
    messages: [
      { id: 'm4', fromMe: false, from: '6289876543210@s.whatsapp.net', pushName: 'Siti Rahayu', body: 'Bot, kamu bisa masak gak?', timestamp: new Date(Date.now() - 30 * 60 * 1000) },
      { id: 'm5', fromMe: true, from: 'bot', pushName: 'Bot', body: 'Halo Siti! Saya bisa bantu cari resep kok. Mau resep apa?', timestamp: new Date(Date.now() - 29 * 60 * 1000) },
      { id: 'm6', fromMe: false, from: '6289876543210@s.whatsapp.net', pushName: 'Siti Rahayu', body: 'Cariin resep nasi goreng dong', timestamp: new Date(Date.now() - 15 * 60 * 1000) },
      { id: 'm7', fromMe: false, from: '6289876543210@s.whatsapp.net', pushName: 'Siti Rahayu', body: 'Yang simpel aja ya', timestamp: new Date(Date.now() - 14 * 60 * 1000) },
    ],
  },
  {
    id: 'conv-3',
    sessionId: 'Bot Support',
    userJid: '6283334445556@s.whatsapp.net',
    pushName: 'Andi Pratama',
    lastMessage: 'Download video TikTok ini https://vt.tiktok.com/...',
    lastMessageAt: new Date(Date.now() - 45 * 60 * 1000),
    unread: 0,
    aiMode: false,
    messages: [
      { id: 'm8', fromMe: false, from: '6283334445556@s.whatsapp.net', pushName: 'Andi Pratama', body: 'Hai, bisa download TikTok gak?', timestamp: new Date(Date.now() - 50 * 60 * 1000) },
      { id: 'm9', fromMe: true, from: 'bot', pushName: 'Bot', body: 'Bisa banget! Kirim link-nya ya 🎵', timestamp: new Date(Date.now() - 49 * 60 * 1000) },
      { id: 'm10', fromMe: false, from: '6283334445556@s.whatsapp.net', pushName: 'Andi Pratama', body: 'Download video TikTok ini https://vt.tiktok.com/...', timestamp: new Date(Date.now() - 45 * 60 * 1000) },
    ],
  },
  {
    id: 'conv-4',
    sessionId: 'Bot Support',
    userJid: '6285556667778@s.whatsapp.net',
    pushName: 'Dewi Lestari',
    lastMessage: 'Pukul berapa sekarang di Jakarta? 😂',
    lastMessageAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    unread: 0,
    aiMode: true,
    messages: [
      { id: 'm11', fromMe: false, from: '6285556667778@s.whatsapp.net', pushName: 'Dewi Lestari', body: 'Bot, lagi ngapain?', timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000) },
      { id: 'm12', fromMe: true, from: 'bot', pushName: 'Bot', body: 'Lagi santai nih Dewi. Ada yang bisa dibantu?', timestamp: new Date(Date.now() - 3.9 * 60 * 60 * 1000) },
      { id: 'm13', fromMe: false, from: '6285556667778@s.whatsapp.net', pushName: 'Dewi Lestari', body: 'Pukul berapa sekarang di Jakarta? 😂', timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000) },
      { id: 'm14', fromMe: true, from: 'bot', pushName: 'Bot', body: 'Sekarang pukul 15:00 WIB, Dewi. Ngapain nanya jam? HAHAHA', timestamp: new Date(Date.now() - 2.9 * 60 * 60 * 1000) },
    ],
  },
  {
    id: 'conv-5',
    sessionId: 'Wahyu',
    userJid: '6284443332221@s.whatsapp.net',
    pushName: 'Rizky Fauzan',
    lastMessage: 'Cari gambar pemandangan di Pinterest',
    lastMessageAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    unread: 1,
    aiMode: true,
    messages: [
      { id: 'm15', fromMe: false, from: '6284443332221@s.whatsapp.net', pushName: 'Rizky Fauzan', body: 'Bot cariin gambar pemandangan dong', timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      { id: 'm16', fromMe: true, from: 'bot', pushName: 'Bot', body: 'Oke Rizky, saya cari di Pinterest ya. Sebentar...', timestamp: new Date(Date.now() - 5.9 * 60 * 60 * 1000) },
      { id: 'm17', fromMe: true, from: 'bot', pushName: 'Bot', body: 'Nih beberapa hasilnya: [3 gambar pemandangan]', timestamp: new Date(Date.now() - 5.8 * 60 * 60 * 1000) },
      { id: 'm18', fromMe: false, from: '6284443332221@s.whatsapp.net', pushName: 'Rizky Fauzan', body: 'Cari gambar pemandangan di Pinterest', timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000) },
    ],
  },
])

// ── State ──────────────────────────────────────────────────────────
const selectedConvId = ref<string | null>(null)
const searchQuery = ref('')
const replyText = ref('')
const isSending = ref(false)

const selectedConv = computed(() =>
  conversations.value.find((c) => c.id === selectedConvId.value) ?? null,
)

const filteredConversations = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return conversations.value
  return conversations.value.filter(
    (c) =>
      c.pushName.toLowerCase().includes(q) ||
      c.userJid.toLowerCase().includes(q) ||
      c.lastMessage.toLowerCase().includes(q),
  )
})

const totalUnread = computed(() =>
  conversations.value.reduce((sum, c) => sum + c.unread, 0),
)

// ── Helpers ────────────────────────────────────────────────────────
function selectConversation(id: string) {
  selectedConvId.value = id
  // mark as read
  const conv = conversations.value.find((c) => c.id === id)
  if (conv) conv.unread = 0
}

function formatTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Baru saja'
  if (diffMin < 60) return `${diffMin}m`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}j`
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function sendReply() {
  const text = replyText.value.trim()
  if (!text || !selectedConv.value) return

  isSending.value = true

  // simulate sending
  setTimeout(() => {
    const newMsg: ChatMessage = {
      id: `m${Date.now()}`,
      fromMe: true,
      from: 'bot',
      pushName: 'Bot',
      body: text,
      timestamp: new Date(),
    }
    selectedConv.value!.messages.push(newMsg)
    selectedConv.value!.lastMessage = text
    selectedConv.value!.lastMessageAt = new Date()
    replyText.value = ''
    isSending.value = false
  }, 400)
}

function onReplyKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendReply()
  }
}

function autoresize(e: Event) {
  const t = e.target as HTMLTextAreaElement
  t.style.height = 'auto'
  t.style.height = `${Math.min(t.scrollHeight, 128)}px`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-eyebrow text-muted-foreground">Inbox</p>
        <h2 class="mt-1 text-2xl font-bold tracking-tight">Chat Logs</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Conversations between users and the bot — view and reply.
        </p>
      </div>
      <span
        v-if="totalUnread > 0"
        class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300"
      >
        <span class="size-1.5 rounded-full bg-emerald-500" />
        {{ totalUnread }} unread
      </span>
    </div>

    <!-- Chat Layout: Conversation List + Thread -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- LEFT: Conversation List -->
      <section
        class="flex flex-col rounded-[24px] bg-card p-3 shadow-soft lg:col-span-4 xl:col-span-4"
        :class="selectedConvId ? 'hidden lg:flex' : 'flex'"
        style="min-height: 620px; max-height: calc(100vh - 220px);"
      >
        <div class="relative px-1 pt-1 pb-3">
          <Search class="absolute top-1/2 left-4 size-4 -translate-y-[calc(50%+6px)] text-muted-foreground" />
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Cari percakapan…"
            class="w-full rounded-full bg-muted/60 py-2.5 pr-4 pl-11 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
        <ScrollArea class="min-h-0 flex-1">
          <div v-if="filteredConversations.length === 0" class="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MessageSquareText class="size-10 mb-3 opacity-40" />
            <p class="text-sm">Tidak ada percakapan</p>
          </div>
          <ul class="space-y-1 pb-1">
            <li
              v-for="conv in filteredConversations"
              :key="conv.id"
              @click="selectConversation(conv.id)"
              :class="cn(
                'flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 transition-design',
                selectedConvId === conv.id ? 'bg-muted' : 'hover:bg-muted/60',
              )"
            >
              <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] text-xs font-bold text-primary">
                {{ initials(conv.pushName) }}
              </span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-sm font-semibold">{{ conv.pushName }}</span>
                  <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">{{ formatTime(conv.lastMessageAt) }}</span>
                </div>
                <div class="mt-0.5 flex items-center justify-between gap-2">
                  <span class="truncate text-xs text-muted-foreground">{{ conv.lastMessage }}</span>
                  <span v-if="conv.unread > 0" class="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white tabular-nums">
                    {{ conv.unread }}
                  </span>
                </div>
                <div class="mt-1.5 flex items-center gap-1.5">
                  <span v-if="conv.aiMode" class="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-300">
                    <Brain class="size-2.5" />
                    AI
                  </span>
                  <span class="text-[10px] text-muted-foreground">{{ conv.sessionId }}</span>
                </div>
              </div>
            </li>
          </ul>
        </ScrollArea>
      </section>

      <!-- RIGHT: Chat Thread -->
      <section
        class="flex-col rounded-[24px] bg-card p-4 shadow-soft sm:p-5 lg:col-span-8 xl:col-span-8"
        :class="selectedConvId ? 'flex' : 'hidden lg:flex'"
        style="min-height: 620px; max-height: calc(100vh - 220px);"
      >
        <!-- Empty State -->
        <div v-if="!selectedConv" class="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <span class="flex size-16 items-center justify-center rounded-full bg-muted">
            <MessageSquareText class="size-8 opacity-40" />
          </span>
          <p class="text-sm font-semibold text-foreground">Pilih percakapan</p>
          <p class="text-xs">Klik salah satu chat di panel kiri untuk melihat pesan.</p>
        </div>

        <!-- Thread with messages -->
        <template v-else>
          <!-- Thread Header -->
          <div class="flex items-center gap-3 pb-4">
            <button
              class="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-design hover:bg-muted hover:text-foreground lg:hidden"
              @click="selectedConvId = null"
              aria-label="Back to conversations"
            >
              <ChevronLeft class="size-5" />
            </button>
            <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] text-xs font-bold text-primary">
              {{ initials(selectedConv.pushName) }}
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-bold">{{ selectedConv.pushName }}</p>
              <p class="truncate font-mono text-[11px] text-muted-foreground">{{ selectedConv.userJid }}</p>
            </div>
            <span v-if="selectedConv.aiMode" class="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
              <Brain class="size-3" />
              AI Mode
            </span>
          </div>

          <!-- Messages -->
          <ScrollArea class="min-h-0 flex-1">
            <div class="flex flex-col gap-1.5 px-1 py-2">
              <div
                v-for="msg in selectedConv.messages"
                :key="msg.id"
                class="flex max-w-[80%] gap-2.5"
                :class="msg.fromMe ? 'self-end flex-row-reverse' : 'self-start'"
              >
                <span
                  class="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  :class="msg.fromMe ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-muted text-muted-foreground'"
                >
                  {{ msg.fromMe ? 'BT' : initials(msg.pushName) }}
                </span>
                <div class="min-w-0">
                  <div
                    class="px-4 py-2.5 text-sm leading-relaxed"
                    :class="msg.fromMe
                      ? 'rounded-[20px] rounded-tr-lg bg-emerald-500 text-white'
                      : 'rounded-[20px] rounded-tl-lg bg-muted'"
                  >
                    {{ msg.body }}
                  </div>
                  <div class="mt-1 flex items-center gap-2" :class="msg.fromMe ? 'justify-end' : 'justify-start'">
                    <span class="text-[10px] tabular-nums text-muted-foreground">{{ formatMessageTime(msg.timestamp) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>

          <!-- Reply Input -->
          <div class="pt-3">
            <div class="flex items-end gap-2 rounded-[24px] bg-muted/60 p-2 pl-4">
              <textarea
                v-model="replyText"
                placeholder="Ketik balasan…"
                rows="1"
                class="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
                @keydown="onReplyKeydown"
                @input="autoresize"
              />
              <button
                :disabled="!replyText.trim() || isSending"
                @click="sendReply"
                aria-label="Send reply"
                class="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-design hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send class="size-4" :class="{ 'animate-pulse': isSending }" />
              </button>
            </div>
            <p class="mt-2 ml-2 text-[11px] text-muted-foreground">
              <template v-if="selectedConv.aiMode">
                Balasan dikirim sebagai bot — user menerima pesan dari nomor WA.
              </template>
              <template v-else>
                User ini tidak dalam AI mode. Balasan hanya simulasi.
              </template>
            </p>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

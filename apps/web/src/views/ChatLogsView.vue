<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { MessageSquareText, Search, Send, ChevronLeft } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { ApiError, api } from '@/lib/api'
import type { ChatMessage, Conversation } from '@/lib/api-types'
import { formatClock, initials, shortJid, timeAgo } from '@/lib/format'
import Skeleton from '@/components/ui/skeleton/Skeleton.vue'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'

const conversations = ref<Conversation[]>([])
const loading = ref(true)
const error = ref('')

const selectedConvId = ref<string | null>(null)
const searchQuery = ref('')
const replyText = ref('')
const isSending = ref(false)
const sendError = ref('')

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const res = await api<{ items: Conversation[]; total: number }>('/api/conversations', { query: { limit: 20 } })
    conversations.value = res.items
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Failed to load conversations'
  } finally {
    loading.value = false
  }
}

function retry(): void {
  void load()
}

onMounted(() => void load())

const selectedConv = computed(() =>
  conversations.value.find((c) => c.id === selectedConvId.value) ?? null,
)
const threadScroll = ref<{ $el: HTMLElement } | null>(null)

function threadViewport(): HTMLElement | null {
  const root = threadScroll.value?.$el
  return root?.querySelector('[data-reka-scroll-area-viewport]') ?? null
}

function scrollThreadToBottom(): void {
  const view = threadViewport()
  if (view) view.scrollTop = view.scrollHeight
}

// Buka thread → selalu paling bawah. Pesan baru → ikut ke bawah hanya bila
// user sudah di dekat bawah (tidak merampas posisi baca riwayat).
watch(selectedConvId, () => {
  void nextTick(() => scrollThreadToBottom())
})
watch(() => selectedConv.value?.messages.length ?? 0, () => {
  const view = threadViewport()
  if (!view) return
  const nearBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 120
  if (nearBottom) void nextTick(() => scrollThreadToBottom())
})

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

function selectConversation(id: string) {
  selectedConvId.value = id
}

function messageTime(msg: ChatMessage): string {
  return formatClock(msg.timestamp ?? msg.createdAt)
}

async function sendReply() {
  const text = replyText.value.trim()
  const conv = selectedConv.value
  if (!text || !conv || isSending.value) return

  isSending.value = true
  sendError.value = ''
  try {
    const res = await api<{ sent: boolean; id: string | null }>(`/api/sessions/${conv.sessionId}/send`, {
      method: 'POST',
      body: { to: conv.userJid, text },
    })
    const now = new Date().toISOString()
    const newMsg: ChatMessage = {
      id: res.id ?? `local-${Date.now()}`,
      fromMe: true,
      pushName: 'Bot',
      body: text,
      timestamp: now,
      createdAt: now,
    }
    conv.messages.push(newMsg)
    conv.lastMessage = text
    conv.lastMessageAt = now
    replyText.value = ''
  } catch (e) {
    sendError.value = e instanceof ApiError ? e.message : 'Failed to send reply'
  } finally {
    isSending.value = false
  }
}

function onReplyKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void sendReply()
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
    </div>

    <div v-if="loading" class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Skeleton class="min-h-[620px] rounded-[24px] lg:col-span-4" />
      <Skeleton class="hidden min-h-[620px] rounded-[24px] lg:col-span-8 lg:block" />
    </div>
    <div v-else-if="error && conversations.length === 0" class="rounded-[24px] bg-card p-10 text-center shadow-soft">
      <p class="text-base font-bold">Couldn't load conversations</p>
      <p class="mt-1 text-sm text-muted-foreground">{{ error }}</p>
      <button @click="retry" class="mt-5 rounded-full bg-muted px-5 py-2 text-xs font-semibold transition-design hover:text-foreground">
        Retry
      </button>
    </div>

    <!-- Chat Layout: Conversation List + Thread -->
    <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- LEFT: Conversation List -->
      <section
        class="flex flex-col rounded-[24px] bg-card p-3 shadow-soft lg:col-span-4 xl:col-span-4"
        :class="selectedConvId ? 'hidden lg:flex' : 'flex'"
        style="height: max(620px, calc(100vh - 220px));"
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
                  <span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">{{ timeAgo(conv.lastMessageAt) }}</span>
                </div>
                <div class="mt-0.5 flex items-center justify-between gap-2">
                  <span class="truncate text-xs text-muted-foreground">{{ conv.lastMessage }}</span>
                </div>
                <div class="mt-1.5 flex items-center gap-1.5">
                  <span class="font-mono text-[10px] text-muted-foreground">{{ shortJid(conv.userJid) }}</span>
                  <span aria-hidden="true" class="text-[10px] text-muted-foreground">·</span>
                  <span class="text-[10px] text-muted-foreground">{{ conv.sessionId }}</span>
                </div>
              </div>
            </li>
          </ul>
        </ScrollArea>
      </section>

      <!-- RIGHT: Chat Thread -->
      <section
        class="flex-col overflow-hidden rounded-[24px] bg-card p-4 shadow-soft sm:p-5 lg:col-span-8 xl:col-span-8"
        :class="selectedConvId ? 'flex' : 'hidden lg:flex'"
        style="height: max(620px, calc(100vh - 220px));"
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
          </div>

          <!-- Messages -->
          <ScrollArea ref="threadScroll" type="always" class="min-h-0 flex-1">
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
                    class="px-4 py-2.5 text-sm leading-relaxed break-words [overflow-wrap:anywhere]"
                    :class="msg.fromMe
                      ? 'rounded-[20px] rounded-tr-lg bg-emerald-500 text-white'
                      : 'rounded-[20px] rounded-tl-lg bg-muted'"
                  >
                    {{ msg.body }}
                  </div>
                  <div class="mt-1 flex items-center gap-2" :class="msg.fromMe ? 'justify-end' : 'justify-start'">
                    <span class="text-[10px] tabular-nums text-muted-foreground">{{ messageTime(msg) }}</span>
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
            <p v-if="sendError" class="mt-2 ml-2 text-[11px] font-semibold text-rose-500">{{ sendError }}</p>
            <p v-else class="mt-2 ml-2 text-[11px] text-muted-foreground">
              Balasan dikirim sebagai bot — user menerima pesan dari nomor WA.
            </p>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

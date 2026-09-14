<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { KeyRound } from '@lucide/vue'
import { api, getToken, isUnauthorized, setToken } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Input from '@/components/ui/input/Input.vue'

/** Menawarkan input token saat API menjawab 401 (panel pribadi, token di env server). */
const needsToken = ref(false)
const tokenInput = ref('')
const hint = ref('')

async function probe(): Promise<void> {
  try {
    await api<unknown[]>('/api/sessions')
    needsToken.value = false
    hint.value = ''
  } catch (error) {
    if (isUnauthorized(error)) {
      needsToken.value = true
      hint.value = getToken()
        ? 'Token tersimpan ditolak server — masukkan token baru.'
        : 'API meminta token (DASHBOARD_API_TOKEN di server).'
    }
  }
}

function save(): void {
  const token = tokenInput.value.trim()
  if (!token) return
  setToken(token)
  tokenInput.value = ''
  void probe()
}

onMounted(() => void probe())
</script>

<template>
  <Dialog :open="needsToken">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <span class="flex size-11 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300">
          <KeyRound class="size-5" />
        </span>
        <DialogTitle class="mt-3">API token required</DialogTitle>
        <DialogDescription>{{ hint }}</DialogDescription>
      </DialogHeader>
      <Input
        v-model="tokenInput"
        type="password"
        placeholder="Paste dashboard token…"
        class="rounded-2xl font-mono"
        @keydown.enter="save"
      />
      <DialogFooter>
        <button
          @click="save"
          :disabled="!tokenInput.trim()"
          class="w-full rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-design hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Connect
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Info } from '@lucide/vue'
import Card from '@/components/ui/card/Card.vue'
import CardHeader from '@/components/ui/card/CardHeader.vue'
import CardTitle from '@/components/ui/card/CardTitle.vue'
import CardDescription from '@/components/ui/card/CardDescription.vue'
import CardContent from '@/components/ui/card/CardContent.vue'
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()
const pageTitle = computed(() => {
  const name = route.name as string
  const titles: Record<string, string> = {
    'sessions': 'Sessions',
    'users': 'Users',
    'ai-logs': 'AI Chat Logs',
    'command-logs': 'Logs',
    'downloads': 'Media Downloads',
    'settings': 'Settings',
  }
  return titles[name] ?? 'Page'
})
</script>

<template>
  <div>
    <h2 class="text-display text-foreground">{{ pageTitle }}</h2>
    <p class="text-body text-muted-foreground mt-1">This page is a placeholder — content coming soon.</p>

    <Card class="mt-6 max-w-md">
      <CardContent class="flex items-center gap-4 p-6">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Info class="size-5 text-muted-foreground" />
        </div>
        <div>
          <p class="text-sm font-medium text-foreground">Sample Page</p>
          <p class="text-xs text-muted-foreground">
            This view will be integrated with live backend data in a future update.
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

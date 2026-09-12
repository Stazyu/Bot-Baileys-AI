<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import Separator from '@/components/ui/separator/Separator.vue'
import { ScrollArea } from '@/components/ui/scroll-area'
</script>

<template>
  <SidebarProvider class="h-svh overflow-hidden">
    <AppSidebar />

    <SidebarInset class="overflow-hidden md:peer-data-[variant=inset]:rounded-[28px]">
      <header class="flex h-16 shrink-0 items-center gap-3 border-b border-transparent bg-background/80 px-4 backdrop-blur sm:px-6">
        <SidebarTrigger class="-ml-1 rounded-full text-muted-foreground transition-design hover:bg-muted hover:text-foreground" />
        <Separator orientation="vertical" class="mr-1 h-5 bg-border" />
        <span class="text-heading text-foreground/90">Bot-Baileys-AI</span>
        <div class="ml-auto flex items-center gap-2">
          <span class="hidden items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-600 sm:inline-flex dark:text-emerald-300">
            <span class="relative flex size-2">
              <span class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span class="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            Bot online
          </span>
        </div>
      </header>

      <ScrollArea class="flex-1 min-h-0 bg-[#f6f8f7] dark:bg-background">
        <div class="w-full space-y-6 p-4 pt-5 sm:px-8 sm:py-6">
          <RouterView />
        </div>
      </ScrollArea>
    </SidebarInset>
  </SidebarProvider>
</template>

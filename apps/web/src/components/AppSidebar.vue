<script setup lang="ts">
import {
  Bot,
  Command,
  Download,
  LayoutDashboard,
  MessageSquareText,
  Phone,
  Settings,
  Users,
  type LucideIcon,
} from '@lucide/vue'
import { useRoute } from 'vue-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

interface NavItem {
  title: string
  icon: LucideIcon
  route: string
}

const mainItems: NavItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, route: '/' },
  { title: 'Sessions', icon: Phone, route: '/sessions' },
  { title: 'Users', icon: Users, route: '/users' },
  { title: 'Chat Logs', icon: MessageSquareText, route: '/ai-logs' },
]

const toolsItems: NavItem[] = [
  { title: 'Command Logs', icon: Command, route: '/command-logs' },
  { title: 'Media Downloads', icon: Download, route: '/downloads' },
]

const systemItems: NavItem[] = [
  { title: 'Settings', icon: Settings, route: '/settings' },
]

const route = useRoute()

const isActive = (itemRoute: string): boolean => {
  if (itemRoute === '/') return route.path === '/'
  return route.path.startsWith(itemRoute)
}

const itemClass = (itemRoute: string): string =>
  cn(
    'rounded-2xl px-3 py-2.5 font-medium transition-design',
    isActive(itemRoute)
      ? 'bg-emerald-500/10 text-foreground hover:bg-emerald-500/15 hover:text-foreground'
      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
  )

const iconClass = (itemRoute: string): string =>
  cn('size-[18px]', isActive(itemRoute) ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground')

const groups: { label: string; items: NavItem[] }[] = [
  { label: 'Monitoring', items: mainItems },
  { label: 'Tools', items: toolsItems },
  { label: 'System', items: systemItems },
]
</script>

<template>
  <Sidebar collapsible="icon" variant="inset">
    <!-- Brand -->
    <SidebarHeader class="px-3 pt-3">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child class="rounded-2xl px-2 py-2 hover:bg-muted/60">
            <RouterLink to="/">
              <div class="flex aspect-square size-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white">
                <Bot class="size-4" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span class="truncate font-bold tracking-tight">Bot-Baileys-AI</span>
                <span class="truncate text-xs text-muted-foreground">Control center</span>
              </div>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <!-- Nav -->
    <SidebarContent class="gap-6 px-3">
      <SidebarGroup v-for="group in groups" :key="group.label" class="p-0">
        <SidebarGroupLabel class="px-3 pb-1.5 text-[11px] font-bold tracking-[0.14em] text-muted-foreground/70 uppercase">
          {{ group.label }}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu class="gap-1">
            <SidebarMenuItem v-for="item in group.items" :key="item.title">
              <SidebarMenuButton as-child :is-active="isActive(item.route)" :tooltip="item.title" :class="itemClass(item.route)">
                <RouterLink :to="item.route">
                  <component :is="item.icon" :class="iconClass(item.route)" />
                  <span>{{ item.title }}</span>
                  <span
                    v-if="isActive(item.route)"
                    aria-hidden="true"
                    class="ml-auto size-1.5 shrink-0 rounded-full bg-emerald-500 group-data-[collapsible=icon]:hidden"
                  />
                </RouterLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <!-- Operator -->
    <SidebarFooter class="p-3">
      <div class="flex items-center gap-2.5 rounded-2xl bg-muted/50 px-3 py-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-xs font-bold text-white">
          W
        </span>
        <div class="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
          <span class="truncate text-[13px] font-semibold">Wahyu</span>
          <span class="truncate text-[11px] text-muted-foreground">Admin · v2.0.0</span>
        </div>
      </div>
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>

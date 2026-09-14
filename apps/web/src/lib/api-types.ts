/** Kontrak respons Dashboard API (mirror src/server/routes). */

export interface HealthSnapshot {
  status: 'ok' | 'degraded';
  uptimeSec: number;
  cpuPct: number;
  memPct: number;
  memUsedMB: number;
  queueDepth: number;
  replyP50Ms: number | null;
  sessionsConnected: number;
  sessionsTotal: number;
  time: string;
}

export interface DashboardStats {
  activeSessions: number;
  registeredUsers: number;
  messagesToday: number;
  aiCallsToday: number;
  sparks: { sessions: number[]; users: number[]; messages: number[]; ai: number[] };
}

export interface TrafficData {
  labels: string[];
  incoming: number[];
  outgoing: number[];
  totalIn: number;
  totalOut: number;
  truncated: boolean;
}

export type SessionStatus = 'connected' | 'connecting' | 'disconnected' | 'pairing';

export interface SessionItem {
  id: string;
  phoneNumber: string | null;
  status: SessionStatus;
  isActive: boolean;
  uptime: string;
  lastActive: string | null;
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  messagesIn: number;
  messagesOut: number;
}

export interface SessionDetail extends SessionItem {
  lastQrAt: string | null;
}

export interface SessionQr {
  sessionId: string;
  status: SessionStatus;
  dataUrl: string | null;
  lastQrAt: string | null;
}

export type LinkEvent =
  | { type: 'qr'; sessionId: string; dataUrl: string | null }
  | { type: 'pairingCode'; sessionId: string; code: string }
  | { type: 'status'; sessionId: string; status: string }
  | { type: 'error'; message: string };

export type ActivityType = 'message' | 'command' | 'ai' | 'session' | 'download' | 'error';

export interface ActivityItem {
  id: string;
  type: ActivityType;
  sessionId: string | null;
  session: string | null;
  detail: string;
  createdAt: string;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}

export interface UserItem {
  userId: string;
  pushName: string | null;
  sessionId: string | null;
  tier: string;
  status: string;
  isBlocked: boolean;
  aiModeEnabled: boolean;
  messageCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface UsersPage {
  items: UserItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UsersSummary {
  total: number;
  active: number;
  inactive: number;
  byTier: Record<string, number>;
  aiMode: number;
}

export interface ChatMessage {
  id: string;
  fromMe: boolean;
  pushName: string;
  body: string;
  timestamp: string | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  sessionId: string;
  userJid: string;
  pushName: string;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
  messages: ChatMessage[];
}

export interface CommandItem {
  id: string;
  sessionId: string | null;
  userId: string | null;
  command: string;
  args: string | null;
  success: boolean;
  latencyMs: number | null;
  createdAt: string;
}

export interface CommandsPage {
  items: CommandItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: { total: number; success: number; error: number; avgLatencyMs: number; top: { command: string; count: number }[] };
}

export interface SettingsData {
  profile: { botName: string; ownerNumbers: string[]; version: string };
  prefixes: { list: string[]; commandCooldownSec: number };
  ai: {
    provider: string;
    model: string;
    systemPromptName: string;
    maxToolRounds: number;
    streamResponses: boolean;
    groupAutoReply: boolean;
    groupMentionOnly: boolean;
    toolsEnabled: Record<string, boolean>;
  };
  tiers: {
    free: { ai: number; group: number; command: number };
    premium: { ai: number; group: number; command: number };
    enforcePrivateAi: boolean;
    enforceGroupAi: boolean;
    enforceCommand: boolean;
  };
  maintenance: { enabled: boolean; message: string };
  security: { blockUnknownJid: boolean; logAllMessages: boolean; rateLimitPerMinute: number };
}

export interface SettingsPatchResult {
  saved: boolean;
  applied: Record<string, boolean>;
  requiresRestart: string[];
  pendingEnforcement: string[];
}

export interface ToolCallItem {
  id: string;
  sessionId: string | null;
  userId: string | null;
  tool: string;
  args: string | null;
  success: boolean;
  cached: boolean;
  latencyMs: number | null;
  createdAt: string;
}

export interface ToolsPage {
  items: ToolCallItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    total: number;
    success: number;
    error: number;
    avgLatencyMs: number;
    top: { tool: string; count: number }[];
  };
}

export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RuntimeLogItem {
  t: string;
  level: RuntimeLogLevel;
  msg: string;
}

export interface RuntimeLogsResponse {
  items: RuntimeLogItem[];
}

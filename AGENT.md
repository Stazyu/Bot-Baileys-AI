# AGENT.md — Bot-Baileys-AI

> **Read this first.** This document gives every AI agent the full mental model of the project before writing any code.

---

## 1. What This Project Is

Bot-Baileys-AI is a **multi-session WhatsApp bot** built on [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web API library). It connects to WhatsApp, handles incoming messages, executes user commands via a **plugin system**, and integrates with an **AI LLM** for natural-language conversation with **function calling** (tool use).

### Core Capabilities
- **Multi-session**: Manage many WhatsApp numbers simultaneously from one process.
- **Plugin architecture**: Commands live in `src/plugins/<category>/` folders and are auto-discovered.
- **AI chat**: Private chat AI mode + group auto-reply when bot is mentioned/tagged/replied-to.
- **AI tools (function calling)**: The LLM can call tools to download social media, search Pinterest, create stickers, search the web, and fetch web pages.
- **Media download**: Instagram, TikTok, YouTube (video + audio), Facebook, Twitter/X, Pinterest.
- **Sticker creation**: Convert images/videos to WhatsApp stickers. Also supports [`gallery-dl`](https://github.com/mikf/gallery-dl) for gallery/image-based stickers.
- **Premium/tier system**: Per-user daily limits for AI chats and commands.
- **Web dashboard**: A Vue 3 frontend in [`web/`](web/) for session monitoring.

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | **Node.js ≥18**, ESM (`"type": "module"`) |
| Language | **TypeScript 7** with `strict: true` |
| WhatsApp | [`@innovatorssoft/baileys`](https://github.com/innovatorssoft/baileys) (fork with button support) |
| Database | **MongoDB** via **Prisma ORM** (see [`prisma/schema.prisma`](prisma/schema.prisma)) |
| AI | OpenAI-compatible API via [AI SDK](https://sdk.vercel.ai) (`ai` + [`@ai-sdk/openai-compatible`](https://sdk.vercel.ai/providers/ai-sdk-providers/openai-compatible)) — supports OpenAI, OpenRouter, Ollama, and custom providers |
| AI Client | [`ai`](https://www.npmjs.com/package/ai) v7 (Vercel AI SDK) — `generateText`, `streamText`, `dynamicTool` |
| AI Provider | [`@ai-sdk/openai-compatible`](https://www.npmjs.com/package/@ai-sdk/openai-compatible) — `createOpenAICompatible()` |
| Media DL | [`nexo-aio-downloader`](https://github.com/Stazyu/nexo-aio-downloader), [`@tobyg74/tiktok-api-dl`](https://github.com/tobyg74/tiktok-api-dl) |
| Stickers | [`wa-sticker-formatter`](https://github.com/rashidomar/wa-sticker-formatter), `gallery-dl` (Python CLI) |
| Web | **Vue 3** + Vite + TypeScript + Pinia + Vue Router |
| Package manager | **pnpm** (workspace monorepo, see [`pnpm-workspace.yaml`](pnpm-workspace.yaml)) |
| Logging | [`pino`](https://github.com/pinojs/pino) |

---

## 3. Project Structure (Mental Map)

```
Bot-Baileys-AI/
├── AGENT.md                          ← YOU ARE HERE
├── README.md                         ← User-facing documentation
├── config.json                       ← Owner numbers, prefixes, maintenance mode
├── .env.example                      ← All env vars documented
├── Dockerfile                        ← Docker build
├── tsconfig.json                     ← strict: true, ES2022, NodeNext
├── package.json                      ← Scripts & dependencies
├── prisma/
│   └── schema.prisma                 ← MongoDB schema (WaSession, WaAuthState, Message, WaUser, etc.)
├── src/
│   ├── index.ts                      ← Main entry point: loads sessions, registers tools, starts bot
│   ├── bot/
│   │   ├── botHandler.ts             ← Core message router: commands, AI, auto-download, group replies
│   │   └── autoDownload.ts           ← Social media link detection & auto-download
│   ├── config/
│   │   └── botConfig.ts              ← Reads config.json + env-based overrides
│   ├── database/
│   │   └── prisma.ts                 ← Prisma client singleton
│   ├── libs/baileys/
│   │   └── usePrismaAuthState.ts     ← Baileys auth state persisted to MongoDB via Prisma
│   ├── plugins/
│   │   ├── pluginManager.ts          ← Plugin loader (auto-discovers folders & files)
│   │   ├── ai/           → AI mode toggle
│   │   ├── basic/        → help, ping, status, changelog, reportbug, testbutton
│   │   ├── group/        → hidetag, setgroup, togglebot
│   │   ├── media/        → instagram, tiktok, youtube, facebook, twitter, pinterest, sticker, stickerToImage, pinterestSticker
│   │   ├── owner/        → eval, exec, premium, speedtest, userList, test_owner
│   │   └── session/      → create_session, disconnect_session, list_sessions
│   ├── services/
│   │   ├── aiService.ts              ← AI client: multi-provider, streaming, function calling, conversation history
│   │   ├── systemPrompt.ts           ← System prompts for private AI mode & group auto-reply
│   │   ├── aiModeHandler.ts          ← Toggle AI mode per-user (in-memory cache)
│   │   ├── aiModePersistence.ts      ← AI mode toggle persisted to DB
│   │   ├── groupToggle.ts            ← Per-group AI toggle
│   │   ├── premiumService.ts         ← Premium tier limits, usage counters
│   │   └── userService.ts            ← User auto-registration
│   ├── session/
│   │   ├── sessionManager.ts         ← Creates/manages Baileys sockets, reconnection, QR codes
│   │   ├── sessionHelper.ts          ← Convenience wrappers over SessionManager
│   │   └── authStateDB.ts            ← Low-level auth state DB operations
│   ├── tools/
│   │   ├── index.ts                  ← Registers all AI tools (called once at startup)
│   │   ├── toolRegistry.ts           ← Central registry for AI-callable tools (singleton)
│   │   └── definitions/              ← Individual tool implementations
│   │       ├── downloadYoutube.ts
│   │       ├── pinterestSearch.ts
│   │       ├── pinterestSticker.ts
│   │       ├── socialDownload.ts
│   │       ├── webFetch.ts
│   │       └── webSearch.ts
│   ├── types/
│   │   ├── command.ts                ← CommandContext, CommandConfig, CommandHandler, CommandModule
│   │   ├── plugin.ts                 ← Plugin, PluginModule, CategoryPlugin
│   │   └── tools.ts                  ← AIToolDefinition, AIToolCall, ToolContext, ToolExecuteResult
│   └── utils/
│       ├── logger.ts                 ← Pino logger wrapper
│       ├── messageValidator.ts       ← JID & message validation
│       ├── rateLimiter.ts            ← In-memory rate limiter
│       ├── toolCallFilter.ts         ← Strips/filters DSML tool call artifacts from AI output
│       ├── instagram.ts, pinterest.ts, twitterDownloader.ts, youtubeButtonHandler.ts
│       └── pinterestSticker.ts       ← Pinterest sticker helper
├── web/                              ← Vue 3 frontend (separate pnpm workspace package)
│   └── src/
│       ├── App.vue, main.ts
│       ├── router/, stores/, views/, components/
│       └── assets/
├── tests/                            ← Test files (tsx --test)
├── scripts/
│   └── migrateAuthState.ts           ← Auth state migration script
└── plans/                            ← Planning docs
    ├── TODO.md, ROADMAP.md             ← Known Issues + roadmap
    ├── ai-tooling-plan.md
    └── architecture-documentation.md
```

---

## 4. Core Flow (How a Message Gets Processed)

```
WhatsApp Cloud
    │
    ▼
Baileys Socket (sessionManager.ts)
    │  'messages.upsert' event
    ▼
BotHandler.handleMessage() (botHandler.ts)
    │
    ├─ Validate (ignore fromMe, duplicates, invalid JIDs)
    ├─ Simplify message (extract text, type, sender, group info)
    ├─ Print colored log
    │
    └─ processMessage():
         │
         ├─ [1] Auto-register user (fire & forget)
         ├─ [2] Rate limit check (non-commands)
         ├─ [3] Maintenance mode check
         │
         ├─ [4] GROUP AUTO-REPLY (if isGroup && bot mentioned/tagged/replied)
         │       └─ handleGroupAutoReply() → aiService.chatWithTools()
         │           Uses getGroupSystemPrompt() for personality
         │
         ├─ [5] AI MODE (if private chat && AI mode enabled for user)
         │       └─ handleAIMessage() → aiService.chatWithTools()
         │           Uses getSystemPrompt()
         │
         ├─ [6] SOCIAL MEDIA AUTO-DOWNLOAD (if message contains link)
         │       └─ downloadFromSocialMedia()
         │
         ├─ [7] BUTTON REPLY (YouTube download buttons)
         │       └─ handleYouTubeButton()
         │
         └─ [8] COMMAND EXECUTION (if message starts with prefix)
                 └─ PluginManager.executeCommand()
                     ├─ Resolve alias
                     ├─ Check permissions (ownerOnly, adminOnly, groupOnly, privateOnly)
                     ├─ Rate limit per-command cooldown
                     ├─ Premium daily limit check (if limitEnabled)
                     └─ Execute handler
```

### Prefixes & Commands
- Default prefixes: `!`, `.`, `#`, `/` (configurable in [`config.json`](config.json) + `PREFIXES` env var)
- Commands are case-insensitive. Example: `!ping`, `!PING`, `!Ping` all work.
- Aliases: each command can define alternate names (e.g., `!p` → `!ping`).

---

## 5. AI System Deep Dive

### 5.1 Providers
The bot supports 4 AI provider modes, configured via `AI_PROVIDER` env var:
- **`openai`** — OpenAI API or any OpenAI-compatible endpoint (Groq, Together, DeepSeek, Mistral, Azure)
- **`openrouter`** — OpenRouter (default, with fallback model list)
- **`ollama`** — Local Ollama (NO function calling support — falls back to regular chat)
- **`other`** — Custom OpenAI-compatible endpoint

### 5.2 Function Calling Flow
```
User message → aiService.chatWithTools()
    │
    ├─ Build messages array (system prompt + conversation history + user message)
    ├─ Convert ToolRegistry entries → AI SDK dynamicTool() definitions
    │
    ├─ streamText() via AI SDK (with tools, maxSteps: 4)
    │   │
    │   ├─ AI SDK handles the tool-calling loop automatically:
    │   │   ├─ Stream text to user
    │   │   ├─ If AI returns tool_calls → execute via ToolRegistry
    │   │   ├─ Feed tool results back to AI
    │   │   └─ Continue until no more tool calls or maxSteps reached
    │   │
    │   └─ Final response streamed via textStream → onChunk callback
    │
    └─ Tool results are filtered for artifacts before sending to user
```

### 5.3 Conversation History
- Stored in-memory: `Map<sessionId, ChatMessage[]>`
- Group chat conversations expire after 10 minutes (auto-clean)
- Private chat conversations persist until bot restart

### 5.4 System Prompts
Two distinct prompts in [`src/services/systemPrompt.ts`](src/services/systemPrompt.ts):
- **`getSystemPrompt()`** — AI mode (private chat): helpful assistant, understands short commands, anti-rambling, tool usage rules
- **`getGroupSystemPrompt(time, pushName)`** — Group auto-reply: personality-driven, Indonesian banter, time roasting, tone mirroring, no coding help

### 5.5 Available AI Tools
| Tool | Purpose |
|------|---------|
| `web_search` | Search the web via DuckDuckGo |
| `web_fetch` | Scrape & read a web page (via Firecrawl) |
| `download_social_media` | Download from Instagram, TikTok, Facebook, Twitter/X |
| `download_youtube` | Download YouTube video or audio (ranks 8 search candidates against the requested title/artist) |
| `pinterest_search` | Search images on Pinterest |
| `gallery_dl_sticker` | Create WhatsApp sticker from gallery-dl URL or keyword |

---

## 6. Plugin System

### 6.1 Two Plugin Formats

**Legacy format** (single `.ts` file exporting `PluginModule`):
```ts
// src/plugins/basicCommands.ts
const plugin: PluginModule = {
  name: 'basic-commands',
  version: '1.0.0',
  description: '...',
  commands: [{ name: 'ping', ... }],
  handlers: { ping: async (ctx, args) => { ... } },
};
export default plugin;
```

**Category format** (folder with individual command files):
```
src/plugins/media/
├── instagram.ts    ← exports CommandModule { config, handler }
├── tiktok.ts       ← exports CommandModule { config, handler }
├── youtube.ts      ← exports CommandModule { config, handler }
└── index.ts        ← optional CategoryPlugin
```

The [`PluginManager`](src/plugins/pluginManager.ts) auto-discovers both formats at startup.

### 6.2 Command Config Options
```ts
interface CommandConfig {
  name: string;            // primary command name
  aliases?: string[];      // alternative names
  description: string;
  usage: string;           // shown in !help
  category?: string;
  cooldown?: number;       // seconds between uses per-user (default: 2)
  ownerOnly?: boolean;     // only bot owners can use
  adminOnly?: boolean;     // only group admins can use
  groupOnly?: boolean;     // only works in groups
  privateOnly?: boolean;   // only works in private chats
  limitEnabled?: boolean;  // subject to premium daily command limits
}
```

### 6.3 CommandContext
See [`src/types/command.ts`](src/types/command.ts:4):
```ts
interface CommandContext {
  socket: WASocket;          // Baileys socket for sending messages
  sessionId: string;         // current session ID
  fromJid: string;           // sender JID (e.g., "628xxx@s.whatsapp.net" or "xxx@g.us")
  fromMe: boolean;
  pushName?: string;
  messageTimestamp?: number;
  message: WAMessage;        // raw Baileys message object
  simplified?: SimplifiedMessage;  // parsed message with type, body, isGroup, etc.
  pluginManager?: PluginManager;
}
```

---

## 7. Session Management

- Sessions are stored in MongoDB via [`WaSession`](prisma/schema.prisma) and [`WaAuthState`](prisma/schema.prisma) models.
- [`SessionManager`](src/session/sessionManager.ts) creates Baileys sockets with Prisma-based auth state.
- **Auto-reconnection** with exponential backoff (max 10 attempts, up to 30s delay).
- QR codes are printed in terminal for pairing.
- CLI arguments: `--session=<id>`, `--force-clear`, `--only`
- Env filters: `INCLUDE_SESSIONS` / `EXCLUDE_SESSIONS` (comma-separated session IDs)

### Session Lifecycle Callbacks
When a socket connects: `SessionManager` fires `onSessionCreated` callback → [`sessionHelper.ts`](src/session/sessionHelper.ts) creates a `BotHandler` instance, which creates a `PluginManager` and registers event handlers.

---

## 8. Database (Prisma + MongoDB)

Key models in [`prisma/schema.prisma`](prisma/schema.prisma):
- **`WaSession`** — session metadata (status, phoneNumber, isActive, timestamps)
- **`WaAuthState`** — Baileys auth credentials (key-value, per-session)
- **`Message`** — stored messages (for `getMessage` fallback)
- **`WaUser`** — registered users with premium tier, limits, AI mode flag
- **`GroupAISettings`** — per-group AI toggle
- **`AuthState`** — legacy auth storage (may be deprecated)

---

## 9. Premium / Tier System

See [`src/services/premiumService.ts`](src/services/premiumService.ts). Tiers:
- **free** — default, limited AI & command usage
- **premium** / **pro** — higher daily limits

The service tracks:
- Private AI chat count per user per day
- Group AI chat count per user per day
- Command usage count per user per day (for commands with `limitEnabled: true`)

---

## 10. Important Conventions & Gotchas

### TypeScript
- **`strict: true`** is enabled. Never use `any`; prefer `unknown`.
- All imports use `.js` extension for ESM compatibility (even though source is `.ts`).
- Use `import type { ... }` for type-only imports.

### Code Style
- **Single quotes** for imports/strings in most files.
- Error messages to users are in **Indonesian**.
- Log messages are in English (or mixed with emoji).
- Use the centralized [`log`](src/utils/logger.ts) utility instead of `console.log` (except for startup bootstrap messages).

### Message Processing
- Always call [`validateMessage()`](src/utils/messageValidator.ts) and [`validateJid()`](src/utils/messageValidator.ts) before processing.
- Use [`rateLimiter`](src/utils/rateLimiter.ts) for per-user cooldowns.
- Wrap handlers in try/catch — a single bad message must never crash the bot.
- Use `socket.sendPresenceUpdate('composing', jid)` before long operations and `'paused'` afterwards.

### AI Tool Artifacts
- ALWAYS pass AI responses through [`stripToolCallArtifacts()`](src/utils/toolCallFilter.ts) before sending to users.
- Some models write tool calls as text (DSML/XML/JSON) instead of proper function calling. The system detects and strips these.

### JID Format
- User JID: `628123456789@s.whatsapp.net`
- Group JID: `628123456789-123456@g.us`
- Bot own JID: extracted via `socket.user?.id?.split(':')[0] + '@s.whatsapp.net'`

### Baileys Version
- We use `@innovatorssoft/baileys` (a fork) for button support. The original `baileys` package is also installed as a peer for type imports (`proto`, etc.).

---

## 11. Development Commands

```bash
pnpm dev              # Dev mode, hot reload, loads all sessions from DB
pnpm dev:new          # Dev mode, pair a new session (pass --session=<id>)
pnpm dev:dev          # Dev mode, isolated "dev" session only
pnpm build            # TypeScript compilation
pnpm start            # Production
pnpm type-check       # TypeScript type checking (no emit)
pnpm prisma:generate  # Regenerate Prisma client
pnpm prisma:migrate   # Push schema to MongoDB
pnpm prisma:studio    # Open Prisma Studio GUI

# Tests
pnpm test:toolCallFilter
pnpm test:aiServiceStream
pnpm test:aiToolChaining
```

---

## 12. Adding a New Feature: Step-by-Step

### Adding a Command Plugin
1. Create file: `src/plugins/<category>/mycommand.ts`
2. Export `CommandModule`:
   ```ts
   import type { CommandModule, CommandContext } from '../../types/index.js';
   const cmd: CommandModule = {
     config: { name: 'mycmd', aliases: ['mc'], description: '...', usage: '!mycmd [args]', category: 'misc' },
     handler: async (ctx: CommandContext, args: string[]) => {
       await ctx.socket.sendMessage(ctx.fromJid, { text: 'Hello!' });
     },
   };
   export default cmd;
   ```
3. Restart the bot — the plugin auto-loads.

### Adding an AI Tool
1. Create file: `src/tools/definitions/myTool.ts`
2. Define the tool:
   ```ts
   import type { AIToolDefinition, ToolExecuteFunction, ToolExecuteResult, ToolContext } from '../../types/tools.js';
   export const myToolDefinition: AIToolDefinition = {
     type: 'function',
     function: {
       name: 'my_tool',
       description: 'What this tool does',
       parameters: { type: 'object', properties: { ... }, required: [...] },
     },
   };
   export const myToolExecute: ToolExecuteFunction = async (args, context: ToolContext): Promise<ToolExecuteResult> => {
     // ... implement
     return { success: true, message: 'Done', data: { ... } };
   };
   ```
3. Register in [`src/tools/index.ts`](src/tools/index.ts):
   ```ts
   import { myToolDefinition, myToolExecute } from './definitions/myTool.js';
   // ...
   toolRegistry.register('my_tool', myToolDefinition, myToolExecute);
   ```

---

## 13. Environment Variables Reference

See [`.env.example`](.env.example) for full list. Critical vars:
- `DATABASE_URL` — MongoDB connection string (required)
- `AI_PROVIDER` — `openai` | `openrouter` | `ollama` | `other`
- Provider-specific keys: `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `OTHER_API_KEY`
- `INCLUDE_SESSIONS` / `EXCLUDE_SESSIONS` — session filtering
- `OWNER_NUMBERS`, `PREFIXES` — override `config.json`
- `FIRECRAWL_URL` — web scraping endpoint for `web_fetch` tool
- `GALLERY_DL_BIN` — path to gallery-dl binary

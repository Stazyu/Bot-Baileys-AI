# Dashboard → Bot WA via Backend Fastify — Implementation Plan

> Status: planned. Keputusan user (2026-09-12): (1) satu proses, (2) activity disimpan,
> (3) auth token tunggal pribadi, (4) QR + pairing code dua-duanya.

## 1. Arsitektur

Satu proses Node: bot Baileys + server Fastify hidup bersama. Alasan: socket
Baileys ada di memori (`SessionManager.sessions: Map<string, WASocket>`),
tidak serializable — pisah proses butuh Redis pub/sub, overkill untuk panel pribadi.

```
┌─────────────────────────────────────────────┐
│  node dist/index.js (satu proses)           │
│                                             │
│  src/index.ts                               │
│   ├─ registerAllTools()                     │
│   ├─ premiumService.init()                  │
│   ├─ loadActiveSessions()                   │
│   └─ startServer(sessionManager, bus)  ◄─── baru
│                                             │
│  src/server/ (Fastify)                      │
│   ├─ index.ts        buildServer/startServer│
│   ├─ events.ts       EventBus + ring buffer │
│   ├─ plugins/auth.ts Bearer token tunggal  │
│   ├─ routes/health.ts                       │
│   ├─ routes/dashboard.ts  (stats+traffic)   │
│   ├─ routes/sessions.ts   (CRUD+QR/pairing) │
│   ├─ routes/activity.ts   (list+SSE stream) │
│   ├─ routes/users.ts                        │
│   ├─ routes/messages.ts   (chat+command log)│
│   └─ routes/settings.ts                     │
│                                             │
│  src/bot/botHandler.ts  ──emit──► bus ──► SSE + persist
│  src/session/sessionManager.ts ──emit──► bus (connection.update → QR)
└─────────────────────────────────────────────┘
         ▲ HTTPS (Vite dev: CORS localhost:5173)
         │ Authorization: Bearer <DASHBOARD_API_TOKEN>
┌────────┴──────────────┐
│ apps/web (Vue)        │
│ composables/use*.ts   │  (ganti semua array hardcoded)
└───────────────────────┘
```

## 2. Dependensi baru (root `package.json`)

| Paket | Guna |
|---|---|
| `fastify` | HTTP server |
| `@fastify/cors` | allow Vite dev origin |
| `@fastify/rate-limit` | anti-spam, wajib untuk QR/create |
| `@fastify/websocket` | QR + pairing stream (single-consumer) |
| `zod` | validasi body/query semua route mutasi |
| `qrcode` | sudah ada — reuse untuk render QR dataURL di server |

`pino` + `pino-pretty` sudah ada → jadikan Fastify logger (jangan bikin logger kedua).

## 3. Skema DB (Prisma, MongoDB)

Yang sudah ada dan langsung dipakai: `Session`, `Message` (+`fromMe`, `createdAt`),
`User`, `UsageLog` (`aiChatCount` per `date`), `WaSession` (`status`),
`BotConfig` (key-value), `WaAuthState`.

Tambahan baru (keputusan: activity **disimpan**):

```prisma
model ActivityEvent {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  type      String   // message | command | ai | session | download | error
  sessionId String?
  session   String?  // pushName snapshot, murah untuk list tanpa join
  detail    String
  meta      Json?
  createdAt DateTime @default(now())

  @@index([createdAt])
  @@index([type, createdAt])
  @@index([sessionId, createdAt])
}

model CommandLog {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  sessionId String?
  userId    String?
  command   String   // "ping", "sticker", ...
  args      String?
  success   Boolean  @default(true)
  latencyMs Int?
  createdAt DateTime @default(now())

  @@index([sessionId, createdAt])
  @@index([command, createdAt])
  @@index([createdAt])
}
```

Retensi: MongoDB tidak punya TTL via Prisma schema. Strategi: index `createdAt`
+ job cleanup per jam (`deleteMany createdAt < now-30d`) dijalankan dari proses
bot (murah, tanpa cron eksternal). Default 30 hari, configurable via settings.

Index tambahan pada model lama: `Message` perlu `@@index([createdAt])`
(sekarang hanya `@@index([sessionId])`) — tanpa ini agregasi traffic 24h full-scan.

## 4. Event bus (`src/server/events.ts`)

```ts
type BotEvent =
  | { kind: 'message'; sessionId: string; detail: string; meta?: unknown }
  | { kind: 'command'; sessionId: string; detail: string; meta?: unknown }
  | { kind: 'ai';      sessionId: string; detail: string; meta?: unknown }
  | { kind: 'download'; sessionId: string; detail: string; meta?: unknown }
  | { kind: 'session'; sessionId: string; detail: string; meta?: unknown }
  | { kind: 'error';   sessionId: string; detail: string; meta?: unknown }
  | { kind: 'qr';      sessionId: string; qr?: string; pairingCode?: string }
  | { kind: 'connection'; sessionId: string; status: string };
```

- Ring buffer in-memory 200 event terakhir (fallback cepat untuk SSE reconnect).
- Persist async (fire-and-forget, jangan block message pipeline) ke
  `ActivityEvent`; kind `command` juga ke `CommandLog`.
- Hook emit: `bot/botHandler.ts` (tiap cabang message/command/AI/download/error),
  `session/sessionManager.ts` (`connection.update`: qr / pairing / open / close).

## 5. Auth (keputusan: token tunggal)

- Env: `DASHBOARD_API_TOKEN` (wajib di prod, optional-disable di dev lokal).
- Middleware `plugins/auth.ts`: semua `/api/*` wajib
  `Authorization: Bearer <token>`, kecuali `GET /api/health` (probe publik untuk
  Docker/K8s) — atau kunci semua kalau mau paling ketat.
- Rate limit: global 300 req/menit/IP; ketat untuk `POST /api/sessions` (5/menit)
  dan WS QR (1 koneksi aktif per `:id` — QR Baileys single-consumer).
- Token disimpan frontend di `localStorage`, dikirim via fetch interceptor.
  Tidak ada tabel user/panel, tidak ada refresh-token — sesuai kebutuhan pribadi.

## 6. Endpoint

### 6.1 Health — `routes/health.ts`

```
GET /api/health            → { status, uptimeSec, cpuPct, memPct, memUsedMB,
                               queueDepth, replyP50Ms, sessionsConnected,
                               sessionsTotal }          (publik, untuk probe)
GET /api/health/stream     → SSE, push tiap 5s                   (auth)
```

Sumber: `os.loadavg()/cpus()`, `process.memoryUsage()/uptime()`,
`sessionManager` counts, latensi reply (EWMA diukur di botHandler:
timestamp masuk → pesan terkirim). Menggantikan angka statis
`SystemHealth.vue` (34/58/22%).

### 6.2 Dashboard — `routes/dashboard.ts`

```
GET /api/dashboard/stats
→ { activeSessions, registeredUsers, messagesToday, aiCallsToday,
    sparks: { sessions: n[7], users: n[7], messages: n[7], ai: n[7] } }
```

- `activeSessions`: `WaSession.count({status:'connected'})` (fallback hitung
  `sessionManager.getAllSessions().size`).
- `registeredUsers`: `User.count()`.
- `messagesToday`: `Message.count(createdAt >= awalHari)`.
- `aiCallsToday`: `UsageLog.aggregate sum(aiChatCount) where date == today`.
- Spark 7 hari: agregasi per hari dari `Message` + `UsageLog` (7 query ringan,
  cache 60s di memori).

```
GET /api/dashboard/traffic?range=24h|7d
→ { labels: string[], incoming: n[], outgoing: n[] }
```

Agregasi `Message` by jam (`fromMe=false→in`, `true→out`). Menggantikan 2 array
hardcoded di `MessageTraffic.vue`. Cache 60s.

### 6.3 Sessions — `routes/sessions.ts`

```
GET    /api/sessions                 → [{ id, pushName, phoneNumber, status,
                                          uptime, lastActive, messagesIn,
                                          messagesOut, aiMode, platform }]
GET    /api/sessions/:id
POST   /api/sessions                 { name, phone, platform?, aiMode? }
POST   /api/sessions/:id/disconnect
POST   /api/sessions/:id/reconnect
DELETE /api/sessions/:id
WS     /api/sessions/:id/link        → stream { type:'qr', dataUrl }
                                       + { type:'pairingCode', code }
                                       + { type:'status', status }
```

- List: gabung `WaSession` (status, phoneNumber, timestamps) + counter dari
  `Message` (`messagesIn/out` per session, cache 30s) + `aiMode` (dari
  `User`/setting per-sesi — tentukan satu sumber saat implementasi).
- Create: panggil `createSession(sessionId)` yang sudah ada di
  `session/sessionHelper.ts`; QR/pairing dari event `connection.update`
  di-forward ke WS sebagai dataURL (render via lib `qrcode` yang sudah ada).
- Keputusan: tampilkan **dua-duanya** — QR image + kode pairing 8 digit
  (fallback saat kamera tidak bisa scan).
- Hanya 1 WS aktif per session id; koneksi kedua menolak dengan `409`.
- Menggantikan: `SessionTable.vue` (5 sesi dummy), seluruh logika lokal
  `SessionsView.vue` (create/disconnect), dan pseudo-QR
  (`SessionsView.vue:82-96`, hapus total).

### 6.4 Activity — `routes/activity.ts`

```
GET /api/activity?limit=20&cursor=&type=  → { items: [{id,type,session,
                                                detail,createdAt}], nextCursor }
GET /api/activity/stream                  → SSE live (dari bus + ring buffer)
```

Cursor-based pagination (`createdAt` + `_id`) karena data grow cepat.
Menggantikan 10 item hardcoded `RecentActivity.vue`. Badge "Live" disambung ke
status SSE yang sebenarnya (hijau saat connected, abu saat retry).

### 6.5 Users — `routes/users.ts`

```
GET   /api/users?search=&tier=&status=&page=&pageSize=&sort=
→ { items: [{userId,pushName,sessionId,tier,status,isBlocked,
             aiModeEnabled,messageCount,lastSeen}], total }
PATCH /api/users/:userId   { tier?, isBlocked?, aiModeEnabled? }
```

Manfaatkan index yang sudah ada (`sessionId`, `lastSeen`, `tier`, `status`).
Search: `userId`/`pushName` contains. Validasi `tier ∈ free|premium|pro`.

### 6.6 Messages — `routes/messages.ts`

```
GET /api/messages?sessionId=&q=&page=&pageSize=  → ChatLogsView (dari Message)
GET /api/commands?sessionId=&command=&page=      → CommandLogsView (dari CommandLog baru)
```

`Message.message` adalah Json Baileys mentah — projection di server: ekstrak
teks/`pushName`/`fromMe`/timestamp sebelum kirim ke frontend (jangan kirim blob
mentah, berat + bocor metadata).

### 6.7 Settings — `routes/settings.ts`

```
GET   /api/settings   → { profile, prefixes, commandCooldown, ai:{...},
                          tiers, maintenance, security }
PATCH /api/settings   → simpan ke BotConfig (key-value) + hot-reload
```

Mapping ke `config/botConfig.ts`:

| Seksi UI | Kunci `BotConfig` | Efek runtime |
|---|---|---|
| Profil Bot | `bot.name`, `bot.ownerNumbers` | info + `isOwner()` |
| Prefix & Command | `bot.prefixes`, `bot.cooldown` | `getPrefixes()` reload tanpa restart |
| Sesi WA | read-only | link ke `/api/sessions` |
| Perilaku AI | `ai.provider/model/systemPrompt/maxToolRounds/stream/group*/tools.*` | `aiService` baca ulang |
| Limit & Premium | `tier.free.*`, `tier.premium.*`, `tier.pro.*` | `premiumService` reload |
| Maintenance | `bot.maintenance`, `bot.maintenanceMessage` | `isMaintenance()` hot |
| Tampilan | — | lokal saja, jangan persist ke server |
| Keamanan | `sec.blockUnknownJid`, `sec.logAllMessages`, `sec.rateLimitPerMinute` | ditegakkan di `botHandler` |

`saveAll()` di `SettingsView.vue` yang sekarang no-op menjadi `PATCH` beneran
+ indikator `unsaved` sudah ada, tinggal sambung.

## 7. Frontend wiring (`apps/web`)

| Sekarang (mock) | Menjadi |
|---|---|
| `StatsCards.vue` array `stats` | `composables/useDashboardStats.ts` (`useFetch /api/dashboard/stats`, refresh 30s) |
| `SessionTable.vue` array `sessions` | `useSessions.ts` (Pinia store + polling 10s) |
| `SessionsView.vue` `ref()` + pseudo-QR | store yang sama + WS `/link` → `<img :src="qrDataUrl">` + tampilkan `pairingCode` + tombol copy |
| `MessageTraffic.vue` array 24 titik | `useFetch /api/dashboard/traffic` |
| `RecentActivity.vue` 10 item | `useEventSource /api/activity/stream` + fallback `GET /api/activity` |
| `SystemHealth.vue` statis | `useEventSource /api/health/stream` |
| `UsersView`, `ChatLogsView`, `CommandLogsView` | `useFetch` + query param search/filter/page |
| `SettingsView.vue` `saveAll()` no-op | `GET` saat mount + `PATCH` saat save, `markDirty()` tetap |

Tambah: socket/SSE status indicator, skeleton saat loading (komponen `skeleton`
sudah ada), empty-state tetap, error-state baru (sekarang tidak ada karena data
selalu "ada"). Auth header via satu `lib/api.ts` fetch wrapper.

## 8. Config, script, deploy

```env
# .env (tambahan, mirror ke .env.example)
PORT=3001
HOST=0.0.0.0
DASHBOARD_API_TOKEN=<random-32-char>
CORS_ORIGIN=http://localhost:5173
ACTIVITY_RETENTION_DAYS=30
```

- `package.json` scripts: `dev:bot` (tsx src/index.ts), `dev:api` tidak perlu
  (satu proses), `dev:all` = bot + `vite` di `apps/web` paralel.
- `Dockerfile`: expose `$PORT`, healthcheck `GET /api/health`.
- `src/index.ts`: `await startServer()` setelah `loadActiveSessions()`;
  shutdown `SIGINT/SIGTERM` → `server.close()` → `disconnectAllSessions()` →
  `prisma.$disconnect()` (urutan penting: tutup listener dulu, baru socket WA).

## 9. Fase eksekusi

- [ ] **Fase 1 — Tulang punggung**: `src/server/` boot + CORS + auth token +
      `GET /api/health` + `GET /api/sessions`. Frontend: `lib/api.ts` +
      SessionsView live. Done = create/disconnect sesi dari dashboard jalan beneran.
- [ ] **Fase 2 — Dashboard read-only**: `stats` + `traffic` + index
      `Message.createdAt`. Frontend: StatsCards + MessageTraffic + SystemHealth live.
      Done = tidak ada lagi angka hardcoded di 3 widget itu.
- [ ] **Fase 3 — Event bus + persist**: model `ActivityEvent` + `CommandLog`,
      emit dari `botHandler`/`sessionManager`, `GET + SSE /api/activity`,
      cleanup job retensi. Frontend: RecentActivity + CommandLogs + ChatLogs live.
      Done = kirim pesan WA muncul di feed < 3s.
- [ ] **Fase 4 — Mutasi penuh**: WS `/sessions/:id/link` (QR + pairing),
      `PATCH users`, `GET/PATCH settings` + hot-reload `botConfig`.
      Frontend: QR real, save settings beneran. Done = pseudo-QR terhapus,
      `saveAll()` persist dan survive restart.

## 10. Verifikasi per fase

- `pnpm type-check` (root) + `vue-tsc --build` (`apps/web`) bersih.
- `oxlint` bersih (repo ini full oxc, tanpa eslint).
- Smoke: `POST /api/sessions` → WS terima QR + pairing → scan → status
  `connected` muncul di dashboard ≤ 10s → kirim pesan WA → muncul di
  RecentActivity ≤ 3s → restart bot → activity tetap ada (persist terbukti).
- Beban: agregasi traffic 24h < 500ms di dataset 100k pesan (pantau via log
  response-time Fastify; tambah cache jika lewat).

## 11. Risiko

1. **QR single-consumer** — Baileys hanya mengizinkan 1 listener QR aktif.
   Mitigasi: 1 WS per sesi, 409 untuk koneksi kedua, QR di-cache 20s terakhir.
2. **Agregasi Mongo berat** — `Message` grow cepat. Mitigasi: index `createdAt`,
   cache 30–60s, pagination cursor, projection teks (jangan kirim blob Json mentah).
3. **Event emit memperlambat pipeline pesan** — Mitigasi: persist fire-and-forget,
   try/catch isolasi, SSE backpressure (drop ke ring buffer, client catch-up via cursor).
4. **Token tunggal bocor = akses penuh** — Mitigasi: token 32 char random,
   rotasi via env, rate-limit, dan (opsional) bind `HOST=127.0.0.1` + reverse proxy.

## 12. Status implementasi (2026-09-12)

Backend **selesai + terverifikasi live** (bot `tsx watch` me-restart sendiri
dan sudah menjalankan kode baru):

- `src/server/` — `index.ts`, `events.ts`, `auth.ts`, `sse.ts`,
  `validate.ts`, `routes/{health,dashboard,sessions,activity,users,messages,settings}.ts`
- Prisma: `ActivityEvent`, `CommandLog`, `Message @@index([createdAt])`
- Emit: `botHandler` (message/command/ai/download/error + latensi reply),
  `sessionManager` (qr/link/connected/disconnected)
- Hot-reload tanpa restart: prefix, maintenance, owner, cooldown, tier limit,
  toggle limit. Seksi AI persist tapi butuh restart (`requiresRestart: ["ai"]`).
- Bukti: `tsc --noEmit` bersih, 21 unit test lama pass, smoke `inject`
  (health 200 + data sesi real `dev`, stats `aiCallsToday: 23`, activity row
 `"dev" connected` tertulis+persist, auth 401, validasi 400).
- Sisa: wiring frontend (`apps/web` composables, §7) — belum dikerjakan.

## 13. Status wiring frontend (2026-09-12)

Selesai — tidak ada lagi array mock di dashboard:

- Fondasi: `lib/api.ts` (token localStorage, `VITE_API_URL`), `lib/api-types.ts`,
  `lib/format.ts`, `composables/useSse.ts` (fetch-reader + auto-reconnect),
  `composables/usePoll.ts`, `stores/sessions.ts` (Pinia, dipakai
  SessionsView + SessionTable), `components/ApiTokenGate.vue` (dialog token
  saat 401, mount di DashboardLayout).
- Widget: StatsCards (delta vs yesterday dari spark), MessageTraffic
  (toggle 24h/7d), SystemHealth (SSE + fallback GET), RecentActivity
  (SSE prepend + cursor load-more), SessionTable (store).
- Halaman: Sessions (CRUD + QR real + pairing code + copy + delete),
  Users (server search/filter/page + summary + block toggle),
  ChatLogs (`GET /api/conversations` + reply via `POST /:id/send`),
  CommandLogs (summary server + filter status + load more),
  Settings (GET/PATCH + hot-reload note + Pro unlimited + enforcement switches).
- Backend susulan untuk UI: `GET /api/conversations`,
  `POST /api/sessions/:id/send`, `GET /api/users/summary`,
  `summary` di `GET /api/commands`, `?token=` untuk WS upgrade.
- Verifikasi: `vue-tsc --build` bersih, oxlint bersih, `vite build` sukses,
  inject test semua endpoint 200 + data real (30 users, tier split, settings).
- Jujur di-drop (backend tidak punya datanya): platform sesi, AI badge per
  sesi/chat, unread chat, grup per user, in/out split per user, kategori +
  errorMessage command log, registeredAt/lastConnected statis settings,
  PIN dashboard (jadi PIN browser-lokal via localStorage).

## 14. Tool Calling log (2026-09-12)

Pisah tabel, tampil gabung sebagai tab — sesuai diskusi:

- `ToolCallLog` (sesi, user, nama tool, args, success, cached, latencyMs)
  + `ToolContext.waSessionId/userId` eksplisit (sessionId di jalur AI berisi
  user JID — tidak dipakai untuk sesi).
- Hook di `aiService.buildAISDKTools` (timing + persist per eksekusi,
  termasuk duplicate yang di-skip dengan flag cached).
- `GET /api/tools` (filter sesi/tool/status + summary + top-5 tools).
- Tab "Tool calls" di Command Logs: stat sendiri (total, success-rate, avg,
  top tool), feed ungu + chip cached, search + filter status + load more.
- Verifikasi: round-trip sintetis OK, `tsc` + `vue-tsc` + `vite build` bersih.

## 15. HTTP access log (2026-09-12)

Sesuai contoh terminal (method, path, status, durasi):

- `HttpLog` + hook `onRequest`/`onResponse` di semua route (fire-and-forget,
  skip OPTIONS + probe `GET /api/health`, ikut retensi prune yang sama).
- `GET /api/http-logs` (filter method/path/success + summary + top route).
- Tab ketiga "HTTP" di Logs: stat sendiri, pill method berwarna
  (GET/POST/PATCH/DELETE/PUT), status code berwarna, durasi, search +
  filter status + load more.
- Verifikasi: capture + summary + filter terbukti via inject.

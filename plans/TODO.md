# Bot-Baileys-AI — TODO.md

> Task list dan development roadmap.
> **Versi:** 1.1.0 | **Last Updated:** 3 Agustus 2026

---

## 📋 Phase 1: Core Stabilization

- [x] **Session Management** — Multi-session dengan reconnect exponential backoff
- [x] **Plugin System** — Auto-discovery dengan dua mode (Legacy & Category)
- [x] **Auth Persistence** — Baileys auth state ke MongoDB via Prisma
- [x] **AI Service** — Multi-provider dengan streaming response
- [x] **Auto-Download** — Social media download (IG, TikTok, FB, Twitter, YT)
- [x] **Group AI Reply** — Bot merespon di grup ketika di-mention/di-reply
- [x] **Docker Support** — Multi-stage build dengan runtime minimal
- [x] **Graceful Shutdown** — SIGINT/SIGTERM handling, disconnect sessions
- [x] **Comprehensive Error Recovery** — Improve error boundaries di semua layer
- [x] **Message Validation** — Validate incoming messages before processing
- [x] **Rate Limiting** — Implement cooldown per command per user

## 📋 Phase 2: Feature Enhancements

### AI & Chat
- [ ] **AI Image Analysis** — Kirim gambar ke AI untuk dianalisis (vision)
- [ ] **AI Voice Notes** — Transcribe dan proses voice notes dengan AI
- [ ] **Custom System Prompt per User** — User bisa set system prompt sendiri
- [ ] **AI Personality Presets** — Multiple personality templates
- [x] **Web Search Integration** — Firecrawl search + fetch via function calling
- [x] **Web Fetch Tool** — Firecrawl headless scraper
- [x] **System Prompt Refactor** — Extract ke file terpisah, dynamic date injection
- [x] **AI Date/Time Awareness** — Inject real-time date ke prompt, anti-year-bias
- [x] **Group Prompt Enhancement** — Tool instructions lengkap di group auto-reply
- [x] **AI Function Calling System** — 6 AI tools with ToolRegistry singleton
- [x] **DSML Tool Call Recovery** — Parse DSML/XML artifacts dari model tanpa native function calling
- [x] **Tool Call Artifact Filter** — Strip residual XML/JSON/tool artifacts dari respons AI
- [x] **'other' AI Provider Support** — Custom OpenAI-compatible API provider
- [x] **AI SDK Migration** — Migrasi service & tools AI dari native ke `ai` & `@ai-sdk/openai-compatible`
- [ ] **Conversation Export** — Export riwayat chat AI

### Media Download
- [ ] **YouTube Auto-Download** — Full YouTube download (saat ini partial)
- [ ] **YouTube Playlist Support** — Download playlist YouTube
- [ ] **Twitter/X Thread Download** — Download entire thread
- [x] **Twitter/X Download via yt-dlp** — Implementasi dedicated twitter downloader
- [x] **gallery-dl Sticker Maker** — Buat stiker dari URL atau keyword pencarian
- [ ] **Multi-Platform Downloader** — Tambah support platform lain (Reddit, Pinterest direct)
- [ ] **Media Queue System** — Antrian download untuk menghindari rate limit
- [ ] **Compression Options** — Opsi kompresi untuk video besar

### Group Management
- [ ] **Welcome/Goodbye Messages** — Customizable welcome & goodbye
- [ ] **Anti-Link / Anti-Spam** — Auto-remove link/spam dari group
- [ ] **Scheduled Messages** — Jadwalkan pesan di group
- [ ] **Poll & Voting** — Fitur polling/voting
- [ ] **Leveling System** — User levels & XP di group

### Plugin System
- [ ] **Hot Reload** — Reload plugin tanpa restart bot
- [ ] **Plugin Dependencies** — Declare & resolve plugin dependencies
- [ ] **Plugin Registry** — Central registry untuk plugin yang terinstall
- [ ] **Plugin Config Per-Session** — Konfigurasi plugin berbeda per session
- [ ] **Plugin API Documentation** — Auto-generate docs dari plugin metadata

## 📋 Phase 3: Infrastructure & DevOps

### Monitoring & Observability
- [ ] **Structured Logging** — JSON logging untuk production
- [ ] **Metrics Dashboard** — Session health, message throughput, error rates
- [ ] **Health Check Endpoint** — HTTP health check untuk Docker/k8s
- [ ] **Performance Profiling** — Identify bottlenecks (message processing, AI calls)
- [ ] **Error Tracking** — Integrasi Sentry atau error tracking service

### Database & Performance
- [ ] **Database Indexing** — Optimasi query performance
- [ ] **Message Caching** — Cache WAMessage untuk mengurangi DB reads
- [ ] **Connection Pooling** — Optimasi koneksi MongoDB
- [ ] **Data Cleanup** — Auto-cleanup expired sessions & old messages
- [ ] **Migration Script Enhancement** — Improve migration scripts

### CI/CD
- [ ] **GitHub Actions** — CI pipeline (type-check, lint, build)
- [ ] **Automated Testing** — Unit tests untuk core modules
- [ ] **Integration Tests** — End-to-end testing dengan mock WhatsApp
- [ ] **Automated Deployment** — Deploy ke server via CI/CD
- [ ] **Docker Compose Production** — Production-grade docker-compose.yml

## 📋 Phase 4: Advanced Features

### Security & Reliability
- [ ] **Session Isolation** — Isolasi error antar session
- [ ] **Message Queue** — Antrian pesan untuk menghindari overload
- [ ] **Backup & Restore** — Backup auth state & config
- [ ] **Rate Limit per Session** — Prevent abuse per session
- [ ] **IP Whitelist** — Untuk owner-only endpoints

### User Experience
- [ ] **Interactive Menu** — Button-based menu system
- [ ] **Multi-Language Support** — i18n untuk commands
- [ ] **User Preferences** — Persistent user settings
- [ ] **Command Suggestions** — Auto-suggest commands saat typo
- [ ] **Media Gallery** — List & manage downloaded media

### Advanced AI
- [ ] **RAG (Retrieval-Augmented Generation)** — Chat dengan dokumen/knowledge base
- [ ] **Multi-Modal AI** — Process images, audio, video
- [x] **AI Agent Tools** — Function calling untuk actions (6 tools: download_social_media, download_youtube, pinterest_search, gallery_dl_sticker, web_fetch, web_search)
- [ ] **Context-Aware Conversations** — Remember user context across sessions
- [ ] **AI Training/Finetuning** — Custom model fine-tuning
- [ ] **More AI Tools** — Weather, calendar, calculators, etc.

## 🔄 Recent Changes (3 Agustus 2026)

| Perubahan | Files | Status |
|-----------|-------|--------|
| **AI SDK Migration** — Migrasi AI service & tools dari native ke `ai` & `@ai-sdk/openai-compatible` | [`src/services/aiService.ts`](src/services/aiService.ts), [`src/tools/`](src/tools/), [`src/services/systemPrompt.ts`](src/services/systemPrompt.ts) | ✅ Done |

## 🔄 Recent Changes (25 Juni 2026)

| Perubahan | Files | Status |
|-----------|-------|--------|
| **Firecrawl Web Fetch** — Ganti axios+cheerio scraper dengan Firecrawl headless browser API | [`src/tools/definitions/webFetch.ts`](src/tools/definitions/webFetch.ts) | ✅ Done |
| **Firecrawl Web Search** — Ganti SearXNG dengan Firecrawl search endpoint | [`src/tools/definitions/webSearch.ts`](src/tools/definitions/webSearch.ts) | ✅ Done |
| **System Prompt Refactor** — Extract ke `systemPrompt.ts`, dynamic date injection, anti-year-bias | [`src/services/systemPrompt.ts`](src/services/systemPrompt.ts), [`src/services/aiModeHandler.ts`](src/services/aiModeHandler.ts), [`src/bot/botHandler.ts`](src/bot/botHandler.ts) | ✅ Done |
| **Group Prompt Enhancement** — Tool instructions lengkap, web search rules, downloader capability | [`src/services/systemPrompt.ts`](src/services/systemPrompt.ts) | ✅ Done |
| **AI Function Calling System** — ToolRegistry singleton, 6 tools, multi-round execution (max 4) | [`src/tools/`](src/tools/), [`src/types/tools.ts`](src/types/tools.ts) | ✅ Done |
| **DSML Tool Call Recovery** — Parse DSML/XML artifacts dari model AI | [`src/utils/toolCallFilter.ts`](src/utils/toolCallFilter.ts) | ✅ Done |
| **Tool Call Artifact Filter** — Strip residual artifacts dari respons AI | [`src/utils/toolCallFilter.ts`](src/utils/toolCallFilter.ts) | ✅ Done |
| **gallery-dl Sticker Tool** — Buat stiker dari URL atau keyword via gallery-dl | [`src/utils/galleryDlSticker.ts`](src/utils/galleryDlSticker.ts), [`src/tools/definitions/galleryDlSticker.ts`](src/tools/definitions/galleryDlSticker.ts), [`src/plugins/media/galleryDlSticker.ts`](src/plugins/media/galleryDlSticker.ts) | ✅ Done |
| **Twitter/X Download** — Dedicated downloader via yt-dlp | [`src/utils/twitterDownloader.ts`](src/utils/twitterDownloader.ts) | ✅ Done |
| **'other' AI Provider** — Dukungan custom OpenAI-compatible API | [`src/services/aiService.ts`](src/services/aiService.ts), [`.env.example`](.env.example) | ✅ Done |
| **Env Cleanup** — Hapus `SEARXNG_URL`, tambah `FIRECRAWL_URL`, `GALLERY_DL_*`, `OTHER_*` | [`.env.example`](.env.example) | ✅ Done |

## Known Issues

| Issue | Status | Priority | Notes |
|-------|--------|----------|-------|
| YouTube auto-download tidak fully implemented | 🟡 Open | Medium | Hanya fallback ke command manual |
| gallery-dl binary harus diinstall manual | 🟡 Open | Medium | Perlu dokumentasi instalasi |
| Message saving ke DB di-comment out | 🟡 Open | Low | Perlu diaktifkan jika diperlukan |
| Some type safety issues dengan Baileys types | 🟡 Open | Medium | Perlu deklarasi tipe yang lebih ketat |
| Tidak ada rate limiting | 🟡 Open | High | Bisa menyebabkan spam |
| Plugin hot reload belum support | 🟡 Open | Low | Butuh restart untuk reload plugin |
| Group metadata cache TTL 5 menit | 🟡 Open | Low | Konfigurasikan sesuai kebutuhan |
| AI model bias tambah tahun ke query search | 🟢 Resolved | Medium | Diatasi dgn instruksi eksplisit di system prompt + dynamic year injection |
| Tool call artifacts muncul di response | 🟢 Resolved | Medium | Diatasi dgn stripToolCallArtifacts() filter |

## 📈 Performance Goals

- **Message Processing Latency**: < 500ms (non-AI)
- **AI Response Time**: < 5s (first token)
- **Session Reconnect**: < 30s (max)
- **Plugin Load Time**: < 2s (all plugins)
- **Memory Usage**: < 200MB per session
- **Uptime**: 99.9% (excluding WhatsApp outages)

---

> **Legend:**
> - [x] Completed
> - [ ] Planned / In Progress
> - 🟡 Known Issue
> - 🟢 Resolved
> - 🔴 Critical

# Bot-Baileys-AI

Multi-session WhatsApp bot with plugin architecture, media download capabilities, and PostgreSQL database using Prisma ORM.

## Features

- ✅ **Multi-session support**: Manage multiple WhatsApp sessions simultaneously
- ✅ **Plugin architecture**: Modular command system with category-based organization
- ✅ **Media downloads**: Download content from Instagram, TikTok, YouTube
- ✅ **Sticker creation**: Convert images/videos to WhatsApp stickers
- ✅ **PostgreSQL database**: Store session data using Prisma ORM
- ✅ **Auto-reconnection**: Automatically reconnect when connection is lost
- ✅ **Session management**: Create, list, and disconnect sessions via commands
- ✅ **TypeScript**: Fully typed with TypeScript for better development experience
- ✅ **Modified Baileys**: Using Baileys fork with button support

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- pnpm (recommended) or npm/yarn

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Bot-Baileys-AI
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set your PostgreSQL connection string:
   ```
   DATABASE_URL="postgresql://username:password@localhost:5432/bot_baileys?schema=public"
   ```

4. **Set up the database**
   ```bash
   # Generate Prisma client
   pnpm prisma:generate
   
   # Run database migrations
   pnpm prisma:migrate
   ```

## Usage

### Starting the bot

To start the bot with existing sessions:
```bash
pnpm dev
```

### Creating a new session

To create a new WhatsApp session:
```bash
pnpm dev -- --session=my-session-id
```

The bot will display a QR code in the terminal. Scan it with WhatsApp to authenticate.

### Force clear session

To force clear and recreate a session:
```bash
pnpm dev -- --session=my-session-id --force-clear
```

## Available Commands

### Basic Commands
- `!ping` / `!p` - Test bot response
- `!help` / `!h` / `!menu` - Show available commands
- `!status` / `!s` - Check bot status

### Media Commands
- `!ig <url>` - Download Instagram content
- `!tiktok <url>` - Download TikTok video
- `!yt <url>` - Download YouTube video
- `!sticker` - Convert image/video to sticker (reply to media)

### Session Commands (Admin Only)
- `!create_session <id>` / `!cs <id>` - Create new session
- `!list_sessions` / `!ls` - List all active sessions
- `!disconnect_session <id>` / `!ds <id>` - Disconnect a session

## Project Structure

```
Bot-Baileys-AI/
├── prisma/
│   └── schema.prisma              # Prisma database schema
├── src/
│   ├── bot/
│   │   ├── autoDownload.ts        # Auto-download handler
│   │   └── botHandler.ts          # Bot message and event handler
│   ├── database/
│   │   └── prisma.ts              # Prisma client configuration
│   ├── plugins/
│   │   ├── basic/                 # Basic command plugins
│   │   │   ├── help.ts
│   │   │   ├── ping.ts
│   │   │   └── status.ts
│   │   ├── media/                 # Media download plugins
│   │   │   ├── instagram.ts
│   │   │   ├── sticker.ts
│   │   │   ├── tiktok.ts
│   │   │   └── youtube.ts
│   │   ├── session/               # Session management plugins
│   │   ├── pluginManager.ts       # Plugin loader and executor
│   │   └── README.md              # Plugin system documentation
│   ├── session/
│   │   ├── authStateDB.ts         # Auth state database management
│   │   ├── sessionHelper.ts       # Session helper functions
│   │   └── sessionManager.ts      # Multi-session management
│   ├── types/                     # TypeScript type definitions
│   └── index.ts                   # Main entry point
├── .env.example                   # Environment variables example
├── package.json                   # Project dependencies
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This file
```

## Database Schema

The bot uses these main tables:

- **Session**: Stores WhatsApp session information and auth state
- **Message**: Stores all messages sent/received
- **BotConfig**: Stores bot configuration settings

## Plugin System

The bot uses a modular plugin system that allows easy extension of functionality. Plugins are organized by category:

- **basic**: Core utility commands (ping, help, status)
- **media**: Media download and processing commands
- **session**: Session management commands

### Adding a New Plugin

1. Create a new file in the appropriate category folder (e.g., `src/plugins/basic/mycommand.ts`)
2. Implement the `CommandModule` interface
3. The plugin will be automatically loaded on bot restart

See `src/plugins/README.md` for detailed plugin development guide.

## Development

### Build the project
```bash
pnpm build
```

### Run in production
```bash
pnpm start
```

### Type checking
```bash
pnpm type-check
```

### Open Prisma Studio (database GUI)
```bash
pnpm prisma:studio
```

## Technology Stack

- **Baileys**: WhatsApp Web API library (modified fork with button support)
- **Prisma**: Type-safe ORM for PostgreSQL
- **TypeScript**: Type-safe JavaScript
- **pino**: Fast JSON logger
- **nexo-aio-downloader**: All-in-one media downloader
- **@tobyg74/tiktok-api-dl**: TikTok video downloader
- **wa-sticker-formatter**: WhatsApp sticker creation
- **link-preview-js**: Link preview generation

## Troubleshooting

### Connection issues
- Make sure your PostgreSQL database is running
- Check your DATABASE_URL in `.env`
- Ensure your firewall allows PostgreSQL connections

### Session not connecting
- Use `--force-clear` flag to reset the session
- Re-scan the QR code
- Check the session ID is valid

### Plugin not loading
- Ensure the plugin file is in the correct category folder
- Check that the plugin implements the correct interface
- Restart the bot to reload plugins

### Media download errors
- Verify the URL is correct and accessible
- Some platforms may have rate limits or require authentication
- Check console logs for specific error messages

### Database errors
- Run `pnpm prisma:migrate` to ensure schema is up to date
- Check database permissions
- Verify PostgreSQL is running

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

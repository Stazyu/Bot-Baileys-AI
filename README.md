# Bot-Baileys-AI

Multi-session WhatsApp bot using Baileys with PostgreSQL database and Prisma ORM.

## Features

- ✅ **Multi-session support**: Manage multiple WhatsApp sessions simultaneously
- ✅ **PostgreSQL database**: Store session data and messages using Prisma ORM
- ✅ **Auto-reconnection**: Automatically reconnect when connection is lost
- ✅ **Message logging**: Store all messages in the database
- ✅ **Event handling**: Handle messages, group events, and message updates
- ✅ **TypeScript**: Fully typed with TypeScript for better development experience

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

### Available Commands

Once the bot is connected, you can use these commands in WhatsApp:

- `!ping` - Test bot response
- `!help` - Show help message
- `!status` - Check bot status

## Project Structure

```
Bot-Baileys-AI/
├── prisma/
│   └── schema.prisma          # Prisma database schema
├── src/
│   ├── bot/
│   │   └── botHandler.ts      # Bot message and event handler
│   ├── database/
│   │   └── prisma.ts          # Prisma client configuration
│   ├── session/
│   │   └── sessionManager.ts # Multi-session management
│   └── index.ts               # Main entry point
├── .env.example               # Environment variables example
├── package.json               # Project dependencies
├── tsconfig.json              # TypeScript configuration
└── README.md                  # This file
```

## Database Schema

The bot uses three main tables:

- **Session**: Stores WhatsApp session information
- **Message**: Stores all messages sent/received
- **BotConfig**: Stores bot configuration settings

## Development

### Build the project
```bash
pnpm build
```

### Run in production
```bash
pnpm start
```

### Open Prisma Studio (database GUI)
```bash
pnpm prisma:studio
```

## Customization

### Adding custom commands

Edit `src/bot/botHandler.ts` and add your custom commands in the `processMessage` method:

```typescript
if (text.toLowerCase() === '!mycommand') {
  await this.socket.sendMessage(remoteJid, {
    text: 'Your response here',
  });
}
```

### Handling different message types

The bot handler already supports:
- Text messages
- Image messages
- Video messages
- Audio messages
- Document messages

You can extend this by adding more handlers in the `processMessage` method.

## Troubleshooting

### Connection issues
- Make sure your PostgreSQL database is running
- Check your DATABASE_URL in `.env`
- Ensure your firewall allows PostgreSQL connections

### Session not connecting
- Delete the session folder in `sessions/` directory
- Re-create the session using `--session=` flag
- Scan the QR code again

### Database errors
- Run `pnpm prisma:migrate` to ensure schema is up to date
- Check database permissions
- Verify PostgreSQL is running

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

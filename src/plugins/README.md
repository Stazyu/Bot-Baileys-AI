# Plugin System

This directory contains the plugin system for the Bot-Baileys-AI. Plugins allow you to extend the bot's functionality in a modular and scalable way.

## Architecture

### Core Components

- **types.ts**: Type definitions for plugins, commands, and contexts
- **pluginManager.ts**: Manages loading, unloading, and executing plugins
- **basicCommands.ts**: Basic commands (ping, help, status)
- **sessionCommands.ts**: Session management commands

## Creating a New Plugin

### 1. Create a new plugin file

Create a new TypeScript file in the `src/plugins/` directory (e.g., `myPlugin.ts`).

### 2. Implement the plugin interface

```typescript
import type { PluginModule, CommandContext } from '../types';

const myPlugin: PluginModule = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'Description of your plugin',
  author: 'Your Name',
  commands: [
    {
      name: 'mycommand',
      aliases: ['mc', 'mycmd'],
      description: 'Command description',
      usage: '!mycommand <arg>',
      category: 'mycategory',
      cooldown: 5000, // 5 seconds cooldown
      adminOnly: false,
      groupOnly: false,
      privateOnly: false,
    },
  ],
  handlers: {
    mycommand: async function (context: CommandContext, args: string[]): Promise<void> {
      // Your command logic here
      await context.socket.sendMessage(context.fromJid, {
        text: 'Hello from my command!',
      });
    },
  },
  onLoad: async function (): Promise<void> {
    console.log('My plugin loaded!');
  },
  onUnload: async function (): Promise<void> {
    console.log('My plugin unloaded!');
  },
};

export default myPlugin;
```

### 3. Plugin will be automatically loaded

The plugin manager automatically loads all `.ts` files in the `src/plugins/` directory (except `types.ts` and `pluginManager.ts`).

## Command Context

The `CommandContext` provides the following information:

```typescript
interface CommandContext {
  socket: WASocket;              // WhatsApp socket instance
  sessionId: string;             // Current session ID
  fromJid: string;               // Sender JID
  fromMe: boolean;               // Whether message is from the bot
  pushName?: string;             // Sender name
  messageTimestamp?: number;     // Message timestamp
  message: any;                  // Full message object
}
```

## Command Configuration Options

- **name**: Command name (required)
- **aliases**: Alternative command names (optional)
- **description**: Command description (required)
- **usage**: Usage example (required)
- **category**: Command category for grouping (optional)
- **cooldown**: Cooldown in milliseconds (optional)
- **adminOnly**: Only bot admins can use (optional, default: false)
- **groupOnly**: Only works in groups (optional, default: false)
- **privateOnly**: Only works in private chats (optional, default: false)

## Plugin Lifecycle Hooks

- **onLoad**: Called when the plugin is loaded (optional)
- **onUnload**: Called when the plugin is unloaded (optional)

## Available Commands

### Basic Commands
- `!ping` / `!p` - Test bot response
- `!help` / `!h` / `!menu` - Show available commands
- `!status` / `!s` - Check bot status

### Session Commands (Admin Only)
- `!create_session <id>` / `!cs <id>` - Create new session
- `!list_sessions` / `!ls` - List all active sessions
- `!disconnect_session <id>` / `!ds <id>` - Disconnect a session

## Example: Creating a Fun Commands Plugin

```typescript
import type { PluginModule, CommandContext } from '../types';

const funCommandsPlugin: PluginModule = {
  name: 'fun-commands',
  version: '1.0.0',
  description: 'Fun and entertainment commands',
  author: 'Bot-Baileys-AI',
  commands: [
    {
      name: 'joke',
      aliases: ['j'],
      description: 'Tell a random joke',
      usage: '!joke',
      category: 'fun',
    },
    {
      name: 'quote',
      aliases: ['q'],
      description: 'Get an inspirational quote',
      usage: '!quote',
      category: 'fun',
    },
  ],
  handlers: {
    joke: async function (context: CommandContext, args: string[]): Promise<void> {
      const jokes = [
        'Why don\'t scientists trust atoms? Because they make up everything!',
        'I told my wife she was drawing her eyebrows too high. She looked surprised.',
        'Why did the scarecrow win an award? He was outstanding in his field!',
      ];
      const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
      await context.socket.sendMessage(context.fromJid, {
        text: `😂 ${randomJoke}`,
      });
    },
    quote: async function (context: CommandContext, args: string[]): Promise<void> {
      const quotes = [
        'The only way to do great work is to love what you do. - Steve Jobs',
        'Innovation distinguishes between a leader and a follower. - Steve Jobs',
        'Stay hungry, stay foolish. - Steve Jobs',
      ];
      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
      await context.socket.sendMessage(context.fromJid, {
        text: `💡 ${randomQuote}`,
      });
    },
  },
};

export default funCommandsPlugin;
```

## Benefits of Plugin System

- **Modularity**: Commands are organized into separate files
- **Scalability**: Easy to add new features without modifying core code
- **Maintainability**: Each plugin can be developed and tested independently
- **Reusability**: Plugins can be shared across different bot instances
- **Organization**: Commands can be grouped by category
- **Flexibility**: Easy to enable/disable specific plugins

## Testing

To test your plugin:

1. Create the plugin file in `src/plugins/`
2. Restart the bot to load the new plugin
3. Test the command in WhatsApp
4. Check the console for any errors

## Troubleshooting

- **Plugin not loading**: Ensure the file is in `src/plugins/` and exports a default plugin object
- **Command not found**: Check that the command name in handlers matches the command name in commands array
- **TypeScript errors**: Ensure your plugin implements the `PluginModule` interface correctly

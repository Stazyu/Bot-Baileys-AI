import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { WASocket } from '@stazyu/baileys';
import { log } from '../utils/logger.js';
import type { PluginModule, CommandContext, CommandConfig, CategoryPlugin, CommandModule } from '../types/index.js';
import { isOwner } from '../config/botConfig.js';
import { userService } from '../services/userService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class PluginManager {
  private plugins: Map<string, PluginModule | CategoryPlugin> = new Map();
  private commandMap: Map<string, { plugin: string; config: CommandConfig; handler: any }> = new Map();
  private aliasMap: Map<string, string> = new Map();
  private commandOnLoadHooks: Array<() => Promise<void> | void> = [];
  private commandOnUnloadHooks: Array<() => Promise<void> | void> = [];

  async loadPlugins(): Promise<void> {
    const pluginsDir = join(__dirname);
    let entries: string[];

    try {
      entries = await readdir(pluginsDir);
    } catch (error) {
      log.error(`❌ Failed to read plugins directory:`, error as object);
      return; // Cannot proceed without plugins directory
    }

    let loadedPluginCount = 0;
    let failedPluginCount = 0;

    for (const entry of entries) {
      const fullPath = join(pluginsDir, entry);
      let fileStat;

      try {
        fileStat = await stat(fullPath);
      } catch (error) {
        log.warn(`⚠️ Cannot stat plugin entry "${entry}":`, error as object);
        failedPluginCount++;
        continue;
      }

      try {
        // Load legacy plugin files (direct .ts files in plugins dir)
        if (fileStat.isFile() && (extname(entry) === '.ts' || extname(entry) === '.js') && !entry.endsWith('.d.ts') && entry !== 'types.ts' && entry !== 'types.js' && entry !== 'pluginManager.ts' && entry !== 'pluginManager.js' && entry !== 'basicCommands.ts' && entry !== 'basicCommands.js' && entry !== 'sessionCommands.ts' && entry !== 'sessionCommands.js' && !entry.endsWith('.backup.ts') && !entry.endsWith('.backup.js')) {
          await this.loadLegacyPlugin(fullPath, entry);
          loadedPluginCount++;
        }
        // Load category folders (new folder-based structure)
        else if (fileStat.isDirectory() && !entry.startsWith('.')) {
          await this.loadCategoryPlugin(fullPath, entry);
          loadedPluginCount++;
        }
      } catch (error) {
        log.error(`❌ Failed to load plugin "${entry}":`, error as object);
        failedPluginCount++;
      }
    }

    // Execute all command onLoad hooks
    let hooksFailed = 0;
    for (const hook of this.commandOnLoadHooks) {
      try {
        await hook();
      } catch (error) {
        log.error(`❌ Failed to execute command onLoad hook:`, error as object);
        hooksFailed++;
      }
    }

    const failedMsg = failedPluginCount > 0 ? ` (${failedPluginCount} failed)` : '';
    const hooksMsg = hooksFailed > 0 ? `, ${hooksFailed} hook(s) failed` : '';
    log.info(`📦 Loaded ${this.plugins.size} plugin(s) with ${this.commandMap.size} command(s)${failedMsg}${hooksMsg}`);
  }

  private async loadLegacyPlugin(fullPath: string, entry: string): Promise<void> {
    try {
      const pluginPath = `file://${fullPath}`;
      const module: any = await import(pluginPath);

      if (module.default && this.isValidPlugin(module.default)) {
        const plugin: PluginModule = module.default;

        // Call onLoad if exists
        if (plugin.onLoad) {
          await plugin.onLoad();
        }

        // Register plugin
        this.plugins.set(plugin.name, plugin);

        // Register commands
        for (const command of plugin.commands) {
          const handler = plugin.handlers[command.name];

          if (handler !== undefined) {
            this.commandMap.set(command.name.toLowerCase(), {
              plugin: plugin.name,
              config: command,
              handler,
            });

            // Register aliases
            if (command.aliases) {
              for (const alias of command.aliases) {
                this.aliasMap.set(alias.toLowerCase(), command.name.toLowerCase());
              }
            }
          }
        }

        log.info(`✅ Plugin "${plugin.name}" loaded successfully`);
      }
    } catch (error) {
      log.error(`❌ Failed to load plugin ${entry}:`, error as object);
    }
  }

  private async loadCategoryPlugin(categoryPath: string, categoryName: string): Promise<void> {
    try {
      const indexPath = join(categoryPath, 'index.ts');
      const indexStat = await stat(indexPath).catch(() => null);

      let plugin: CategoryPlugin;
      let commands: CommandModule[] = [];

      // Check if index.ts exists (category plugin with index)
      if (indexStat && indexStat.isFile()) {
        const module: any = await import(`file://${indexPath}`);
        if (module.default && this.isValidCategoryPlugin(module.default)) {
          plugin = module.default;
          commands = plugin.commands || [];
        } else {
          // Fallback to auto-discover if index.ts exists but is invalid
          plugin = {
            name: categoryName,
            version: '1.0.0',
            description: `${categoryName} commands`,
            author: 'Bot-Baileys-AI',
            commands: [],
          };
        }
      } else {
        // Auto-discover command files in the folder
        const entries = await readdir(categoryPath);
        for (const entry of entries) {
          const fullPath = join(categoryPath, entry);
          const fileStat = await stat(fullPath);

          if (fileStat.isFile() && (extname(entry) === '.ts' || extname(entry) === '.js') && !entry.endsWith('.d.ts') && entry !== 'index.ts' && entry !== 'index.js') {
            try {
              const module: any = await import(`file://${fullPath}`);
              if (module.default && this.isValidCommandModule(module.default)) {
                commands.push(module.default);
              }
            } catch (error) {
              log.error(`❌ Failed to load command ${entry}:`, error as object);
            }
          }
        }

        // Create auto-generated category plugin
        plugin = {
          name: categoryName,
          version: '1.0.0',
          description: `${categoryName} commands`,
          author: 'Bot-Baileys-AI',
          commands: [],
        };
      }

      // Call onLoad if exists
      if (plugin.onLoad) {
        await plugin.onLoad();
      }

      // Register plugin
      this.plugins.set(plugin.name, plugin);

      // Register commands
      for (const commandModule of commands) {
        const command = commandModule.config;
        const handler = commandModule.handler;

        this.commandMap.set(command.name.toLowerCase(), {
          plugin: plugin.name,
          config: command,
          handler,
        });

        // Register aliases
        if (command.aliases) {
          for (const alias of command.aliases) {
            this.aliasMap.set(alias.toLowerCase(), command.name.toLowerCase());
          }
        }

        // Store command-specific hooks
        if (commandModule.onLoad) {
          this.commandOnLoadHooks.push(commandModule.onLoad);
        }
        if (commandModule.onUnload) {
          this.commandOnUnloadHooks.push(commandModule.onUnload);
        }
      }

      log.info(`✅ Category plugin "${plugin.name}" loaded with ${commands.length} command(s)`);
    } catch (error) {
      log.error(`❌ Failed to load category plugin ${categoryName}:`, error as object);
    }
  }

  async unloadPlugins(): Promise<void> {
    // Execute all command onUnload hooks
    for (const hook of this.commandOnUnloadHooks) {
      try {
        await hook();
      } catch (error) {
        log.error(`❌ Failed to execute command onUnload hook:`, error as object);
      }
    }

    for (const [name, plugin] of this.plugins) {
      try {
        if (plugin.onUnload) {
          await plugin.onUnload();
        }
        log.info(`✅ Plugin "${name}" unloaded successfully`);
      } catch (error) {
        log.error(`❌ Failed to unload plugin ${name}:`, error as object);
      }
    }

    this.plugins.clear();
    this.commandMap.clear();
    this.aliasMap.clear();
    this.commandOnLoadHooks = [];
    this.commandOnUnloadHooks = [];
  }

  private async isGroupAdmin(context: CommandContext, jid: string, participantJid: string): Promise<boolean> {
    try {
      if (!jid.endsWith('@g.us')) {
        return false;
      }
      const metadata = await context.socket.groupMetadata(jid);
      const participant = metadata.participants.find((p) => p.phoneNumber === participantJid);
      return participant ? (participant.admin === 'admin' || participant.admin === 'superadmin') : false;
    } catch (error) {
      log.error(`❌ [PluginManager] Error checking group admin:`, error as object);
      return false;
    }
  }

  async executeCommand(commandName: string, context: CommandContext, args: string[]): Promise<boolean> {
    try {
      // ── Resolve alias ──────────────────────────────────────────────────
      const resolvedCommand = this.aliasMap.get(commandName.toLowerCase()) || commandName.toLowerCase();
      const commandData = this.commandMap.get(resolvedCommand);

      if (!commandData) {
        return false;
      }

      const participantJid = context.simplified?.user_id || context.fromJid;

      // ── Check permissions ──────────────────────────────────────────────
      if (commandData.config.ownerOnly) {
        const isAuthorizedOwner = context.fromMe || isOwner(participantJid);
        if (!isAuthorizedOwner) {
          log.info(`🚫 [PluginManager] Permission denied: owner only for "${resolvedCommand}"`);
          await context.socket.sendMessage(context.fromJid, {
            text: '❌ This command is owner only',
          }).catch(() => {});
          return true;
        }
      }

      if (commandData.config.adminOnly) {
        const isGroup = context.fromJid.endsWith('@g.us');
        const isAdmin = context.fromMe || (isGroup && await this.isGroupAdmin(context, context.fromJid, participantJid));
        if (!isAdmin) {
          log.info(`🚫 [PluginManager] Permission denied: admin only for "${resolvedCommand}"`);
          await context.socket.sendMessage(context.fromJid, {
            text: '❌ This command is admin only',
          }).catch(() => {});
          return true;
        }
      }

      if (commandData.config.groupOnly && !context.fromJid.includes('@g.us')) {
        log.info(`🚫 [PluginManager] Permission denied: group only for "${resolvedCommand}"`);
        await context.socket.sendMessage(context.fromJid, {
          text: '❌ This command can only be used in groups',
        }).catch(() => {});
        return true;
      }

      if (commandData.config.privateOnly && context.fromJid.includes('@g.us')) {
        log.info(`🚫 [PluginManager] Permission denied: private only for "${resolvedCommand}"`);
        await context.socket.sendMessage(context.fromJid, {
          text: '❌ This command can only be used in private chats',
        }).catch(() => {});
        return true;
      }

      if (commandData.config.premiumOnly) {
        const isAuthorizedOwner = context.fromMe || isOwner(participantJid);
        if (!isAuthorizedOwner) {
          const user = await userService.getUser(participantJid);
          const userTier = user?.tier ?? 'free';
          if (userTier === 'free') {
            log.info(`🚫 [PluginManager] Permission denied: premium only for "${resolvedCommand}" (tier: ${userTier})`);
            await context.socket.sendMessage(context.fromJid, {
              text: '⭐ *Premium Only!*\n\nPerintah ini hanya tersedia untuk pengguna *Premium* / *Pro*.\nHubungi owner untuk upgrade ke Premium.',
            }).catch(() => {});
            return true;
          }
        }
      }

      // ── Execute handler ────────────────────────────────────────────────
      log.info(`✅ [PluginManager] Permissions OK, executing "${resolvedCommand}" handler`);

      // Execute with a safety net for handler errors
      try {
        await commandData.handler(context, args);
      } catch (handlerError) {
        // Propagate handler errors to the outer catch for unified handling
        throw handlerError;
      }

      log.info(`✅ [PluginManager] Command "${resolvedCommand}" executed successfully`);
      return true;
    } catch (error: any) {
      // ── Unified error handling with error type detection ───────────────
      const errorMsg = error?.message?.toLowerCase() || '';
      let userMessage = '❌ An error occurred while executing this command';

      if (errorMsg.includes('timeout') || errorMsg.includes('timedout')) {
        userMessage = '❌ Command timed out. Please try again.';
      } else if (errorMsg.includes('rate-overlimit') || errorMsg.includes('429') || errorMsg.includes('too many')) {
        userMessage = '❌ Too many requests. Please wait a moment.';
      } else if (errorMsg.includes('not-authorized') || errorMsg.includes('403')) {
        userMessage = '❌ Bot is not authorized to perform this action.';
      } else if (errorMsg.includes('connection') || errorMsg.includes('econnrefused') || errorMsg.includes('econnreset')) {
        userMessage = '❌ Connection error. Please try again.';
      } else if (errorMsg.includes('validation') || errorMsg.includes('invalid')) {
        userMessage = '❌ Invalid command usage. Check syntax and try again.';
      }

      log.error(`❌ [PluginManager] Error executing command "${commandName}":`, error as object);

      // Notify user (best-effort)
      try {
        await context.socket.sendMessage(context.fromJid, { text: userMessage });
      } catch {
        // Last-resort: swallow send failure
      }

      // Return true (we handled it, the caller shouldn't show "command not found")
      return true;
    }
  }

  public getCommand(name: string): { config: CommandConfig; plugin: string } | undefined {
    try {
      const resolvedCommand = this.aliasMap.get(name.toLowerCase()) || name.toLowerCase();
      const commandData = this.commandMap.get(resolvedCommand);

      if (commandData) {
        return {
          config: commandData.config,
          plugin: commandData.plugin,
        };
      }

      return undefined;
    } catch (error) {
      log.error(`❌ [PluginManager] Error in getCommand("${name}"):`, error as object);
      return undefined;
    }
  }

  public getAllCommands(): Array<{ config: CommandConfig; plugin: string }> {
    try {
      const commands: Array<{ config: CommandConfig; plugin: string }> = [];

      for (const [name, data] of this.commandMap) {
        commands.push({
          config: data.config,
          plugin: data.plugin,
        });
      }

      return commands;
    } catch (error) {
      log.error(`❌ [PluginManager] Error in getAllCommands:`, error as object);
      return [];
    }
  }

  public getPlugins(): (PluginModule | CategoryPlugin)[] {
    try {
      return Array.from(this.plugins.values());
    } catch (error) {
      log.error(`❌ [PluginManager] Error in getPlugins:`, error as object);
      return [];
    }
  }

  private isValidPlugin(plugin: any): plugin is PluginModule {
    return (
      plugin &&
      typeof plugin.name === 'string' &&
      typeof plugin.version === 'string' &&
      typeof plugin.description === 'string' &&
      Array.isArray(plugin.commands) &&
      typeof plugin.handlers === 'object'
    );
  }

  private isValidCategoryPlugin(plugin: any): plugin is CategoryPlugin {
    return (
      plugin &&
      typeof plugin.name === 'string' &&
      typeof plugin.version === 'string' &&
      typeof plugin.description === 'string' &&
      Array.isArray(plugin.commands)
    );
  }

  private isValidCommandModule(module: any): module is CommandModule {
    return (
      module &&
      module.config &&
      typeof module.config.name === 'string' &&
      typeof module.handler === 'function'
    );
  }
}

export default PluginManager;

import type { WAMessage, WASocket } from 'baileys';
import type { SimplifiedMessage } from '../bot/botHandler.js';

export interface CommandContext {
  socket: WASocket;
  sessionId: string;
  fromJid: string;
  fromMe: boolean;
  pushName?: string;
  messageTimestamp?: number;
  message: WAMessage;
  simplified?: SimplifiedMessage;
  pluginManager?: any;
}

export interface CommandConfig {
  name: string;
  aliases?: string[];
  description: string;
  usage: string;
  category?: string;
  cooldown?: number;
  adminOnly?: boolean;
  groupOnly?: boolean;
  privateOnly?: boolean;
}

export type CommandHandler = (context: CommandContext, args: string[]) => Promise<void> | void;

export interface CommandModule {
  config: CommandConfig;
  handler: CommandHandler;
  onLoad?(): Promise<void> | void;
  onUnload?(): Promise<void> | void;
}

import type { WAMessage, WASocket } from '@stazyu/baileys';
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
  ownerOnly?: boolean;
  /** Group admin only — requester must be a WhatsApp admin in the current group. Not bot-wide admin. */
  groupAdminOnly?: boolean;
  groupOnly?: boolean;
  privateOnly?: boolean;
  /** Whether this command is only accessible by premium/pro users. Owners bypass this check. */
  premiumOnly?: boolean;
  /** Whether this command is subject to premium daily limit. Default: false — must opt-in per command. */
  limitEnabled?: boolean;
}

export type CommandHandler = (context: CommandContext, args: string[]) => Promise<void> | void;

export interface CommandModule {
  config: CommandConfig;
  handler: CommandHandler;
  onLoad?(): Promise<void> | void;
  onUnload?(): Promise<void> | void;
}

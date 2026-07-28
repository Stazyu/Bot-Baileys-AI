import type { WAMessage, WAMessageUpdate, WASocket } from '@innovatorssoft/baileys';
import { proto } from 'baileys';
import PluginManager from '../plugins/pluginManager.js';
import { detectSocialMediaLink, downloadFromSocialMedia } from './autoDownload.js';
import { getPrefixes, isMaintenance, getMaintenanceMessage, isOwner } from '../config/botConfig.js';
import { isAIModeEnabled } from '../plugins/ai/aiCommand.js';
import { isAIModeEnabled as isAIModeEnabledAsync, initAIModePersistence } from '../services/aiModePersistence.js';
import { isAIGroupEnabled, initAIGroupToggle } from '../services/groupToggle.js';
import moment from 'moment';
import NodeCache from 'node-cache';
import { handleYouTubeButton } from '../utils/youtubeButtonHandler.js';
import { stripToolCallArtifacts } from '../utils/toolCallFilter.js';
import { validateMessage, validateJid } from '../utils/messageValidator.js';
import { rateLimiter } from '../utils/rateLimiter.js';
import { log } from '../utils/logger.js';
import { userService } from '../services/userService.js';
import { premiumService } from '../services/premiumService.js';

moment.locale('jv');

// Color utility for console output
const color = (text: string, colorName: string): string => {
  const colors: Record<string, string> = {
    reset: '\x1b[0m',
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
  };
  return `${colors[colorName] || colors.white}${text}${colors.reset}`;
};

type MessageType = keyof WAMessage['message'];

export type SimplifiedMessage = ReturnType<BotHandler['simplified']>;

export class BotHandler {
  private socket: WASocket;
  private sessionId: string;
  private pluginManager: PluginManager;
  private groupCache: NodeCache;

  constructor(socket: WASocket, sessionId: string) {
    log.info(`🤖 [BotHandler] Creating handler for session: ${sessionId}`);
    this.socket = socket;
    this.sessionId = sessionId;
    this.pluginManager = new PluginManager();
    this.groupCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
    this.setupEventHandlers();
    log.info(`✅ [BotHandler] Event handlers attached for session: ${this.sessionId}`);
  }

  async loadPlugins(): Promise<void> {
    try {
      await this.pluginManager.loadPlugins();
      await initAIGroupToggle();
      await initAIModePersistence();
    } catch (error) {
      log.error(`[${this.sessionId}] ❌ Failed to load plugins:`, error as object);
      // Don't throw — allow the bot to run even if plugin loading partially fails
    }
  }

  async unloadPlugins(): Promise<void> {
    try {
      await this.pluginManager.unloadPlugins();
    } catch (error) {
      log.error(`[${this.sessionId}] ❌ Failed to unload plugins:`, error as object);
    }
  }

  private async getGroupName(jid: string): Promise<string | null> {
    if (!jid.endsWith('@g.us')) return null;

    // Check cache first
    const cachedName = this.groupCache.get<string>(jid);
    if (cachedName) {
      return cachedName;
    }

    try {
      const metadata = await this.socket.groupMetadata(jid);
      const groupName = metadata.subject || null;

      // Cache the result
      if (groupName) {
        this.groupCache.set(jid, groupName);
      }

      return groupName;
    } catch (error) {
      log.error(`[${this.sessionId}] ⚠️ Error getting group name for ${jid}:`, error as object);
      return null;
    }
  }

  private simplified(msg: proto.IWebMessageInfo) {
    // console.log('msg :', msg);
    const chatMessage = msg.message;
    const id = msg.key?.id;
    const from = msg.key?.remoteJid;
    const fromMe = msg.key?.fromMe;
    const participant = msg.key?.participant;
    const isGroup = from?.endsWith('@g.us');
    const type = !!chatMessage
      ? (Object.keys(chatMessage!).filter((v, i) => v !== 'messageContextInfo')[0] as MessageType)
      : null;
    const body =
      msg.message?.conversation ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      msg.message?.extendedTextMessage?.text;
    const messageTimeStamp = msg.messageTimestamp;
    const timeStampHandler = Date.now();
    const quotedInfo =
      type === 'extendedTextMessage' && (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message?.extendedTextMessage?.contextInfo?.mentionedJid)
        ? msg.message?.extendedTextMessage?.contextInfo
        : undefined;
    const quotedMessageType = quotedInfo?.quotedMessage
      ? (Object.getOwnPropertyNames(quotedInfo.quotedMessage)[0] as MessageType)
      : undefined;

    const prefixes = getPrefixes();
    const botNumber = this.socket.user?.id?.split(':')[0] + '@s.whatsapp.net';
    const mentions = type === 'extendedTextMessage' ? quotedInfo?.mentionedJid : undefined;
    const time = moment().utcOffset(7).format('HH:mm:ss');
    const date = moment().utcOffset(7).format('Do MMMM YYYY, h:mm:ss a');

    /* ============ Meta User ============ */
    const rawUserId = isGroup
      ? (msg?.key as any)?.participantAlt as string
      : (msg?.key as any)?.remoteJidAlt as string;
    const user_id = rawUserId?.replace(/:\d+@s\.whatsapp\.net$/, '@s.whatsapp.net');
    const pushName = msg.pushName;

    /* ============ Meta Group ============= */
    const groupName = isGroup ? from : null;

    /* ========== Message type ========== */
    const isMedia =
      type === 'imageMessage' || type === 'videoMessage' || type === 'audioMessage' || type === 'stickerMessage';
    const isAudio = type === 'audioMessage';
    const isImage = type === 'imageMessage';
    const isVideo = type === 'videoMessage';
    const isSticker = type === 'stickerMessage';
    const isDocument = type === 'documentMessage';
    const isButtonMessage = type === 'buttonsMessage';
    const isButtonResponseMessage = type === 'buttonsResponseMessage';
    const isTemplateButtonReplyMessage = type === 'templateButtonReplyMessage';
    const isListResponseMessage = type === 'listResponseMessage';
    const isInteractiveResponseMessage = type === 'interactiveResponseMessage';
    const isQuotedAudio = type === 'extendedTextMessage' && quotedMessageType === 'audioMessage';
    const isQuotedImage = type === 'extendedTextMessage' && quotedMessageType === 'imageMessage';
    const isQuotedVideo = type === 'extendedTextMessage' && quotedMessageType === 'videoMessage';
    const isQuotedSticker = type === 'extendedTextMessage' && quotedMessageType === 'stickerMessage';
    const isQuotedDocument = type === 'extendedTextMessage' && quotedMessageType === 'documentMessage';
    const isQuotedMedia = isQuotedAudio || isQuotedImage || isQuotedVideo || isQuotedSticker || isQuotedDocument;

    // Check if message starts with any of the configured prefixes
    const getText = () => {
      if (type === 'conversation') return msg?.message?.conversation;
      if (type === 'imageMessage') return msg?.message?.imageMessage?.caption;
      if (type === 'videoMessage') return msg?.message?.videoMessage?.caption;
      if (type === 'extendedTextMessage') return msg?.message?.extendedTextMessage?.text;
      return null;
    };

    const text = getText();
    let matchedPrefix: string | null = null;
    let message_prefix: string | null = null;

    if (text) {
      for (const prefix of prefixes) {
        if (text.startsWith(prefix)) {
          matchedPrefix = prefix;
          message_prefix = text;
          break;
        }
      }
    }
    const getInteractiveButtonId = () => {
      const paramsJson = msg?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
      if (paramsJson) {
        try {
          const parsed = JSON.parse(paramsJson);
          return parsed.id;
        } catch {
          return null;
        }
      }
      return null;
    };

    const message_button =
      type === 'buttonsResponseMessage'
        ? msg?.message?.buttonsResponseMessage?.selectedButtonId
        : type === 'templateMessage'
          ? msg?.message?.templateMessage?.hydratedTemplate?.templateId
          : type === 'templateButtonReplyMessage'
            ? msg?.message?.templateButtonReplyMessage?.selectedId
            : type === 'listResponseMessage'
              ? msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId
              : type === 'interactiveResponseMessage'
                ? getInteractiveButtonId()
                : null;
    let message =
      type === 'conversation'
        ? msg?.message?.conversation
        : type === 'extendedTextMessage'
          ? msg?.message?.extendedTextMessage?.text
          : type === 'imageMessage'
            ? msg?.message?.imageMessage?.caption
            : type === 'videoMessage'
              ? msg?.message?.videoMessage?.caption
              : null;
    message = message && typeof message !== 'object' && matchedPrefix ? null : message;

    const command =
      message_button !== null
        ? message_button?.toLowerCase()
        : message_prefix !== null && matchedPrefix
          ? String(message_prefix)?.slice(matchedPrefix.length)?.trim()?.split(/ +/)?.shift()?.toLowerCase()
          : null;
    const args =
      message && typeof message !== 'object'
        ? message.trim().split(/ +/).slice(1)
        : message_prefix !== null
          ? message_prefix.trim().split(/ +/).slice(1)
          : [];
    const isCmd =
      message && typeof message !== 'object'
        ? prefixes.some(p => message.startsWith(p))
        : message_prefix !== null
          ? prefixes.some(p => message_prefix.startsWith(p))
          : false;

    return {
      id,
      from,
      fromMe,
      participant,
      isGroup,
      type,
      body,
      messageTimeStamp,
      timeStampHandler,
      quotedInfo,
      quotedMessageType,
      botNumber,
      mentions,
      user_id,
      pushName,
      groupName,
      isMedia,
      isAudio,
      isImage,
      isVideo,
      isSticker,
      isDocument,
      isButtonMessage,
      isButtonResponseMessage,
      isTemplateButtonReplyMessage,
      isListResponseMessage,
      isInteractiveResponseMessage,
      isQuotedAudio,
      isQuotedImage,
      isQuotedVideo,
      isQuotedSticker,
      isQuotedDocument,
      isQuotedMedia,
      message_prefix,
      message_button,
      message,
      command,
      args,
      isCmd,
      matchedPrefix,
      time,
      date,
      prefix: matchedPrefix || '',
    };
  }

  private setupEventHandlers(): void {
    log.info(`🔌 [BotHandler] Setting up event handlers for session: ${this.sessionId}`);

    // Handle messages
    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        // Wrap each message in its own try/catch so one bad message never blocks the rest
        try {
          await this.handleMessage(message);
        } catch (error) {
          log.error(
            `[${this.sessionId}] ❌ Fatal error processing message ${message.key?.id || '(no id)'}:`,
            error as object,
          );
          // Recovery: attempt to mark presence as paused so the user knows something happened
          try {
            const jid = message.key?.remoteJid;
            if (jid) {
              await this.socket.sendPresenceUpdate('paused', jid);
            }
          } catch {
            // Presence update failure is non-critical — swallow it
          }
        }
      }
    });

    // Handle group events
    this.socket.ev.on('group-participants.update', async (event) => {
      try {
        log.info(`👥 [BotHandler] group-participants.update event triggered`);
        await this.handleGroupEvent(event);
      } catch (error) {
        log.error(`[${this.sessionId}] ❌ Error in group-participants.update handler:`, error as object);
      }
    });

    // Connection update logging
    this.socket.ev.on('connection.update', (update) => {
      log.debug(`[${this.sessionId}] 🔗 connection.update: ${Object.keys(update).join(', ')}`);
    });

    // Creds update logging
    this.socket.ev.on('creds.update', () => {
      log.debug(`[${this.sessionId}] 🔑 creds.update triggered`);
    });

    // Handle call events gracefully (avoid crash on calls)
    this.socket.ev.on('call', async (calls) => {
      try {
        for (const call of calls) {
          log.info(`[${this.sessionId}] 📞 Call from ${call.from}: ${call.status}`);
        }
      } catch (error) {
        log.error(`[${this.sessionId}] ❌ Error handling call event:`, error as object);
      }
    });

    log.info(`✅ [BotHandler] All event handlers registered for session: ${this.sessionId}`);
  }

  private printLog(msg: ReturnType<typeof this.simplified>): void {
    const { time, date, isCmd, message, command, groupName, isGroup, isMedia, isTemplateButtonReplyMessage, isButtonResponseMessage, message_button, prefix, isAudio, isSticker, user_id } = msg;

    if (!isCmd && isGroup && !isMedia && !isSticker && !command && !message_button) {
      console.log(color(`[GROUP || MSG]`, 'blue'), color('=>', 'white'), color(`TIME: ${time}`, 'yellow'), color(`DATE: ${date}`, 'yellow'), color(message!, 'blue'), color('FROM', 'white'), color(String(user_id).split('@')[0], 'yellow'), color('IN', 'white'), color(groupName!, 'yellow'));
    }
    if (!isCmd && !isGroup && !isMedia && !isSticker && !command && !message_button) {
      console.log(color(`[PRIVATE || MSG]`, 'blue'), color('=>', 'white'), color(`TIME: ${time}`, 'yellow'), color(`DATE: ${date}`, 'yellow'), color(message!, 'blue'), color('FROM', 'white'), color(String(user_id).split('@')[0], 'yellow'));
    }
    if (isCmd && isGroup && !isMedia && !isSticker) {
      console.log(color(`[GROUP || CMD]`, 'cyan'), color('=>', 'white'), color(`TIME: ${time}`, 'yellow'), color(`DATE: ${date}`, 'yellow'), color(prefix + command, 'green'), color('FROM', 'white'), color(String(user_id).split('@')[0], 'yellow'), color('IN', 'white'), color(groupName!, 'yellow'));
    }
    if (isCmd && !isGroup && !isMedia && !isSticker) {
      console.log(color(`[PRIVATE || CMD]`, 'cyan'), color('=>', 'white'), color(`TIME: ${time}`, 'yellow'), color(`DATE: ${date}`, 'yellow'), color(prefix + command, 'green'), color('FROM', 'white'), color(String(user_id).split('@')[0], 'yellow'));
    }
    if (isTemplateButtonReplyMessage && isGroup && !isMedia && !isSticker) {
      console.log(color(`[GROUP || BUTTON]`, 'magenta'), color('=>', 'white'), color(`TIME: ${time}`, 'yellow'), color(`DATE: ${date}`, 'yellow'), color(message_button!, 'magenta'), color('FROM', 'white'), color(String(user_id).split('@')[0], 'yellow'), color('IN', 'white'), color(groupName!, 'yellow'));
    }
    if (isTemplateButtonReplyMessage && !isGroup && !isMedia && !isSticker) {
      console.log(color(`[PRIVATE || BUTTON]`, 'magenta'), color('=>', 'white'), color(`TIME: ${time}`, 'yellow'), color(`DATE: ${date}`, 'yellow'), color(message_button!, 'magenta'), color('FROM', 'white'), color(String(user_id).split('@')[0], 'yellow'));
    }
    if (isButtonResponseMessage && isGroup && !isMedia && !isSticker) {
      console.log(color(`[GROUP || BUTTON]`, 'magenta'), color('=>', 'white'), color(`TIME: ${time}`, 'yellow'), color(`DATE: ${date}`, 'yellow'), color(message_button!, 'magenta'), color('FROM', 'white'), color(String(user_id).split('@')[0], 'yellow'), color('IN', 'white'), color(groupName!, 'yellow'));
    }
    if (isButtonResponseMessage && !isGroup && !isMedia && !isSticker) {
      console.log(color(`[PRIVATE || BUTTON]`, 'magenta'), color('=>', 'white'), color(`TIME: ${time}`, 'yellow'), color(`DATE: ${date}`, 'yellow'), color(message_button!, 'magenta'), color('FROM', 'white'), color(String(user_id).split('@')[0], 'yellow'));
    }
  }

  private async handleMessage(message: WAMessage): Promise<void> {
    try {
      // ── Step 1: Raw structural validation ────────────────────────────────
      if (!message.message) {
        return;
      }

      // ── Step 2: Comprehensive message validation ─────────────────────────
      const validation = validateMessage(message as unknown as Record<string, any>);

      if (!validation.valid) {
        // Log silently for common noise (self-sent, fromMe, duplicates)
        // Only warn on unexpected rejection reasons
        if (
          validation.code === 'FROM_ME_IGNORED' ||
          validation.code === 'DUPLICATE_MESSAGE'
        ) {
          log.debug(`[${this.sessionId}] ℹ️ Message filtered: ${validation.reason}`);
        } else {
          log.warn(`[${this.sessionId}] ⚠️ Message rejected: ${validation.reason}`);
        }
        return;
      }

      // ── Step 3: Simplify message ─────────────────────────────────────────
      const simplified = this.simplified(message);

      // Get actual group name with caching
      if (simplified.isGroup && simplified.from) {
        try {
          const actualGroupName = await this.getGroupName(simplified.from);
          if (actualGroupName) {
            (simplified as any).groupName = actualGroupName;
          }
        } catch (error) {
          log.error(`[${this.sessionId}] ⚠️ Failed to fetch group name for ${simplified.from}:`, error as object);
          // Non-fatal — continue processing
        }
      }

      this.printLog(simplified);

      // ── Step 4: Process the message ──────────────────────────────────────
      await this.processMessage(message, simplified);
    } catch (error) {
      log.error(`[${this.sessionId}] ❌ Error handling message:`, error as object);

      // ── Recovery: Notify user if possible ────────────────────────────────
      try {
        const jid = message.key?.remoteJid;
        if (jid) {
          await this.socket.sendMessage(jid, {
            text: '❌ Terjadi kesalahan internal. Silakan coba lagi.',
          });
        }
      } catch {
        // Best-effort recovery notification — swallow failure
      }
    }
  }

  private async handleMessageUpdate(update: WAMessageUpdate): Promise<void> {
    try {
      log.debug(`[${this.sessionId}] 📝 Message update received`, update as unknown as object);
      // Handle message updates (read receipts, edits, etc.)
    } catch (error) {
      log.error(`[${this.sessionId}] ❌ Error handling message update:`, error as object);
    }
  }

  private async handleGroupEvent(event: any): Promise<void> {
    try {
      log.info(`[${this.sessionId}] 👥 Group event: ${event.action || 'unknown'} in ${event.id}`);

      // Invalidate group name cache so next fetch gets fresh metadata
      if (event.id) {
        this.groupCache.del(event.id);
      }

      // TODO: Handle join/leave messages, promote/demote notifications
    } catch (error) {
      log.error(`[${this.sessionId}] ❌ Error handling group event:`, error as object);
    }
  }

  private async processMessage(message: WAMessage, simplified: ReturnType<typeof this.simplified>): Promise<void> {
    try {
      const { command, args, botNumber, from, isCmd, body, isGroup, user_id, mentions, message: rawMessage, quotedInfo } = simplified;

      // ── User auto-registration (fire & forget, non-blocking) ──────────
      if (user_id) {
        userService.ensureUser(user_id, simplified.pushName ?? undefined, this.sessionId).catch(err => {
          log.debug(`[${this.sessionId}] Non-critical: user persistence failed: ${(err as Error).message}`);
        });
      }

      // Validate user_id JID
      if (user_id) {
        const jidValidation = validateJid(user_id);
        if (!jidValidation.valid) {
          log.warn(`[${this.sessionId}] ⚠️ Invalid user_id JID: ${user_id} — skipping message`);
          return;
        }
      }

      // Validate from JID
      if (from) {
        const fromJidValidation = validateJid(from);
        if (!fromJidValidation.valid) {
          log.warn(`[${this.sessionId}] ⚠️ Invalid from JID: ${from} — skipping message`);
          return;
        }
      }

      // ── Rate limiting check (non-commands only) ────────────────────────
      // Commands skip this — they have their own per-command rate limit below
      // with a proper cooldown message.
      if (user_id && !isCmd) {
        const rateCheck = rateLimiter.checkMessage(user_id);
        if (!rateCheck.allowed) {
          log.debug(`[${this.sessionId}] ⏱ Rate-limited non-command message from ${user_id} (${rateCheck.remainingMs}ms remaining)`);
          return;
        }
      }

      // Check maintenance mode (only for commands, owners can bypass)
      if (isMaintenance() && isCmd && !isOwner(user_id || '')) {
        if (from) {
          await this.socket.sendMessage(from, { text: getMaintenanceMessage() });
        }
        return;
      }

      // ── Group auto-reply: respond when bot is tagged, greeted, or replied ─
      if (isGroup && !isCmd && from) {
        try {
          const botId = this.socket.user?.id?.split(':')[0];
          const botLid = this.socket.user?.lid?.split(':')[0];
          const botNumberJid = botId ? `${botId}@s.whatsapp.net` : '';
          const botNumberLid = botLid ? `${botLid}@lid` : '';

          const isBotMentioned = (mentions || []).some((m: string) =>
            (botNumberLid && m.includes(botNumberLid)) ||
            (botNumberJid && m.includes(botNumberJid)) ||
            m.includes(botNumberJid.split('@')[0])
          );

          let isReplyToBot = false;
          const tagAll = quotedInfo && (quotedInfo.nonJidMentions === 1)
          if (quotedInfo?.quotedMessage) {
            const quotedParticipant = quotedInfo.participant || '';
            isReplyToBot = (botNumberLid && quotedParticipant.includes(botNumberLid)) ||
              (botNumberJid && quotedParticipant.includes(botNumberJid)) ||
              false;
          }

          const isCalled = body?.toLowerCase() ? /(^|\s)(bot\b|bang\s*bot\b|kak\s*bot\b|mas\s*bot\b)/i.test(body) : false;

          if ((isBotMentioned || isReplyToBot || isCalled || tagAll) && isAIGroupEnabled(from)) {
            // ── Daily limit: group AI ─────────────────────────────────
            if (user_id && premiumService.isGroupAiLimitEnabled()) {
              const groupAiCheck = await premiumService.checkGroupAiLimit(user_id);
              if (!groupAiCheck.allowed) {
                const tierMsg = groupAiCheck.tier !== 'free'
                  ? `\n\n💡 Kamu masih bisa upgrade ke tier lebih tinggi untuk menambah limit.`
                  : `\n\n💡 Upgrade ke premium untuk mendapatkan 500 group AI chat/hari: ketik *!premium check*`;
                await this.socket.sendMessage(from, {
                  text: `❌ Limit group AI harian kamu habis (${groupAiCheck.limit}/hari). Coba lagi besok.${tierMsg}`,
                });
                return;
              }
            }
            // Rate-limit group auto-reply per-user
            if (user_id) {
              const aiRateCheck = rateLimiter.check(user_id, '__GROUP_AI__', 3); // 3s per user
              if (!aiRateCheck.allowed) {
                log.debug(`[${this.sessionId}] ⏱ Rate-limited group AI reply for ${user_id}`);
                return;
              }
            }
            log.info(`[${this.sessionId}] 🤖 Group auto-reply triggered for: ${from}`);
            await this.handleGroupAutoReply(simplified, from, message);
            return;
          }
        } catch (error) {
          log.error(`[${this.sessionId}] ❌ Error in group auto-reply logic:`, error as object);
          // Non-fatal — continue to other handlers
        }
      }

      // ── AI mode (private chat only) ────────────────────────────────────
      if (!isCmd && from && !isGroup) {
        try {
          const targetUserId = user_id || simplified.from || '';
          // Dua lapis: sync cache (no overhead) || async DB fallback (cold cache)
          const aiEnabled = isAIModeEnabled(targetUserId) || await isAIModeEnabledAsync(targetUserId);
          if (aiEnabled && body) {
            // ── Daily limit: private AI ──────────────────────────────
            if (user_id && premiumService.isPrivateAiLimitEnabled()) {
              const privateAiCheck = await premiumService.checkPrivateAiLimit(user_id);
              if (!privateAiCheck.allowed) {
                const tierMsg = privateAiCheck.tier !== 'free'
                  ? `\n\n💡 Kamu masih bisa upgrade ke tier lebih tinggi.`
                  : `\n\n💡 Upgrade ke premium: ketik *!premium check*`;
                await this.socket.sendMessage(from, {
                  text: `❌ Limit AI chat harian kamu habis (${privateAiCheck.limit}/hari). Coba lagi besok.${tierMsg}`,
                });
                return;
              }
            }
            // Rate-limit AI messages per-user
            if (user_id) {
              const aiRateCheck = rateLimiter.check(user_id, '__AI_CHAT__', 2); // 2s per user
              if (!aiRateCheck.allowed) {
                log.debug(`[${this.sessionId}] ⏱ Rate-limited AI message from ${user_id}`);
                return;
              }
            }
            await this.handleAIMessage(simplified, body, from, message);
            return;
          }
        } catch (error) {
          log.error(`[${this.sessionId}] ❌ Error in AI mode check:`, error as object);
          // Non-fatal — continue
        }
      }

      // ── Auto-detect social media links ─────────────────────────────────
      if (body && !isCmd && from && !isGroup) {
        try {
          const socialLink = detectSocialMediaLink(body);
          if (socialLink) {
            log.info(`[${this.sessionId}] 🔗 Social media link detected: ${socialLink.platform} - ${socialLink.url}`);
            await downloadFromSocialMedia(socialLink, this.socket, from);
            return;
          }
        } catch (error) {
          log.error(`[${this.sessionId}] ❌ Error detecting/downloading social media link:`, error as object);
          // Non-fatal — continue to other handlers
        }
      }

      // ── Button reply handling ──────────────────────────────────────────
      const isButtonReply =
        simplified.isTemplateButtonReplyMessage ||
        simplified.isButtonResponseMessage ||
        simplified.isInteractiveResponseMessage;

      if (isButtonReply && simplified.message_button) {
        try {
          const context = {
            socket: this.socket,
            sessionId: this.sessionId,
            fromJid: from!!,
            fromMe: simplified.fromMe ?? false,
            pushName: simplified.pushName ?? undefined,
            messageTimestamp: simplified.messageTimeStamp ? Number(simplified.messageTimeStamp) : undefined,
            message,
            simplified,
            pluginManager: this.pluginManager,
          };
          await handleYouTubeButton(context, simplified.message_button);
          return;
        } catch (error) {
          log.error(`[${this.sessionId}] ❌ Error handling button reply:`, error as object);
          if (from) {
            await this.socket.sendMessage(from, { text: '❌ Gagal memproses tombol. Silakan coba lagi.' });
          }
          return;
        }
      }

      // ── Command execution ──────────────────────────────────────────────
      if (isCmd && command && from) {
        const cmdConfig = this.pluginManager.getCommand(command)?.config;
        const effectiveUserId = user_id || from;

        // Rate-limit command execution per-user
        if (user_id) {
          const cooldownSec = cmdConfig?.cooldown ?? 2;
          const cmdRateCheck = rateLimiter.check(user_id, command, cooldownSec);
          if (!cmdRateCheck.allowed) {
            log.debug(`[${this.sessionId}] ⏱ Rate-limited command "${command}" from ${user_id}`);
            await this.socket.sendMessage(from, {
              text: `⏱ Mohon tunggu ${Math.ceil(cmdRateCheck.remainingMs / 1000)} detik sebelum menggunakan perintah \`${command}\` lagi.`,
            });
            return;
          }
        }

        // Premium daily limit check (only for commands that opt-in with limitEnabled: true)
        if (cmdConfig?.limitEnabled === true && premiumService.isCommandLimitEnabled()) {
          const limitCheck = await premiumService.checkCommandLimit(effectiveUserId);
          if (!limitCheck.allowed) {
            log.info(`[${this.sessionId}] 🚫 Premium command limit reached for "${command}" by ${effectiveUserId.split('@')[0]} (tier: ${limitCheck.tier})`);
            await this.socket.sendMessage(from, {
              text: `⚠️ Limit harian kamu untuk perintah *${command}* sudah habis.\n\n` +
                `📊 Tier: *${limitCheck.tier.toUpperCase()}*\n` +
                `🔄 Reset: besok jam 00:00 WIB\n\n` +
                `💎 Upgrade ke tier Premium/Pro untuk limit lebih tinggi.`,
            });
            return;
          }
        }

        const context = {
          socket: this.socket,
          sessionId: this.sessionId,
          fromJid: from,
          fromMe: simplified.fromMe ?? false,
          pushName: simplified.pushName ?? undefined,
          messageTimestamp: simplified.messageTimeStamp ? Number(simplified.messageTimeStamp) : undefined,
          message,
          simplified,
          pluginManager: this.pluginManager,
        };

        try {
          const executed = await this.pluginManager.executeCommand(command, context, args);

          // Increment premium usage counter (fire-and-forget)
          if (executed && cmdConfig?.limitEnabled === true) {
            premiumService.incrementCommandUsage(effectiveUserId).catch(() => {});
          }

          if (!executed) {
            await this.socket.sendMessage(from, {
              text: `❌ Command "${simplified.matchedPrefix || '!'}${command}" not found. Use ${simplified.matchedPrefix || '!'}help to see available commands.`,
            });
          }
        } catch (error) {
          log.error(`[${this.sessionId}] ❌ Error executing command "${command}":`, error as object);
          try {
            await this.socket.sendMessage(from, {
              text: '❌ Terjadi kesalahan saat menjalankan perintah. Silakan coba lagi.',
            });
          } catch {
            // Last-resort recovery — swallow send failure
          }
        }
      }
    } catch (error) {
      log.error(`[${this.sessionId}] ❌ Fatal error in processMessage:`, error as object);

      // Last-resort recovery: notify user
      try {
        const from = simplified.from;
        if (from) {
          await this.socket.sendMessage(from, {
            text: '❌ Terjadi kesalahan internal yang tidak terduga. Silakan coba lagi.',
          });
        }
      } catch {
        // Completely unrecoverable — swallow
      }
    }
  }

  private async handleGroupAutoReply(simplified: ReturnType<typeof this.simplified>, to: string, originalMessage: WAMessage): Promise<void> {
    try {
      let message = simplified.message || simplified.body || '';

      // Validate that there's actual content to reply to
      if (!message || message.trim().length === 0) {
        return;
      }

      const userId = simplified.user_id || to;
      const pushName = simplified.pushName || 'Kak';

      message = message.replace(/@(?:\d+|all)\b/g, '').trimStart();
      log.info(`[${this.sessionId}] 💬 Group auto-reply message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);

      // Using AiSdkService (Vercel AI SDK) — the original AIService (aiService.js)
      // is preserved alongside for reference.
      const aiService = await import('../services/aiSdkService.js');
      const { getGroupSystemPrompt } = await import('../services/systemPrompt.js');

      const toolContext = {
        socket: this.socket,
        fromJid: to,
        sessionId: userId,
        pushName,
      };

      const groupPrompt = getGroupSystemPrompt(
        simplified.time || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        pushName,
      );

      // Set composing presence
      await this.socket.sendPresenceUpdate('composing', to).catch(() => {});

      let fullResponse = '';
      await aiService.default.chatWithTools(
        userId,
        message,
        groupPrompt,
        (chunk) => {
          if (!chunk.done && chunk.content) {
            fullResponse = chunk.content;
          }
        },
        toolContext,
      );

      await this.socket.sendPresenceUpdate('paused', to).catch(() => {});

      // ── Increment group AI usage ─────────────────────────────────
      if (simplified.user_id) {
        premiumService.incrementGroupAiUsage(simplified.user_id).catch(() => {});
      }

      // Safety filter: strip any remaining tool call artifacts
      const safeResponse = stripToolCallArtifacts(fullResponse) || 'Ada yang bisa dibantu?';

      if (!safeResponse || safeResponse.trim().length === 0) {
        log.warn(`[${this.sessionId}] ⚠️ Empty AI response for group auto-reply`);
        // Still send a fallback so the user knows the bot received their message
        await this.socket.sendMessage(to, { text: 'Maaf, saya tidak bisa memproses permintaan itu saat ini.' });
        return;
      }

      const quotedMessageObj = proto.WebMessageInfo.fromObject({
        key: {
          remoteJid: simplified.from,
          fromMe: false,
          id: simplified.id,
          participant: simplified.participant || simplified.user_id,
        },
        message: originalMessage.message as proto.IMessage,
      });

      await this.socket.sendMessage(to, {
        text: safeResponse,
      }, { quoted: quotedMessageObj });
    } catch (error: any) {
      // Differentiate between network errors, AI errors, and unknown errors
      const errorMessage = error?.message?.toLowerCase() || '';
      let userFriendlyMessage: string;

      if (errorMessage.includes('timeout') || errorMessage.includes('timedout') || errorMessage.includes('econnrefused')) {
        userFriendlyMessage = '❌ Layanan AI sedang sibuk. Silakan coba lagi.';
      } else if (errorMessage.includes('api key') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
        userFriendlyMessage = '❌ Konfigurasi AI salah. Hubungi owner.';
        log.error(`[${this.sessionId}] ❌ AI Configuration error:`, error as object);
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429') || errorMessage.includes('too many')) {
        userFriendlyMessage = '❌ Terlalu banyak permintaan. Silakan tunggu sebentar.';
      } else {
        userFriendlyMessage = '❌ Maaf, ada masalah. Server sedang sibuk, coba lagi sebentar.';
        log.error(`[${this.sessionId}] ❌ Group Auto-Reply Error:`, error as object);
      }

      try {
        await this.socket.sendMessage(to, { text: userFriendlyMessage });
      } catch {
        // Best-effort error notification
      }
    }
  }

  private async handleAIMessage(simplified: ReturnType<typeof this.simplified>, message: string, to: string, originalMessage: WAMessage): Promise<void> {
    try {
      const userId = simplified.user_id || to;

      // Validate message content
      if (!message || message.trim().length === 0) {
        return;
      }

      // Using AiSdkService (Vercel AI SDK) — the original AIService (aiService.js)
      // is preserved alongside for reference.
      const aiService = await import('../services/aiSdkService.js');
      const { getSystemPrompt } = await import('../services/systemPrompt.js');

      const systemPrompt = getSystemPrompt();

      await this.socket.sendPresenceUpdate('composing', to).catch(() => {});

      const toolContext = {
        socket: this.socket,
        fromJid: to,
        sessionId: userId,
        pushName: simplified.pushName ?? undefined,
      };

      let fullResponse = '';
      await aiService.default.chatWithTools(
        userId,
        message,
        systemPrompt,
        (chunk) => {
          if (!chunk.done && chunk.content) {
            fullResponse = chunk.content;
          }
        },
        toolContext,
      );

      await this.socket.sendPresenceUpdate('paused', to).catch(() => {});

      // ── Increment private AI usage ──────────────────────────────
      if (simplified.user_id) {
        premiumService.incrementPrivateAiUsage(simplified.user_id).catch(() => {});
      }

      // Safety filter: strip any remaining tool call artifacts
      const safeResponse = stripToolCallArtifacts(fullResponse);

      if (!safeResponse || safeResponse.trim().length === 0) {
        log.warn(`[${this.sessionId}] ⚠️ Empty AI response, sending fallback`);
        // Send a fallback so the user knows the bot received their message
        await this.socket.sendMessage(to, {
          text: 'Maaf, saya tidak bisa memproses permintaan itu saat ini.',
        });
        return;
      }

      const quotedMessageObj = proto.WebMessageInfo.fromObject({
        key: {
          remoteJid: simplified.from,
          fromMe: false,
          id: simplified.id,
          participant: simplified.participant || simplified.user_id,
        },
        message: originalMessage.message as proto.IMessage,
      });

      await this.socket.sendMessage(to, {
        text: safeResponse,
      }, { quoted: quotedMessageObj });
    } catch (error: any) {
      // Differentiate error types for appropriate user feedback
      const errorMessage = error?.message?.toLowerCase() || '';
      let userFriendlyMessage: string;

      if (errorMessage.includes('timeout') || errorMessage.includes('timedout') || errorMessage.includes('econnrefused')) {
        userFriendlyMessage = '❌ Layanan AI sedang sibuk. Silakan coba lagi.';
      } else if (errorMessage.includes('api key') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
        userFriendlyMessage = '❌ Konfigurasi AI salah. Hubungi owner.';
        log.error(`[${this.sessionId}] ❌ AI Configuration error:`, error as object);
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429') || errorMessage.includes('too many')) {
        userFriendlyMessage = '❌ Terlalu banyak permintaan. Silakan tunggu sebentar.';
      } else {
        userFriendlyMessage = '❌ Terjadi kesalahan AI. Silakan coba lagi.';
        log.error(`[${this.sessionId}] ❌ AI Error:`, error as object);
      }

      try {
        await this.socket.sendMessage(to, { text: userFriendlyMessage });
      } catch {
        // Best-effort error notification
      }
    }
  }

  async sendMessage(jid: string, content: any): Promise<void> {
    try {
      // Validate JID before sending
      const jidValidation = validateJid(jid);
      if (!jidValidation.valid) {
        log.error(`[${this.sessionId}] ❌ Invalid target JID for sendMessage: ${jid}`);
        return;
      }
      await this.socket.sendMessage(jid, content);
    } catch (error: any) {
      const errorMsg = error?.message?.toLowerCase() || '';
      if (errorMsg.includes('rate-overlimit') || errorMsg.includes('429')) {
        log.warn(`[${this.sessionId}] ⚠️ Send rate-limited, backing off`);
      } else if (errorMsg.includes('not-authorized') || errorMsg.includes('403')) {
        log.warn(`[${this.sessionId}] ⚠️ Not authorized to send to ${jid} (blocked/left group?)`);
      } else {
        log.error(`[${this.sessionId}] ❌ Error sending message to ${jid}:`, error as object);
      }
    }
  }

  async replyToMessage(jid: string, quoted: any, content: any): Promise<void> {
    try {
      const jidValidation = validateJid(jid);
      if (!jidValidation.valid) {
        log.error(`[${this.sessionId}] ❌ Invalid target JID for replyToMessage: ${jid}`);
        return;
      }
      await this.socket.sendMessage(jid, {
        ...content,
        quoted,
      });
    } catch (error: any) {
      const errorMsg = error?.message?.toLowerCase() || '';
      if (errorMsg.includes('rate-overlimit') || errorMsg.includes('429')) {
        log.warn(`[${this.sessionId}] ⚠️ Reply rate-limited, backing off`);
      } else if (errorMsg.includes('not-authorized') || errorMsg.includes('403')) {
        log.warn(`[${this.sessionId}] ⚠️ Not authorized to reply in ${jid} (blocked/left group?)`);
      } else {
        log.error(`[${this.sessionId}] ❌ Error replying to message in ${jid}:`, error as object);
      }
    }
  }
}

export default BotHandler;



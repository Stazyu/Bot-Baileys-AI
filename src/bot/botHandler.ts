import { makeWASocket, BaileysEventMap, proto } from 'baileys';
import type { WAMessage, WAMessageUpdate, WASocket } from 'baileys';
import PluginManager from '../plugins/pluginManager.js';
import { detectSocialMediaLink, downloadFromSocialMedia } from './autoDownload.js';
import { getPrefixes, isMaintenance, getMaintenanceMessage, isOwner } from '../config/botConfig.js';

type MessageType = keyof proto.IMessage;

export type SimplifiedMessage = ReturnType<BotHandler['simplified']>;

export class BotHandler {
  private socket: WASocket;
  private sessionId: string;
  private pluginManager: PluginManager;

  constructor(socket: WASocket, sessionId: string) {
    console.log(`🤖 [BotHandler] Creating handler for session: ${sessionId}`);
    this.socket = socket;
    this.sessionId = sessionId;
    this.pluginManager = new PluginManager();
    this.setupEventHandlers();
    console.log(`✅ [BotHandler] Event handlers attached for session: ${sessionId}`);
  }

  async loadPlugins(): Promise<void> {
    await this.pluginManager.loadPlugins();
  }

  async unloadPlugins(): Promise<void> {
    await this.pluginManager.unloadPlugins();
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
      type === 'extendedTextMessage' && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        ? msg.message?.extendedTextMessage?.contextInfo
        : undefined;
    const quotedType = !!quotedInfo
      ? (Object.getOwnPropertyNames(quotedInfo?.quotedMessage)[0] as MessageType)
      : undefined;

    const prefixes = getPrefixes();
    const botNumber = this.socket.user?.id?.split(':')[0] + '@s.whatsapp.net';
    const mentions = type === 'extendedTextMessage' ? quotedInfo?.mentionedJid : undefined;

    /* ============ Meta User ============ */
    const user_id = isGroup
      ? (msg?.key as any)?.participantAlt as string
      : (msg?.key as any)?.remoteJidAlt as string;
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
    const isQuotedAudio = type === 'extendedTextMessage' && quotedType === 'audioMessage';
    const isQuotedImage = type === 'extendedTextMessage' && quotedType === 'imageMessage';
    const isQuotedVideo = type === 'extendedTextMessage' && quotedType === 'videoMessage';
    const isQuotedSticker = type === 'extendedTextMessage' && quotedType === 'stickerMessage';
    const isQuotedDocument = type === 'extendedTextMessage' && quotedType === 'documentMessage';
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
    const message_button =
      type === 'buttonsResponseMessage'
        ? msg?.message?.buttonsResponseMessage?.selectedButtonId
        : type === 'templateMessage'
          ? msg?.message?.templateMessage?.hydratedTemplate?.templateId
          : type === 'templateButtonReplyMessage'
            ? msg?.message?.templateButtonReplyMessage?.selectedId
            : type === 'listResponseMessage'
              ? msg?.message?.listResponseMessage?.singleSelectReply?.selectedRowId
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
      quotedType,
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
    };
  }

  private setupEventHandlers(): void {
    console.log(`🔌 [BotHandler] Setting up event handlers for session: ${this.sessionId}`);

    // Handle messages
    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      // console.log(`📨 [BotHandler] messages.upsert event triggered, type: ${type}, messages count: ${messages.length}`);
      // console.log(`📨 [BotHandler] Message keys:`, messages.map(m => ({
      //   remoteJid: m.key.remoteJid,
      //   fromMe: m.key.fromMe,
      //   id: m.key.id,
      //   hasMessage: !!m.message
      // })));
      if (type === 'notify') {
        for (const message of messages) {
          await this.handleMessage(message);
        }
      }
    });

    // Handle message updates
    // this.socket.ev.on('messages.update', async (updates) => {
    //   console.log(`📝 [BotHandler] messages.update event triggered, count: ${updates.length}`);
    //   for (const update of updates) {
    //     await this.handleMessageUpdate(update);
    //   }
    // });

    // Handle group events
    this.socket.ev.on('group-participants.update', async (event) => {
      console.log(`👥 [BotHandler] group-participants.update event triggered`);
      await this.handleGroupEvent(event);
    });

    // Log all events for debugging
    this.socket.ev.on('connection.update', (update) => {
      console.log(`🔗 [BotHandler] connection.update:`, Object.keys(update));
    });

    this.socket.ev.on('creds.update', () => {
      console.log(`🔑 [BotHandler] creds.update triggered`);
    });

    console.log(`✅ [BotHandler] All event handlers registered for session: ${this.sessionId}`);
  }

  private async handleMessage(message: WAMessage): Promise<void> {
    try {
      if (!message.message) {
        return;
      }

      const simplified = this.simplified(message);
      console.log(`[${this.sessionId}] 💾 Message details -`, simplified);

      // Save message to database
      // await prisma.message.create({
      //   data: {
      //     sessionId: this.sessionId,
      //     key: message.key as any,
      //     message: message.message as any,
      //     messageTimestamp: BigInt(message.messageTimestamp || Date.now()),
      //     fromMe: simplified.fromMe ?? false,
      //     pushName: simplified.pushName,
      //   },
      // });

      // Process the message
      await this.processMessage(message, simplified);
    } catch (error) {
      console.error(`[${this.sessionId}] ❌ Error handling message:`, error);
    }
  }

  private async handleMessageUpdate(update: WAMessageUpdate): Promise<void> {
    try {
      console.log('Message update:', update);
      // Handle message updates (read receipts, edits, etc.)
    } catch (error) {
      console.error('Error handling message update:', error);
    }
  }

  private async handleGroupEvent(event: any): Promise<void> {
    try {
      console.log('Group event:', event);
      // Handle group participant events (join, leave, promote, demote)
    } catch (error) {
      console.error('Error handling group event:', error);
    }
  }

  private async processMessage(message: WAMessage, simplified: ReturnType<typeof this.simplified>): Promise<void> {
    try {
      const { command, args, from, isCmd, body, fromMe, user_id } = simplified;
      console.log('user_id:', user_id);

      // Check maintenance mode (only for commands, owners can bypass)
      if (isMaintenance() && isCmd && !isOwner(user_id || '')) {
        if (from) {
          await this.socket.sendMessage(from, { text: getMaintenanceMessage() });
        }
        return;
      }

      // Auto-detect social media links
      if (body && !isCmd && from) {
        const socialLink = detectSocialMediaLink(body);
        if (socialLink) {
          console.log(`[${this.sessionId}] 🔗 Social media link detected: ${socialLink.platform} - ${socialLink.url}`);
          await downloadFromSocialMedia(socialLink, this.socket, from);
          return;
        }
      }

      if (isCmd && command && from) {
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

        const executed = await this.pluginManager.executeCommand(command, context, args);

        if (!executed) {
          await this.socket.sendMessage(from, {
            text: `❌ Command "${simplified.matchedPrefix || '!'}${command}" not found. Use ${simplified.matchedPrefix || '!'}help to see available commands.`,
          });
        }
      }
    } catch (error) {
      console.error(`[${this.sessionId}] ❌ Error processing message:`, error);
    }
  }

  async sendMessage(jid: string, content: any): Promise<void> {
    try {
      await this.socket.sendMessage(jid, content);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  async replyToMessage(jid: string, quoted: any, content: any): Promise<void> {
    try {
      await this.socket.sendMessage(jid, {
        ...content,
        quoted,
      });
    } catch (error) {
      console.error('Error replying to message:', error);
    }
  }
}

export default BotHandler;



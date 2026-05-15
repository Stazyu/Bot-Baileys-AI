import type { WAMessage, WAMessageUpdate, WASocket } from '@innovatorssoft/baileys';
import { jidNormalizedUser, proto } from 'baileys';
import PluginManager from '../plugins/pluginManager.js';
import { detectSocialMediaLink, downloadFromSocialMedia } from './autoDownload.js';
import { getPrefixes, isMaintenance, getMaintenanceMessage, isOwner } from '../config/botConfig.js';
import { isAIModeEnabled } from '../plugins/ai/aiCommand.js';
import moment from 'moment';
import NodeCache from 'node-cache';
import { handleYouTubeButton } from '../utils/youtubeButtonHandler.js';

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
    console.log(`🤖 [BotHandler] Creating handler for session: ${sessionId}`);
    this.socket = socket;
    this.sessionId = sessionId;
    this.pluginManager = new PluginManager();
    this.groupCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });
    this.setupEventHandlers();
    console.log(`✅ [BotHandler] Event handlers attached for session: ${this.sessionId}`);
  }

  async loadPlugins(): Promise<void> {
    await this.pluginManager.loadPlugins();
  }

  async unloadPlugins(): Promise<void> {
    await this.pluginManager.unloadPlugins();
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
      console.error('Error getting group name:', error);
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
      type === 'extendedTextMessage' && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        ? msg.message?.extendedTextMessage?.contextInfo
        : undefined;
    const quotedType = !!quotedInfo
      ? (Object.getOwnPropertyNames(quotedInfo?.quotedMessage)[0] as MessageType)
      : undefined;

    const prefixes = getPrefixes();
    const botNumber = this.socket.user?.id?.split(':')[0] + '@s.whatsapp.net';
    const mentions = type === 'extendedTextMessage' ? quotedInfo?.mentionedJid : undefined;
    const time = moment().format('HH:mm:ss');
    const date = moment().format('Do MMMM YYYY, h:mm:ss a');

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
      time,
      date,
      prefix: matchedPrefix || '',
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
      if (!message.message) {
        return;
      }

      const simplified = this.simplified(message);

      // Get actual group name with caching
      if (simplified.isGroup && simplified.from) {
        const actualGroupName = await this.getGroupName(simplified.from);
        if (actualGroupName) {
          (simplified as any).groupName = actualGroupName;
        }
      }

      this.printLog(simplified);
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
      const { command, args, from, isCmd, body, isGroup, user_id, mentions, message: rawMessage, quotedInfo } = simplified;

      // Check maintenance mode (only for commands, owners can bypass)
      if (isMaintenance() && isCmd && !isOwner(user_id || '')) {
        if (from) {
          await this.socket.sendMessage(from, { text: getMaintenanceMessage() });
        }
        return;
      }

      // Group auto-reply: respond when bot is tagged, greeted, or replied
      if (isGroup && !isCmd && from) {
        const botNumber = this.socket.user?.id?.split(':')[0];
        const botJid = botNumber + '@s.whatsapp.net';

        const isBotMentioned = (simplified.mentions as string[])?.includes(botJid);

        let isReplyToBot = false;
        if (quotedInfo?.quotedMessage) {
          const quotedParticipant = jidNormalizedUser(quotedInfo.participant!!);
          isReplyToBot = quotedParticipant?.includes(botNumber || '') || false;
          console.log('quotedParticipant:', quotedParticipant, botNumber);
        }

        if (isBotMentioned || isReplyToBot) {
          console.log(`[${this.sessionId}] 🤖 Group auto-reply triggered for: ${from}`);
          await this.handleGroupAutoReply(simplified, from);
          return;
        }
      }

      // Check if AI mode is enabled for this user (only for non-commands)
      const aiEnabled = isAIModeEnabled(user_id || simplified.from || '');
      if (!isCmd && aiEnabled && body && from) {
        await this.handleAIMessage(simplified, body, from);
        return;
      }

      // Auto-detect social media links
      if (body && !isCmd && from && !isGroup) {
        const socialLink = detectSocialMediaLink(body);
        if (socialLink) {
          console.log(`[${this.sessionId}] 🔗 Social media link detected: ${socialLink.platform} - ${socialLink.url}`);
          await downloadFromSocialMedia(socialLink, this.socket, from);
          return;
        }
      }

      if (simplified.isTemplateButtonReplyMessage && simplified.message_button) {
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

  private async handleGroupAutoReply(simplified: ReturnType<typeof this.simplified>, to: string): Promise<void> {
    try {
      const message = simplified.message || simplified.body || '';
      const userId = simplified.user_id || to;
      const pushName = simplified.pushName || 'Kak';

      const aiService = await import('../services/aiService.js');

      const GROUP_SYSTEM_PROMPT = `Kamu adalah asisten AI yang friendly dan helpful di grup WhatsApp.
Selalu jawab dengan sopan dan ramah.
Jangan gunakan nama user dalam respons kamu.
Jangan terlalu panjang, jawab dengan singkat dan friendly.
Jangan yang berhubungan dengan pemograman.

Jika user menyapamu atau menggunakan kata sapaan (seperti: hallo, halo, hai, pagi, siang, sore, malam, bot, kak, bang, dll), TOLONG tambahkan "Halo ${pushName}! 👋" di AWAL respons kamu, sebelum menjawab pertanyaan mereka.

Contoh:
User: "halo bot"
Kamu: "Halo Kak! 👋 Ada yang bisa saya bantu?"

User: "pagi"
Kamu: "Halo Kak! 👋 Selamat pagi! Ada yang perlu bantuan?"

Tapi jika user TIDAK menyapa (hanya bertanya biasa), langsung jawab tanpa sapaan.

Contoh:
User: "1 + 1 berapa"
Kamu: "1 + 1 = 2"`;

      await this.socket.sendPresenceUpdate('composing', to);

      let fullResponse = '';
      await aiService.default.chatStream(userId, message, GROUP_SYSTEM_PROMPT, async (chunk: { content: string; done: boolean }) => {
        if (!chunk.done && chunk.content) {
          fullResponse = chunk.content;
        }
      });

      await this.socket.sendPresenceUpdate('paused', to);

      await this.socket.sendMessage(to, {
        text: fullResponse,
      });
    } catch (error: any) {
      console.error(`[${this.sessionId}] ❌ Group Auto-Reply Error:`, error);
      await this.socket.sendMessage(to, {
        text: `❌ Maaf, ada masalah: ${error.message || 'Server sedang sibuk, coba lagi sebentar'}`,
      });
    }
  }

  private async handleAIMessage(simplified: ReturnType<typeof this.simplified>, message: string, to: string): Promise<void> {
    try {
      const socialLink = detectSocialMediaLink(message);
      const downloadKeywords = ['download', 'tolong', 'bantu', 'grab', 'ambil', 'get'];
      const hasDownloadIntent = downloadKeywords.some(k => message.toLowerCase().includes(k));

      if (socialLink && hasDownloadIntent) {
        await this.socket.sendMessage(to, {
          text: `🔗 Download dimulai...`,
        });
        const result = await downloadFromSocialMedia(socialLink, this.socket, to);
        if (!result.success) {
          await this.socket.sendMessage(to, {
            text: `❌ Maaf, link tidak didukung atau gagal didownload.`,
          });
        }
        return;
      }

      const userId = simplified.user_id || to;
      const aiService = await import('../services/aiService.js');

      const DEFAULT_SYSTEM_PROMPT = `Kamu adalah asisten AI yang helpful, friendly, dan bisa membantu berbagai tugas. Kamu bisa:
- Menjawab pertanyaan
- Menulis teks/cerita/cerpen
- Menerjemahkan bahasa
- Memberikan saran dan rekomendasi
- Dan berbagai tugas lainnya

- Jangan yang berhubungan dengan pemograman

Selalu jawab dengan sopan dan helpful. Jika tidak tahu sesuatu, akui dan bilang kamu tidak tahu.

Kamu adalah bot WhatsApp, jadi jawab dengan format yang sesuai untuk chat. Gunakan markdown seperlunya agar mudah dibaca di WhatsApp.`;

      await this.socket.sendPresenceUpdate('composing', to);

      let fullResponse = '';
      await aiService.default.chatStream(userId, message, DEFAULT_SYSTEM_PROMPT, async (chunk: { content: string; done: boolean }) => {
        if (!chunk.done && chunk.content) {
          fullResponse = chunk.content;
        }
      });

      await this.socket.sendPresenceUpdate('paused', to);

      await this.socket.sendMessage(to, {
        text: `✨ *AI Response:*\n\n${fullResponse}`,
      });
    } catch (error: any) {
      console.error(`[${this.sessionId}] ❌ AI Error:`, error);
      await this.socket.sendMessage(to, {
        text: `❌ AI Error: ${error.message}`,
      });
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



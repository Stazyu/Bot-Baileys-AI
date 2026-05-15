import type { WASocket } from '@innovatorssoft/baileys';
import type { CommandModule } from '../../types/index.js';
import aiService, { AIService } from '../../services/aiService.js';
import { detectSocialMediaLink, downloadFromSocialMedia, type SocialMediaLink } from '../../bot/autoDownload.js';
import { isOwner } from '../../config/botConfig.js';

const ACTIVE_SESSIONS = new Map<string, { enabled: boolean; mode: 'single' | 'chat' }>();

const DEFAULT_SYSTEM_PROMPT = `Kamu adalah asisten AI yang helpful, friendly, dan bisa membantu berbagai tugas. Kamu bisa:
- Menjawab pertanyaan
- Jangan membantu coding/programming
- Menulis teks/cerita/cerpen
- Menerjemahkan bahasa
- Memberikan saran dan rekomendasi
- Dan berbagai tugas lainnya

Jika user meminta untuk download media (foto/video dari Instagram, TikTok, Facebook, Twitter/X, YouTube), segera proses download tanpa perlu konfirmasi. Deteksi link social media dari pesan user dan download media tersebut.

Platform yang didukung:
- Instagram (instagram.com)
- TikTok (tiktok.com)
- Facebook (facebook.com, fb.watch)
- Twitter/X (twitter.com, x.com)
- YouTube (youtube.com, youtu.be)

Selalu jawab dengan sopan dan helpful. Jika tidak tahu sesuatu, akui dan bilang kamu tidak tahu.`;

const AICommand: CommandModule = {
  config: {
    name: 'ai',
    aliases: ['ask', 'chatai', 'aioff', 'aion'],
    description: 'Aktifkan mode AI untuk chatting',
    usage: '!ai <pertanyaan>',
    category: 'ai',
  },
  onLoad() {
    console.log('✅ AI Command loaded');
  },
  handler: async function (context, args: string[]): Promise<void> {
    const userId = context.simplified?.user_id || context.fromJid;

    if (args[0]?.toLowerCase() === 'on') {
      ACTIVE_SESSIONS.set(userId, { enabled: true, mode: 'chat' });
      await context.socket.sendMessage(context.fromJid, {
        text: '✅ Mode AI aktif! Semua pesan yang kamu kirim akan ditangani oleh AI.\n\nGunakan !aioff untuk menonaktifkan mode AI.',
      });
      return;
    }

    if (args[0]?.toLowerCase() === 'off') {
      aiService.clearConversation(userId);
      ACTIVE_SESSIONS.delete(userId);
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ Mode AI dinonaktifkan. Kembali ke mode perintah normal.',
      });
      return;
    }

    if (args[0]?.toLowerCase() === 'model' && args[1]) {
      if (!isOwner(userId)) {
        await context.socket.sendMessage(context.fromJid, {
          text: '❌ Hanya owner yang bisa mengganti model AI.',
        });
        return;
      }
      const model = args.slice(1).join(' ');
      aiService.setModel(model);
      await context.socket.sendMessage(context.fromJid, {
        text: `✅ Model AI diganti ke: ${model}`,
      });
      return;
    }

    if (args[0]?.toLowerCase() === 'clear') {
      aiService.clearConversation(userId);
      await context.socket.sendMessage(context.fromJid, {
        text: '🧹 Percakapan AI dibersihkan.',
      });
      return;
    }

    if (args[0]?.toLowerCase() === 'models') {
      const models = AIService.getAvailableModels();
      const modelList = models.map(m => `• ${m}`).join('\n');
      await context.socket.sendMessage(context.fromJid, {
        text: `🤖 *Model AI yang Tersedia:*\n\n${modelList}\n\nModel saat ini: ${aiService.getModel()}\n\nGunakan !ai model <nama model> untuk mengganti (hanya owner).`,
      });
      return;
    }

    if (!aiService.isConfigured()) {
      await context.socket.sendMessage(context.fromJid, {
        text: '❌ AI service belum dikonfigurasi. Hubungi owner bot.',
      });
      return;
    }

    const question = args.join(' ');

    const socialLink = detectSocialMediaLink(question);
    if (socialLink) {
      await context.socket.sendPresenceUpdate('composing', context.fromJid);
      await context.socket.sendMessage(context.fromJid, {
        text: `🔗 Link ${socialLink.platform} terdeteksi! Sedang mendownload...`,
      });
      await downloadFromSocialMedia(socialLink, context.socket, context.fromJid);
      return;
    }

    if (!question) {
      await context.socket.sendMessage(context.fromJid, {
        text: `📖 *Cara Penggunaan AI:*

• ${context.simplified?.prefix || '!'}ai on - Aktifkan mode AI
• ${context.simplified?.prefix || '!'}ai off - Nonaktifkan mode AI
• ${context.simplified?.prefix || '!'}ai <pertanyaan> - Tanya AI langsung
• ${context.simplified?.prefix || '!'}ai clear - Bersihkan percakapan
• ${context.simplified?.prefix || '!'}ai models - Lihat model yang tersedia

🔹 Mode AI aktif: ${ACTIVE_SESSIONS.has(userId) ? 'Ya' : 'Tidak'}`,
      });
      return;
    }

    await context.socket.sendPresenceUpdate('composing', context.fromJid);

    try {
      let responseBuffer = '';
      await aiService.chatStream(userId, question, DEFAULT_SYSTEM_PROMPT, async (chunk: { content: string; done: boolean }) => {
        if (!chunk.done && chunk.content) {
          responseBuffer = chunk.content;
        }
      });

      await context.socket.sendPresenceUpdate('paused', context.fromJid);

      await context.socket.sendMessage(context.fromJid, {
        text: `✨ *AI Response:*\n\n${responseBuffer}`,
      });
    } catch (error: any) {
      await context.socket.sendPresenceUpdate('paused', context.fromJid);
      await context.socket.sendMessage(context.fromJid, {
        text: `❌ Error: ${error.message}`,
      });
    }
  },
};

export function isAIModeEnabled(userId: string): boolean {
  return ACTIVE_SESSIONS.get(userId)?.enabled ?? false;
}

export function getAIMode(userId: string): 'single' | 'chat' {
  return ACTIVE_SESSIONS.get(userId)?.mode ?? 'single';
}

export function handleAIMessage(userId: string, message: string): Promise<string> {
  return aiService.chat(userId, message, DEFAULT_SYSTEM_PROMPT);
}

export function clearAISession(userId: string): void {
  aiService.clearConversation(userId);
  ACTIVE_SESSIONS.delete(userId);
}

export default AICommand;
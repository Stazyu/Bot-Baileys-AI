import aiService, { AIService } from './aiService.js';

const AI_MODE_SESSIONS = new Map<string, {
  enabled: boolean;
  mode: 'single' | 'chat';
  contextMessages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
}>();

const DEFAULT_SYSTEM_PROMPT = `Kamu adalah asisten AI yang helpful, friendly, dan bisa membantu berbagai tugas. Kamu bisa:
- Menjawab pertanyaan
- Membantu coding/programming
- Menulis teks/cerita/cerpen
- Menerjemahkan bahasa
- Memberikan saran dan rekomendasi
- Dan berbagai tugas lainnya

Selalu jawab dengan sopan dan helpful. Jika tidak tahu sesuatu, akui dan bilang kamu tidak tahu.

Kamu adalah bot WhatsApp, jadi jawab dengan format yang sesuai untuk chat. Gunakan markdown seperlunya agar mudah dibaca di WhatsApp.`;

interface AIModeConfig {
  groupMode: boolean;
  ownerOnly: boolean;
  maxHistory: number;
}

const defaultConfig: AIModeConfig = {
  groupMode: true,
  ownerOnly: false,
  maxHistory: 20,
};

export class AIModeHandler {
  private config: AIModeConfig;

  constructor(config: Partial<AIModeConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async handleAIMessage(userId: string, userMessage: string): Promise<string> {
    if (!aiService.isConfigured()) {
      throw new Error('AI service not configured');
    }

    let session = AI_MODE_SESSIONS.get(userId);
    if (!session) {
      session = {
        enabled: false,
        mode: 'chat',
        contextMessages: [],
      };
      AI_MODE_SESSIONS.set(userId, session);
    }

    session.contextMessages.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    });

    if (session.contextMessages.length > this.config.maxHistory) {
      session.contextMessages = session.contextMessages.slice(-this.config.maxHistory);
    }

    const historyMessages = session.contextMessages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const systemWithHistory = `${DEFAULT_SYSTEM_PROMPT}\n\nRiwayat percakapan:\n${historyMessages}`;

    const response = await aiService.chatWithSystem(userId, userMessage, systemWithHistory);

    session.contextMessages.push({
      role: 'assistant',
      content: response,
      timestamp: Date.now(),
    });

    return response;
  }

  enableAIMode(userId: string, mode: 'single' | 'chat' = 'chat'): void {
    AI_MODE_SESSIONS.set(userId, {
      enabled: true,
      mode,
      contextMessages: [],
    });
  }

  disableAIMode(userId: string): void {
    const session = AI_MODE_SESSIONS.get(userId);
    if (session) {
      session.enabled = false;
      session.contextMessages = [];
    }
  }

  clearHistory(userId: string): void {
    const session = AI_MODE_SESSIONS.get(userId);
    if (session) {
      session.contextMessages = [];
    }
  }

  isAIModeEnabled(userId: string): boolean {
    const session = AI_MODE_SESSIONS.get(userId);
    return session?.enabled ?? false;
  }

  getSession(userId: string) {
    return AI_MODE_SESSIONS.get(userId);
  }

  getAllActiveSessions(): string[] {
    const active: string[] = [];
    for (const [userId, session] of AI_MODE_SESSIONS.entries()) {
      if (session.enabled) {
        active.push(userId);
      }
    }
    return active;
  }

  static getStatus(userId: string): { enabled: boolean; mode: string; historyCount: number } | null {
    const session = AI_MODE_SESSIONS.get(userId);
    if (!session) return null;
    return {
      enabled: session.enabled,
      mode: session.mode,
      historyCount: session.contextMessages.length,
    };
  }
}

export default new AIModeHandler();
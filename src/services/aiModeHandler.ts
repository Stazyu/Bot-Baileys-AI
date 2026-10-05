import aiService from './aiService.js';
import type { ToolContext } from '../types/tools.js';
import { getSystemPrompt } from './systemPrompt.js';
import { resolvePrivateRole } from './roleService.js';
import { stripToolCallArtifacts } from '../utils/toolCallFilter.js';

const AI_MODE_SESSIONS = new Map<string, {
  enabled: boolean;
  mode: 'single' | 'chat';
  contextMessages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>;
}>();

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

  async handleAIMessage(userId: string, userMessage: string, toolContext?: ToolContext): Promise<string> {
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

    const systemWithHistory = `${getSystemPrompt(resolvePrivateRole(userId, toolContext?.callerLid))}\n\nRiwayat percakapan:\n${historyMessages}`;

    // Clear internal history so chatWithTools starts fresh with our custom system prompt
    aiService.clearConversation(userId);

    // Use chatWithTools for function calling support (social media downloads, etc.)
    let response = '';
    await aiService.chatWithTools(
      userId,
      userMessage,
      systemWithHistory,
      (chunk) => {
        if (!chunk.done && chunk.content) {
          response = chunk.content;
        }
      },
      toolContext
    );

    // Safety filter: strip any remaining tool call artifacts
    const safeResponse = stripToolCallArtifacts(response);

    session.contextMessages.push({
      role: 'assistant',
      content: safeResponse,
      timestamp: Date.now(),
    });

    return safeResponse;
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

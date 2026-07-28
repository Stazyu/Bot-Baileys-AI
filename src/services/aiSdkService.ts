/**
 * AI SDK Service — Vercel AI SDK integration
 *
 * Wraps `streamText` / `generateText` from the `ai` library with
 * `@ai-sdk/openai-compatible` provider, while preserving the same
 * callback pattern that BotHandler and plugins expect.
 *
 * ── Relation to aiService.ts ──────────────────────────────────────────
 * The original `AIService` (aiService.ts) makes raw HTTP calls to the
 * OpenAI-compatible API using axios. This file provides an alternative
 * implementation that uses the `ai` SDK and `@ai-sdk/openai-compatible`
 * provider, giving us:
 *   - Multi-round tool calling via `maxSteps`
 *   - Standardised streaming
 *   - Provider abstraction layer
 *
 * Both services coexist. The original `AIService` is NOT deleted.
 * Consumers can import from this file to use the new SDK-based path.
 * ──────────────────────────────────────────────────────────────────────
 */

import { streamText, generateText, isStepCount } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAiSdkTools, hasAiSdkTools } from '../tools/aiSdkAdapter.js';
import {
  containsToolCallArtifact,
  stripToolCallArtifacts,
} from '../utils/toolCallFilter.js';
import type { ToolContext } from '../types/tools.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type Provider = 'openai' | 'openrouter' | 'ollama' | 'other';

interface StreamChunk {
  content: string;
  done: boolean;
}

type StreamCallback = (chunk: StreamChunk) => void;

/**
 * Simplified message shape for conversation history.
 */
interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * AI SDK message shape — only user and assistant roles are allowed in messages.
 * System prompts are passed via the `system` parameter instead.
 */
interface SdkUserMessage {
  role: 'user';
  content: string;
}

interface SdkAssistantMessage {
  role: 'assistant';
  content: string;
}

type SdkMessage = SdkUserMessage | SdkAssistantMessage;

const MALFORMED_TOOL_CALL_FALLBACK = 'Maaf, pencarian gagal diproses. Silakan coba lagi sebentar.';

// ─── Service ─────────────────────────────────────────────────────────────────

export class AiSdkService {
  private provider: Provider;
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private conversationHistory: Map<string, HistoryMessage[]> = new Map();
  private conversationExpiry: Map<string, number> = new Map();
  private readonly GROUP_EXPIRY_MS = 10 * 60 * 1000;

  constructor() {
    this.provider = (process.env.AI_PROVIDER?.toLowerCase() as Provider) || 'openrouter';

    if (this.provider === 'ollama') {
      this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      this.model = process.env.OLLAMA_MODEL || 'llama3.2';
      this.apiKey = '';
    } else if (this.provider === 'openai') {
      this.apiKey = process.env.OPENAI_API_KEY || '';
      this.baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
      this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    } else if (this.provider === 'other') {
      this.apiKey = process.env.OTHER_API_KEY || '';
      this.baseUrl = (process.env.OTHER_BASE_URL || '').replace(/\/+$/, '');
      this.model = process.env.OTHER_MODEL || '';
    } else {
      this.provider = 'openrouter';
      this.apiKey = process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || '';
      this.baseUrl = (process.env.OPENROUTER_BASE_URL || process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
      this.model = process.env.OPENROUTER_MODEL || process.env.AI_MODEL || 'anthropic/claude-3-haiku';
    }

    if (!this.isConfigured()) {
      let msg: string;
      switch (this.provider) {
        case 'ollama':
          msg = '⚠️ OLLAMA_BASE_URL is not set. AI features will be disabled.';
          break;
        case 'openai':
          msg = '⚠️ OPENAI_API_KEY / AI_API_KEY is not set. AI features will be disabled.';
          break;
        case 'other':
          msg = '⚠️ OTHER_BASE_URL and OTHER_API_KEY are not set. AI features will be disabled.';
          break;
        default:
          msg = '⚠️ OPENROUTER_API_KEY / AI_API_KEY is not set. AI features will be disabled.';
          break;
      }
      console.warn(`[AiSdkService] ${msg}`);
    } else {
      console.log(`✅ [AiSdkService] Provider: ${this.provider} | Model: ${this.model} | URL: ${this.baseUrl}`);
    }
  }

  // ─── Configuration ─────────────────────────────────────────────────────────

  getProvider(): Provider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  isConfigured(): boolean {
    if (this.provider === 'ollama') {
      return !!this.baseUrl;
    }
    if (this.provider === 'other') {
      return !!this.baseUrl && !!this.apiKey;
    }
    return !!this.apiKey;
  }

  /**
   * Create the OpenAI-compatible provider for the AI SDK.
   */
  private createProvider() {
    const baseUrl = this.baseUrl;
    const apiKey = this.apiKey;

    return createOpenAICompatible({
      name: this.provider === 'ollama' ? 'ollama' : 'openai-compatible',
      baseURL: baseUrl,
      apiKey: apiKey || undefined,
      headers: this.provider === 'openrouter'
        ? { 'HTTP-Referer': 'https://github.com/', 'X-Title': 'Bot-Baileys-AI' }
        : undefined,
    });
  }

  /**
   * Get the chat model ID for the AI SDK.
   */
  private getModelId(): string {
    return this.model;
  }

  // ─── Conversation History ──────────────────────────────────────────────────

  getConversationHistory(sessionId: string): HistoryMessage[] {
    this.checkAndClearExpired(sessionId);
    return this.conversationHistory.get(sessionId) || [];
  }

  clearConversation(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
    this.conversationExpiry.delete(sessionId);
  }

  private isGroupSession(sessionId: string): boolean {
    return sessionId.includes('@g.us');
  }

  private checkAndClearExpired(sessionId: string): void {
    if (this.isGroupSession(sessionId)) {
      const expiry = this.conversationExpiry.get(sessionId);
      if (expiry && Date.now() > expiry) {
        this.conversationHistory.delete(sessionId);
        this.conversationExpiry.delete(sessionId);
      }
    }
  }

  private setExpiry(sessionId: string): void {
    if (this.isGroupSession(sessionId)) {
      this.conversationExpiry.set(sessionId, Date.now() + this.GROUP_EXPIRY_MS);
    }
  }

  /**
   * Convert conversation history to AI SDK message format.
   * System messages from history are skipped — they are passed via `system` parameter.
   */
  private historyToSdkMessages(history: HistoryMessage[]): SdkMessage[] {
    const messages: SdkMessage[] = [];
    for (const msg of history) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }
    return messages;
  }

  // ─── Core Chat Methods ─────────────────────────────────────────────────────

  /**
   * Non-streaming chat (no tools).
   */
  async chat(
    sessionId: string,
    userMessage: string,
    systemPrompt?: string,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(this.getNotConfiguredMessage());
    }

    const provider = this.createProvider();
    const modelId = this.getModelId();
    const history = this.getConversationHistory(sessionId);
    const historyMessages = this.historyToSdkMessages(history);

    const messages: SdkMessage[] = [
      ...historyMessages,
      { role: 'user', content: userMessage },
    ];

    try {
      const result = await generateText({
        model: provider.chatModel(modelId),
        system: systemPrompt,
        messages,
      });

      const responseText = result.text || '';

      // Save to conversation history
      history.push({ role: 'user', content: userMessage });
      history.push({ role: 'assistant', content: responseText });
      this.conversationHistory.set(sessionId, history);
      this.setExpiry(sessionId);

      return responseText;
    } catch (error: any) {
      console.error(`[AiSdkService] ${this.provider} API Error:`, error.message);
      throw new Error(error.message || 'Failed to get AI response');
    }
  }

  /**
   * Streaming chat (no tools).
   */
  async chatStream(
    sessionId: string,
    userMessage: string,
    systemPrompt?: string,
    onChunk?: StreamCallback,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(this.getNotConfiguredMessage());
    }

    const provider = this.createProvider();
    const modelId = this.getModelId();
    const history = this.getConversationHistory(sessionId);
    const historyMessages = this.historyToSdkMessages(history);

    const messages: SdkMessage[] = [
      ...historyMessages,
      { role: 'user', content: userMessage },
    ];

    try {
      const result = streamText({
        model: provider.chatModel(modelId),
        system: systemPrompt,
        messages,
      });

      let fullContent = '';

      for await (const textDelta of result.textStream) {
        fullContent += textDelta;
        const visibleContent = stripToolCallArtifacts(fullContent);
        if (onChunk && visibleContent) {
          onChunk({ content: visibleContent, done: false });
        }
      }

      const finalText = await result.text;

      // Save to conversation history
      history.push({ role: 'user', content: userMessage });
      history.push({ role: 'assistant', content: finalText || fullContent });
      this.conversationHistory.set(sessionId, history);
      this.setExpiry(sessionId);

      if (onChunk) {
        onChunk({ content: '', done: true });
      }

      const safeText = stripToolCallArtifacts(finalText || fullContent);
      return safeText || fullContent;
    } catch (error: any) {
      console.error(`[AiSdkService] ${this.provider} Stream Error:`, error.message);
      throw new Error(error.message || 'Failed to get AI response');
    }
  }

  /**
   * Chat with tool/function calling support powered by the AI SDK.
   *
   * Unlike the original AIService which manually loops through tool rounds,
   * the AI SDK's `maxSteps` handles multi-round tool calling automatically.
   *
   * @param toolContext - Socket context so tools can send media directly to the user
   */
  async chatWithTools(
    sessionId: string,
    userMessage: string,
    systemPrompt?: string,
    onChunk?: StreamCallback,
    toolContext?: ToolContext,
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(this.getNotConfiguredMessage());
    }

    const provider = this.createProvider();
    const modelId = this.getModelId();
    const history = this.getConversationHistory(sessionId);
    const historyMessages = this.historyToSdkMessages(history);

    const messages: SdkMessage[] = [
      ...historyMessages,
      { role: 'user', content: userMessage },
    ];

    // Build AI SDK tools if context is provided
    const tools = toolContext && hasAiSdkTools()
      ? createAiSdkTools(toolContext)
      : undefined;

    try {
      // Use streamText with tools for automatic multi-round tool calling.
      // The AI SDK automatically continues the conversation loop when the model
      // calls tools, feeding results back until the model emits final text.
      //
      // Default stopWhen is isStepCount(1) which only allows 1 model invocation —
      // tool results would never be fed back. We set it to 5 to allow up to 4
      // tool rounds (same as the original AIService's MAX_TOOL_ROUNDS).
      const result = streamText({
        model: provider.chatModel(modelId),
        system: systemPrompt,
        messages,
        tools: tools as any,
        stopWhen: isStepCount(5),
        // Log every step so we can see when tools are invoked
        onStepFinish: async ({ toolCalls, toolResults }) => {
          if (toolCalls && toolCalls.length > 0) {
            for (const tc of toolCalls) {
              console.log(`[AiSdkService] 🔧 Tool called: ${tc.toolName}(${JSON.stringify(tc.input)})`);
            }
          }
          if (toolResults && toolResults.length > 0) {
            // toolResults can have either `output` (DynamicToolResult) or
            // `result` (TypedToolResult) depending on the tool type.
            // Use `unknown` to bypass the discriminated union check.
            for (const tr of toolResults as unknown as Array<Record<string, unknown>>) {
              const output = (tr.output ?? tr.result) as { success?: boolean } | undefined;
              const ok = output?.success !== false;
              const outStr = JSON.stringify(output).substring(0, 120);
              const ellipsis = JSON.stringify(output).length > 120 ? '...' : '';
              console.log(`[AiSdkService] ${ok ? '✅' : '❌'} Tool result: ${tr.toolName} → ${outStr}${ellipsis}`);
            }
          }
        },
      });

      let fullContent = '';

      for await (const textDelta of result.textStream) {
        fullContent += textDelta;
        const visibleContent = stripToolCallArtifacts(fullContent);
        if (onChunk && visibleContent) {
          onChunk({ content: visibleContent, done: false });
        }
      }

      const finalText = await result.text;

      // ── Handle malformed tool calls ──
      let safeContent = stripToolCallArtifacts(finalText || fullContent);
      if (!safeContent && (finalText || fullContent) && containsToolCallArtifact(finalText || fullContent)) {
        safeContent = MALFORMED_TOOL_CALL_FALLBACK;
        if (onChunk) {
          onChunk({ content: safeContent, done: false });
        }
      }

      // Save to conversation history
      history.push({ role: 'user', content: userMessage });
      history.push({ role: 'assistant', content: safeContent || fullContent });
      this.conversationHistory.set(sessionId, history);
      this.setExpiry(sessionId);

      if (onChunk) {
        onChunk({ content: '', done: true });
      }

      return safeContent || fullContent || '';
    } catch (error: any) {
      console.error(`[AiSdkService] ${this.provider} Tools Error:`, error.message);
      throw new Error(error.message || 'Failed to get AI response');
    }
  }

  // ─── Model Listing (static helpers) ────────────────────────────────────────

  static async getAvailableModels(provider: Provider, baseUrl?: string, apiKey?: string): Promise<string[]> {
    const { AIService } = await import('./aiService.js');
    return AIService.getAvailableModels(provider, baseUrl, apiKey);
  }

  static getAvailableOpenRouterModels(): string[] {
    return [
      'qwen/qwen3-next-80b-a3b-instruct:free',
      'openrouter/owl-alpha',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      'openai/gpt-oss-120b:free',
      'openrouter/free',
    ];
  }

  static async listOllamaModels(baseUrl?: string): Promise<string[]> {
    const { default: axios } = await import('axios');
    const url = (baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
    try {
      const response = await axios.get<any>(`${url}/api/tags`, { timeout: 10000 });
      const models = response.data?.models || [];
      return models.map((m: any) => m.name).filter(Boolean);
    } catch (error: any) {
      console.error('Failed to list Ollama models:', error.message);
      return [];
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private getNotConfiguredMessage(): string {
    switch (this.provider) {
      case 'ollama':
        return 'AI service is not configured. Please set OLLAMA_BASE_URL in .env';
      case 'openai':
        return 'AI service is not configured. Please set OPENAI_API_KEY (or AI_API_KEY) and OPENAI_BASE_URL (or AI_BASE_URL) in .env';
      case 'other':
        return 'AI service is not configured. Please set OTHER_BASE_URL and OTHER_API_KEY in .env';
      default:
        return 'AI service is not configured. Please set OPENROUTER_API_KEY (or AI_API_KEY) and OPENROUTER_BASE_URL (or AI_BASE_URL) in .env';
    }
  }
}

// Singleton instance
const aiSdkService = new AiSdkService();
export default aiSdkService;

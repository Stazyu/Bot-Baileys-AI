import axios from 'axios';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface StreamChunk {
  content: string;
  done: boolean;
}

type StreamCallback = (chunk: StreamChunk) => void;

export class AIService {
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private model: string;
  private conversationHistory: Map<string, OpenRouterMessage[]> = new Map();
  private conversationExpiry: Map<string, number> = new Map();
  private readonly GROUP_EXPIRY_MS = 10 * 60 * 1000; // 10 menit untuk grup

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku';

    if (!this.apiKey) {
      console.warn('⚠️ OPENROUTER_API_KEY is not set. AI features will be disabled.');
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async chat(
    sessionId: string,
    userMessage: string,
    systemPrompt?: string
  ): Promise<string> {
    return this.chatWithSystem(sessionId, userMessage, systemPrompt);
  }

  async chatWithSystem(
    sessionId: string,
    userMessage: string,
    systemPrompt?: string
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('AI service is not configured. Please set OPENROUTER_API_KEY in .env');
    }

    const messages = this.getConversationHistory(sessionId);

    if (systemPrompt && messages.length === 0) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: userMessage });

    try {
      const response = await axios.post<any>(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: messages,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        }
      );

      const assistantMessage = response.data.choices[0]?.message?.content || '';

      messages.push({ role: 'assistant', content: assistantMessage });

      this.conversationHistory.set(sessionId, messages);
      this.setExpiry(sessionId);

      return assistantMessage;
    } catch (error: any) {
      console.error('OpenRouter API Error:', error.response?.data || error.message);
      throw new Error(
        error.response?.data?.error?.message ||
        error.response?.data?.error ||
        'Failed to get AI response'
      );
    }
  }

  async chatStream(
    sessionId: string,
    userMessage: string,
    systemPrompt?: string,
    onChunk?: StreamCallback
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('AI service is not configured. Please set OPENROUTER_API_KEY in .env');
    }

    const messages = this.getConversationHistory(sessionId);

    if (systemPrompt && messages.length === 0) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: userMessage });

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: messages,
          stream: true,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
          responseType: 'stream',
        }
      );

      let fullContent = '';
      let buffer = '';

      const stream = response.data;

      return new Promise((resolve, reject) => {
        let timeoutId: NodeJS.Timeout;
        let resolved = false;

        const finish = (content: string, isError = false) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);

          if (content || !isError) {
            if (content) {
              messages.push({ role: 'assistant', content });
              this.conversationHistory.set(sessionId, messages);
              this.setExpiry(sessionId);
            }
            resolve(content);
          } else {
            reject(new Error('Empty response from AI'));
          }
        };

        timeoutId = setTimeout(() => {
          if (!resolved) {
            stream.emit('end');
            finish(fullContent || '', true);
          }
        }, 60000);

        stream.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                if (onChunk) onChunk({ content: '', done: true });
                finish(fullContent);
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;

                if (content) {
                  fullContent += content;
                  buffer += content;

                  if (onChunk) {
                    onChunk({ content: buffer, done: false });
                  }
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        });

        stream.on('error', (error: any) => {
          clearTimeout(timeoutId);
          if (!resolved) {
            resolved = true;
            reject(new Error(error.message || 'Stream error'));
          }
        });

        stream.on('end', () => {
          finish(fullContent);
        });
      });
    } catch (error: any) {
      console.error('OpenRouter API Error:', error.response?.data || error.message);
      throw new Error(
        error.response?.data?.error?.message ||
        error.response?.data?.error?.message ||
        error.message ||
        'Failed to get AI response'
      );
    }
  }

  getConversationHistory(sessionId: string): OpenRouterMessage[] {
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

  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  static getAvailableModels(): string[] {
    return [
      'qwen/qwen3-next-80b-a3b-instruct:free',
      'openrouter/owl-alpha',
      'baidu/cobuddy:free',
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
      'poolside/laguna-m.1:free',
      'arcee-ai/trinity-large-thinking:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'openai/gpt-oss-120b:free',
      'openrouter/free'
    ];
  }
}

export default new AIService();
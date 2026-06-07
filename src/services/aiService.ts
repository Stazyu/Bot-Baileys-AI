import axios from 'axios';

type Provider = 'openrouter' | 'ollama';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface StreamChunk {
  content: string;
  done: boolean;
}

type StreamCallback = (chunk: StreamChunk) => void;

export class AIService {
  private provider: Provider;
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private conversationHistory: Map<string, ChatMessage[]> = new Map();
  private conversationExpiry: Map<string, number> = new Map();
  private readonly GROUP_EXPIRY_MS = 10 * 60 * 1000;

  constructor() {
    this.provider = (process.env.AI_PROVIDER?.toLowerCase() as Provider) || 'openrouter';

    if (this.provider === 'ollama') {
      this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      this.model = process.env.OLLAMA_MODEL || 'llama3.2';
      this.apiKey = '';
    } else {
      this.provider = 'openrouter';
      this.apiKey = process.env.OPENROUTER_API_KEY || '';
      this.baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
      this.model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku';
    }

    if (!this.isConfigured()) {
      const msg = this.provider === 'ollama'
        ? '⚠️ OLLAMA_BASE_URL is not set. AI features will be disabled.'
        : '⚠️ OPENROUTER_API_KEY is not set. AI features will be disabled.';
      console.warn(msg);
    } else {
      console.log(`✅ [AIService] Provider: ${this.provider} | Model: ${this.model} | URL: ${this.baseUrl}`);
    }
  }

  getProvider(): Provider {
    return this.provider;
  }

  isConfigured(): boolean {
    if (this.provider === 'ollama') {
      return !!this.baseUrl;
    }
    return !!this.apiKey;
  }

  async chat(
    sessionId: string,
    userMessage: string,
    systemPrompt?: string
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(this.getNotConfiguredMessage());
    }

    const messages = this.getConversationHistory(sessionId);

    if (systemPrompt && messages.length === 0) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: userMessage });

    if (this.provider === 'ollama') {
      return this.callOllamaNonStream(sessionId, messages);
    }
    return this.callOpenRouterNonStream(sessionId, messages);
  }

  async chatStream(
    sessionId: string,
    userMessage: string,
    systemPrompt?: string,
    onChunk?: StreamCallback
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error(this.getNotConfiguredMessage());
    }

    const messages = this.getConversationHistory(sessionId);

    if (systemPrompt && messages.length === 0) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: userMessage });

    if (this.provider === 'ollama') {
      return this.callOllamaStream(sessionId, messages, onChunk);
    }
    return this.callOpenRouterStream(sessionId, messages, onChunk);
  }

  private async callOpenRouterNonStream(sessionId: string, messages: ChatMessage[]): Promise<string> {
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

  private async callOpenRouterStream(
    sessionId: string,
    messages: ChatMessage[],
    onChunk?: StreamCallback
  ): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: messages,
          stream: true,
          tools: [
            { type: 'openrouter:datetime' },
            { type: 'openrouter:web_search' }
          ]
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

      const stream = response.data;
      return this.handleOpenRouterSSEStream(sessionId, messages, stream, onChunk);
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

  private handleOpenRouterSSEStream(
    sessionId: string,
    messages: ChatMessage[],
    stream: any,
    onChunk?: StreamCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullContent = '';
      let buffer = '';
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
  }

  private async callOllamaNonStream(sessionId: string, messages: ChatMessage[]): Promise<string> {
    try {
      const response = await axios.post<any>(
        `${this.baseUrl}/api/chat`,
        {
          model: this.model,
          messages: messages,
          stream: false,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000,
        }
      );

      const assistantMessage = response.data?.message?.content || '';

      messages.push({ role: 'assistant', content: assistantMessage });
      this.conversationHistory.set(sessionId, messages);
      this.setExpiry(sessionId);

      return assistantMessage;
    } catch (error: any) {
      console.error('Ollama API Error:', error.response?.data || error.message);
      throw new Error(
        error.response?.data?.error ||
        error.message ||
        'Failed to get AI response from Ollama'
      );
    }
  }

  private async callOllamaStream(
    sessionId: string,
    messages: ChatMessage[],
    onChunk?: StreamCallback
  ): Promise<string> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/chat`,
        {
          model: this.model,
          messages: messages,
          stream: true,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000,
          responseType: 'stream',
        }
      );

      const stream = response.data;
      return this.handleOllamaStream(sessionId, messages, stream, onChunk);
    } catch (error: any) {
      console.error('Ollama API Error:', error.response?.data || error.message);
      throw new Error(
        error.response?.data?.error ||
        error.message ||
        'Failed to get AI response from Ollama'
      );
    }
  }

  private handleOllamaStream(
    sessionId: string,
    messages: ChatMessage[],
    stream: any,
    onChunk?: StreamCallback
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullContent = '';
      let buffer = '';
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
          reject(new Error('Empty response from Ollama'));
        }
      };

      timeoutId = setTimeout(() => {
        if (!resolved) {
          stream.emit('end');
          finish(fullContent || '', true);
        }
      }, 120000);

      stream.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed);
            const content = parsed.message?.content;
            const done = parsed.done === true;

            if (content) {
              fullContent += content;
              buffer += content;

              if (onChunk) {
                onChunk({ content: buffer, done: false });
              }
            }

            if (done) {
              if (onChunk) onChunk({ content: '', done: true });
              finish(fullContent);
              return;
            }
          } catch (e) {
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
  }

  private getNotConfiguredMessage(): string {
    if (this.provider === 'ollama') {
      return 'AI service is not configured. Please set OLLAMA_BASE_URL in .env';
    }
    return 'AI service is not configured. Please set OPENROUTER_API_KEY in .env';
  }

  getConversationHistory(sessionId: string): ChatMessage[] {
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

  static getAvailableOpenRouterModels(): string[] {
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

  static async listOllamaModels(baseUrl?: string): Promise<string[]> {
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
}

export default new AIService();

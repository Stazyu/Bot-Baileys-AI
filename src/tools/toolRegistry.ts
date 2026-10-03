import type { AIToolDefinition, ToolRegistryEntry, ToolExecuteFunction, ToolContext, AIToolCall, AIToolResult } from '../types/tools.js';

/**
 * Central registry for all AI-callable tools.
 * Tools are registered with their JSON Schema definition and execute function.
 */
export class ToolRegistry {
  private tools: Map<string, ToolRegistryEntry> = new Map();

  /**
   * Register a new tool.
   */
  register(name: string, definition: AIToolDefinition, execute: ToolExecuteFunction): void {
    if (this.tools.has(name)) {
      console.warn(`[ToolRegistry] Tool "${name}" already registered. Overwriting.`);
    }
    this.tools.set(name, { definition, execute });
    console.log(`[ToolRegistry] ✅ Tool registered: "${name}"`);
  }

  /**
   * Register multiple tools at once.
   */
  registerAll(tools: Array<{ name: string; definition: AIToolDefinition; execute: ToolExecuteFunction }>): void {
    for (const tool of tools) {
      this.register(tool.name, tool.definition, tool.execute);
    }
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get the execute function for a tool.
   */
  getExecute(name: string): ToolExecuteFunction | undefined {
    return this.tools.get(name)?.execute;
  }

  /**
   * Get all tool definitions formatted for the OpenAI/OpenRouter API (tools array).
   */
  getApiDefinitions(): AIToolDefinition[] {
    const definitions: AIToolDefinition[] = [];
    for (const [, entry] of this.tools) {
      definitions.push(entry.definition);
    }
    return definitions;
  }

  /**
   * Check if any tools are registered.
   */
  hasTools(): boolean {
    return this.tools.size > 0;
  }

  /**
   * Get the total number of registered tools.
   */
  count(): number {
    return this.tools.size;
  }

  /**
   * Iterate over all registered tool entries.
   * Returns an iterator of [name, ToolRegistryEntry] pairs for use with the AI SDK.
   */
  entries(): IterableIterator<[string, ToolRegistryEntry]> {
    return this.tools.entries();
  }

  /**
   * Execute a single tool call from the AI.
   * Returns a properly formatted AIToolResult suitable for sending back to the API.
   */
  async executeToolCall(toolCall: AIToolCall, context: ToolContext): Promise<AIToolResult> {
    const toolName = toolCall.function.name;
    const entry = this.tools.get(toolName);

    if (!entry) {
      console.error(`[ToolRegistry] Unknown tool called by AI: "${toolName}"`);
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          success: false,
          message: `Tool "${toolName}" tidak tersedia.`,
        }),
      };
    }

    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error(`[ToolRegistry] Failed to parse arguments for "${toolName}":`, toolCall.function.arguments);
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          success: false,
          message: `Gagal memproses argumen untuk tool "${toolName}".`,
        }),
      };
    }

    try {
      console.log(`[ToolRegistry] 🔧 Executing tool "${toolName}" with args:`, parsedArgs);
      const result = await entry.execute(parsedArgs, context);

      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      };
    } catch (error: unknown) {
      console.error(`[ToolRegistry] Error executing tool "${toolName}":`, error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          success: false,
          message: `Error executing "${toolName}": ${errMsg}`,
        }),
      };
    }
  }

  /**
   * Execute multiple tool calls (parallel execution).
   */
  async executeToolCalls(toolCalls: AIToolCall[], context: ToolContext): Promise<AIToolResult[]> {
    const results: AIToolResult[] = [];
    for (const toolCall of toolCalls) {
      const result = await this.executeToolCall(toolCall, context);
      results.push(result);
    }
    return results;
  }
}

// Singleton instance
const toolRegistry = new ToolRegistry();
export default toolRegistry;

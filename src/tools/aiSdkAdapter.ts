/**
 * AI SDK Tool Adapter
 *
 * Bridges existing tool definitions (AIToolDefinition + ToolExecuteFunction)
 * to the Vercel AI SDK `dynamicTool()` format.
 *
 * This is a CONVERSION LAYER — the original tools in `./definitions/`
 * and `./toolRegistry.ts` remain untouched.
 *
 * Usage:
 *   import { createAiSdkTools } from './aiSdkAdapter.js';
 *   const tools = createAiSdkTools(toolContext);
 *   // tools is a Record<string, DynamicTool> ready for streamText()
 */

import { dynamicTool, jsonSchema } from 'ai';
import type { ToolContext } from '../types/tools.js';
import { allTools } from './definitions/index.js';

/**
 * Create AI SDK tool entries from the existing tool definitions.
 *
 * Each tool's JSON Schema is passed via `inputSchema` wrapped in `jsonSchema()` —
 * the AI SDK's `asSchema()` reads `inputSchema` and requires it to be either a
 * Schema instance, a Standard Schema (Zod), or a function. Wrapping with
 * `jsonSchema(...)` produces the proper Schema instance.
 *
 * @param context - The ToolContext (socket, fromJid, sessionId, pushName)
 * @returns A record of AI SDK dynamic tool entries keyed by tool name
 */
export function createAiSdkTools(context: ToolContext): Record<string, unknown> {
  const toolsRecord: Record<string, unknown> = {};

  for (const entry of allTools) {
    const def = entry.definition;
    const exec = entry.execute;

    toolsRecord[entry.name] = dynamicTool({
      name: def.function.name,
      description: def.function.description,
      // Use jsonSchema() to wrap plain JSON Schema into a Schema instance.
      // Without this, `asSchema(tool.inputSchema)` throws "schema is not a function"
      // because a raw object is not a valid FlexibleSchema.
      inputSchema: jsonSchema(def.function.parameters as Record<string, unknown>),
      execute: async (input: unknown) => {
        const args = (typeof input === 'object' && input !== null)
          ? (input as Record<string, unknown>)
          : {};
        const outcome = await exec(args, context);
        return outcome;
      },
    } as never);
  }

  return toolsRecord;
}

/**
 * Check if any tools are registered in the tool definitions.
 */
export function hasAiSdkTools(): boolean {
  return allTools.length > 0;
}

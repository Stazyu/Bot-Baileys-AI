import type { proto, WAMessage, WASocket } from '@stazyu/baileys';
import type { SimplifiedMessage } from '../bot/botHandler.js';
import type { VisionImage } from '../utils/vision.js';

/**
 * Parameter definition for an AI tool (JSON Schema format).
 * Compatible with OpenAI / OpenRouter function calling spec.
 */
export interface AIToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
}

/**
 * Full definition of an AI-callable tool in OpenAI-compatible format.
 */
export interface AIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, AIToolParameterProperty>;
      required: string[];
    };
  };
}

/**
 * A tool call request from the AI model.
 */
export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * Result of a tool execution, sent back to the AI model.
 */
export interface AIToolResult {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

/**
 * Status result returned after executing a tool.
 */
export interface ToolExecuteResult {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Context passed to tool execute functions so they can send media directly to the user.
 */
export interface ToolContext {
  socket?: WASocket;
  fromJid?: string;
  sessionId?: string;
  /** Sesi WA asli (sessionId sering diisi user JID di jalur AI — jangan dipakai untuk itu). */
  waSessionId?: string;
  /** User pemicu turn AI (JID). */
  userId?: string;
  /** Caller LID if triggered from a group message with LID addressing mode */
  callerLid?: string;
  pushName?: string;
  /** The raw user message that triggered this AI turn (used for intent fallback). */
  userMessage?: string;
  /** Mentioned JIDs/LIDs in the triggering message */
  mentions?: string[];
  /** Quoted participant JID/LID in the triggering message */
  quotedParticipant?: string;
  /** The full incoming message (or proto.IWebMessageInfo) */
  message?: WAMessage;
  /** Simplified message with extracted metadata (isImage, isQuotedImage, etc.) */
  simplified?: SimplifiedMessage;
  /** Vision images already extracted for this turn, if any */
  visionImages?: VisionImage[] | null;
}

/**
 * The function signature for executing a tool.
 */
export type ToolExecuteFunction = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolExecuteResult>;

/**
 * Internal registry entry that pairs the definition with its executor.
 */
export interface ToolRegistryEntry {
  definition: AIToolDefinition;
  execute: ToolExecuteFunction;
}

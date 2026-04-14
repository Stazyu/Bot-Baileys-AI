import sessionManager from './sessionManager.js';
import BotHandler from '../bot/botHandler.js';
import { log } from '../utils/logger.js';
import type { WASocket } from '@innovatorssoft/baileys';

// Map to track bot handlers per session
const botHandlers = new Map<string, BotHandler>();

/**
 * Attach bot handler to a session
 */
async function attachBotHandler(socket: WASocket, sessionId: string): Promise<void> {
  // Remove existing handler if any
  const existingHandler = botHandlers.get(sessionId);
  if (existingHandler) {
    await existingHandler.unloadPlugins();
    botHandlers.delete(sessionId);
  }

  // Create and attach new handler
  const botHandler = new BotHandler(socket, sessionId);
  await botHandler.loadPlugins();
  botHandlers.set(sessionId, botHandler);

  log.info(`✅ BotHandler attached to session: ${sessionId}`);
}

/**
 * Cleanup bot handler for a session
 */
async function cleanupBotHandler(sessionId: string): Promise<void> {
  const handler = botHandlers.get(sessionId);
  if (handler) {
    await handler.unloadPlugins();
    botHandlers.delete(sessionId);
    log.info(`🧹 BotHandler cleaned up for session: ${sessionId}`);
  }
}

// Register callback to attach bot handler whenever a session is created or reconnected
sessionManager.onSessionCreated(async (socket, sessionId) => {
  log.info(`🔗 Session created/reconnected: ${sessionId}, attaching BotHandler...`);
  await attachBotHandler(socket, sessionId);
});

// Register callback to cleanup bot handler whenever a session is disconnected
sessionManager.onSessionDisconnected(async (sessionId) => {
  log.info(`🔌 Session disconnected: ${sessionId}, cleaning up BotHandler...`);
  await cleanupBotHandler(sessionId);
});

/**
 * Create a new session (bot handler is attached automatically via callbacks)
 * This function can be called from anywhere (bot commands, API endpoints, etc.)
 *
 * @param sessionId - Unique identifier for the session
 * @param forceClear - If true, clears existing auth data before creating session
 * @returns The created socket and session ID
 */
export async function createSession(
  sessionId: string,
  forceClear = false
): Promise<{ socket: WASocket; sessionId: string }> {
  log.info(`📱 Creating new session: ${sessionId}, forceClear: ${forceClear}`);

  // Check if session already exists
  const existingSocket = await sessionManager.getSession(sessionId);
  if (existingSocket) {
    log.info(`ℹ️  Session ${sessionId} already exists`);
    return { socket: existingSocket, sessionId };
  }

  // Create new session (callback will automatically attach bot handler)
  const socket = await sessionManager.createSession(sessionId, forceClear);

  log.info(`✅ Session ${sessionId} created`);
  return { socket, sessionId };
}

/**
 * Get a session by ID
 * 
 * @param sessionId - Session identifier
 * @returns The socket if exists, undefined otherwise
 */
export async function getSession(sessionId: string): Promise<WASocket | undefined> {
  return await sessionManager.getSession(sessionId);
}

/**
 * Get all active sessions
 * 
 * @returns Map of session ID to socket
 */
export async function getAllSessions(): Promise<Map<string, WASocket>> {
  return await sessionManager.getAllSessions();
}

/**
 * Disconnect a specific session
 * 
 * @param sessionId - Session identifier
 */
export async function disconnectSession(sessionId: string): Promise<void> {
  await sessionManager.disconnectSession(sessionId);
}

/**
 * Disconnect all sessions
 */
export async function disconnectAllSessions(): Promise<void> {
  await sessionManager.disconnectAllSessions();
}

/**
 * Load active sessions from database and attach handlers
 */
export async function loadActiveSessions(): Promise<void> {
  await sessionManager.loadActiveSessions();

  // Note: Bot handlers are automatically attached via the callback registered above
  // No need to manually attach them here
}

import sessionManager from './sessionManager.js';
import BotHandler from '../bot/botHandler.js';
import { log } from '../utils/logger.js';
import type { WASocket } from 'baileys';

/**
 * Create a new session and attach bot handler
 * This function can be called from anywhere (bot commands, API endpoints, etc.)
 * 
 * @param sessionId - Unique identifier for the session
 * @param forceClear - If true, clears existing auth data before creating session
 * @returns The created socket and session ID
 */
export async function createSessionWithHandler(
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

  // Create new session
  const socket = await sessionManager.createSession(sessionId, forceClear);

  // Attach bot handler
  const botHandler = new BotHandler(socket, sessionId);
  await botHandler.loadPlugins();

  log.info(`✅ Session ${sessionId} created with handler`);
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

  // Attach bot handlers to all loaded sessions
  const sessions = await sessionManager.getAllSessions();
  for (const [sessionId, socket] of sessions.entries()) {
    log.info(`📱 Attaching handler to session: ${sessionId}`);
    const botHandler = new BotHandler(socket, sessionId);
    await botHandler.loadPlugins();
  }
}

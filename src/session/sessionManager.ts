import {
  makeWASocket,
  DisconnectReason,
  BaileysEventMap,
  ConnectionState,
  Browsers,
} from '@innovatorssoft/baileys';
import type { WASocket } from '@innovatorssoft/baileys';
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { Boom } from '@hapi/boom';
import { Prisma } from '@prisma/client';
import prisma from '../database/prisma.js';
import { useMultiFileAuthStateDB } from './authStateDB.js';
import { log } from '../utils/logger.js';
import QRCode from 'qrcode';
import NodeCache from 'node-cache';

export interface SessionConfig {
  sessionId: string;
  phoneNumber?: string;
}

export type SessionCallback = (socket: WASocket, sessionId: string) => void | Promise<void>;
export type SessionDisconnectCallback = (sessionId: string) => void | Promise<void>;

export class SessionManager {
  private sessions: Map<string, WASocket> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;
  private sessionCallbacks: SessionCallback[] = [];
  private disconnectCallbacks: SessionDisconnectCallback[] = [];
  private logger = pino(
    { level: 'silent' },
    pinoPretty({
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    })
  );
  private groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

  async createSession(sessionId: string, forceClear = false): Promise<WASocket> {
    // Check if session already exists
    if (this.sessions.has(sessionId) && !forceClear) {
      const socket = this.sessions.get(sessionId)!;
      log.info(`🔄 [SessionManager] Session ${sessionId} already exists, registering handlers`);
      const { saveCreds } = await useMultiFileAuthStateDB(sessionId, forceClear);
      // const { saveCreds } = await useMultiFileAuthState(path.join(process.cwd(), 'sessions', sessionId));
      this.registerMessageHandlers(socket, sessionId, saveCreds);
      return socket;
    }

    // Force clear: delete existing session
    if (forceClear && this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
    }

    const { state, saveCreds } = await useMultiFileAuthStateDB(sessionId, forceClear);
    // const { state, saveCreds } = await useMultiFileAuthState(path.join(process.cwd(), 'sessions', sessionId));

    const socket = makeWASocket({
      auth: state,
      version: [2, 3000, 1039568566],
      logger: this.logger,
      // browser: ['Bot-Baileys-AI', 'Chrome', '1.0.0'],
      browser: Browsers.windows('Bot-Baileys-AI'),
      generateHighQualityLinkPreview: true,
      cachedGroupMetadata: async (jid) => this.groupCache.get(jid),
      getMessage: async (key) => {
        return (await prisma.message.findFirst({
          where: {
            key: key as any,
          },
        })) as any;
      },
    });

    this.registerMessageHandlers(socket, sessionId, saveCreds);

    // Store session
    this.sessions.set(sessionId, socket);

    // Save session to database
    await this.saveSessionToDB(sessionId, socket);

    // Trigger callbacks for new session (only when actually creating a new socket)
    await this.triggerCallbacks(socket, sessionId);

    return socket;
  }

  onSessionCreated(callback: SessionCallback): void {
    this.sessionCallbacks.push(callback);
  }

  onSessionDisconnected(callback: SessionDisconnectCallback): void {
    this.disconnectCallbacks.push(callback);
  }

  private async triggerCallbacks(socket: WASocket, sessionId: string): Promise<void> {
    for (const callback of this.sessionCallbacks) {
      try {
        await callback(socket, sessionId);
      } catch (error) {
        log.error(`Error in session callback for ${sessionId}:`, error as object);
      }
    }
  }

  private async triggerDisconnectCallbacks(sessionId: string): Promise<void> {
    for (const callback of this.disconnectCallbacks) {
      try {
        await callback(sessionId);
      } catch (error) {
        log.error(`Error in disconnect callback for ${sessionId}:`, error as object);
      }
    }
  }

  private registerMessageHandlers(socket: WASocket, sessionId: string, saveCreds: () => Promise<void>): void {
    log.info(`🔌 [SessionManager] Registering event handlers for session: ${sessionId}`);

    // Test message handler - log ALL messages to see if socket receives anything
    // socket.ev.on('messages.upsert', (m) => {
    //   console.log('🔔 [SessionManager] messages.upsert triggered:', {
    //     type: m.type,
    //     count: m.messages.length,
    //     messages: m.messages.map((msg: any) => ({
    //       key: msg.key,
    //       hasMessage: !!msg.message,
    //       messageKeys: msg.message ? Object.keys(msg.message) : 'none',
    //     })),
    //   });
    // });

    // Save credentials on update
    socket.ev.on('creds.update', saveCreds);

    // Update group metadata cache on group updates
    socket.ev.on('groups.update', async ([event]) => {
      try {
        if (event.id) {
          const metadata = await socket.groupMetadata(event.id);
          this.groupCache.set(event.id, metadata);
          log.info(`📦 [SessionManager] Group metadata cached for: ${event.id}`);
        }
      } catch (error) {
        log.error(`Error updating group metadata cache:`, error as object);
      }
    });

    // Update group metadata cache on participant updates
    socket.ev.on('group-participants.update', async (event) => {
      try {
        if (event.id) {
          const metadata = await socket.groupMetadata(event.id);
          this.groupCache.set(event.id, metadata);
          log.info(`📦 [SessionManager] Group metadata cached for: ${event.id} (participants update)`);
        }
      } catch (error) {
        log.error(`Error updating group metadata cache (participants):`, error as object);
      }
    });

    // Handle connection updates
    socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        log.info(`QR Code for session ${sessionId}:`);
        log.info(await QRCode.toString(qr, { type: 'terminal', small: true }));
      }

      if (connection === 'close') {
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        log.info(
          `Connection closed for session ${sessionId}. Reconnecting: ${shouldReconnect}`
        );

        if (shouldReconnect) {
          const attempts = this.reconnectAttempts.get(sessionId) || 0;

          if (attempts >= this.maxReconnectAttempts) {
            log.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached for session ${sessionId}`);
            this.reconnectAttempts.delete(sessionId);
            await this.deleteSessionFromDB(sessionId);
            this.sessions.delete(sessionId);
            await this.triggerDisconnectCallbacks(sessionId);
            return;
          }

          this.reconnectAttempts.set(sessionId, attempts + 1);
          const backoffDelay = Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30 seconds

          log.info(`Reconnecting session ${sessionId} in ${backoffDelay}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);

          setTimeout(async () => {
            this.sessions.delete(sessionId);
            await this.triggerDisconnectCallbacks(sessionId);
            await this.createSession(sessionId);
          }, backoffDelay);
        } else {
          // Delete session from database if logged out
          this.reconnectAttempts.delete(sessionId);
          await this.deleteSessionFromDB(sessionId);
          this.sessions.delete(sessionId);
          await this.triggerDisconnectCallbacks(sessionId);
        }
      } else if (connection === 'open') {
        // Reset reconnection attempts on successful connection
        this.reconnectAttempts.delete(sessionId);
        log.info(`Connection opened for session ${sessionId}`);

        // Update phone number in database
        const authState = socket.user;
        if (authState?.id) {
          await prisma.session.update({
            where: { sessionId },
            data: {
              phoneNumber: authState.id.split(':')[0] || authState.id,
              isActive: true,
            },
          });
        }
      }
    });

    log.info(`✅ [SessionManager] Event handlers registered for session: ${sessionId}`);
  }

  async getSession(sessionId: string): Promise<WASocket | undefined> {
    return this.sessions.get(sessionId);
  }

  async getAllSessions(): Promise<Map<string, WASocket>> {
    return this.sessions;
  }

  async disconnectSession(sessionId: string): Promise<void> {
    const socket = this.sessions.get(sessionId);
    if (socket) {
      await socket.logout();
      this.sessions.delete(sessionId);
      await this.deleteSessionFromDB(sessionId);
      await this.triggerDisconnectCallbacks(sessionId);
    }
  }

  async disconnectAllSessions(): Promise<void> {
    for (const [sessionId, socket] of this.sessions.entries()) {
      try {
        // Just end the connection without logging out to preserve authData
        socket.end(undefined);
      } catch (error) {
        log.error(`Error ending session ${sessionId}:`, error as object);
      }
      // Mark as inactive but keep authData
      await prisma.session.update({
        where: { sessionId },
        data: { isActive: false },
      }).catch(() => {
        // Session might not exist, that's ok
      });
      await this.triggerDisconnectCallbacks(sessionId);
    }
    this.sessions.clear();
  }

  private async saveSessionToDB(
    sessionId: string,
    socket: WASocket
  ): Promise<void> {
    try {
      await prisma.session.upsert({
        where: { sessionId },
        update: { isActive: true },
        create: {
          sessionId,
          isActive: true,
        },
      });
    } catch (error) {
      log.error(`Error saving session ${sessionId} to DB:`, error as object);
    }
  }

  private async deleteSessionFromDB(sessionId: string): Promise<void> {
    try {
      await prisma.session.update({
        where: { sessionId },
        data: { isActive: false, authData: Prisma.JsonNull },
      });
    } catch (error) {
      log.error(`Error deleting session ${sessionId} from DB:`, error as object);
    }
  }

  async loadActiveSessions(): Promise<void> {
    try {
      // Load sessions that have authData, regardless of isActive status
      const sessions = await prisma.session.findMany({
        where: { authData: { not: Prisma.JsonNull } },
      });

      for (const session of sessions) {
        log.info(`Loading session: ${session.sessionId}`);
        await this.createSession(session.sessionId);
      }
    } catch (error) {
      log.error('Error loading active sessions:', error as object);
    }
  }
}

export default new SessionManager();

import {
  makeWASocket,
  DisconnectReason,
  BaileysEventMap,
  ConnectionState,
  Browsers,
} from 'baileys';
import type { WASocket } from 'baileys';
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { Boom } from '@hapi/boom';
import { Prisma } from '@prisma/client';
import prisma from '../database/prisma.js';
import { useMultiFileAuthStateDB } from './authStateDB.js';
import { log } from '../utils/logger.js';
import { useMultiFileAuthState } from 'baileys';
import path from 'path';
import QRCode from 'qrcode';

export interface SessionConfig {
  sessionId: string;
  phoneNumber?: string;
}

export class SessionManager {
  private sessions: Map<string, WASocket> = new Map();
  private logger = pino(
    { level: 'silent' },
    pinoPretty({
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    })
  );

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
      version: [2, 3000, 1035194821],
      logger: this.logger,
      // browser: ['Bot-Baileys-AI', 'Chrome', '1.0.0'],
      browser: Browsers.windows('Bot-Baileys-AI'),
      generateHighQualityLinkPreview: true,
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

    return socket;
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
          this.sessions.delete(sessionId);
          await this.createSession(sessionId);
        } else {
          // Delete session from database if logged out
          await this.deleteSessionFromDB(sessionId);
          this.sessions.delete(sessionId);
        }
      } else if (connection === 'open') {
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

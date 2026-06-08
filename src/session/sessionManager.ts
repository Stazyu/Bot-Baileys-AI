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
import prisma from '../database/prisma.js';
import { usePrismaAuthState } from '../libs/baileys/usePrismaAuthState.js';
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
  private saveCredsMap: Map<string, () => Promise<void>> = new Map();
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
      const saveCreds = this.saveCredsMap.get(sessionId);
      if (saveCreds) {
        this.registerMessageHandlers(socket, sessionId, saveCreds);
      } else {
        const { saveCreds: sc } = await usePrismaAuthState(sessionId);
        this.saveCredsMap.set(sessionId, sc);
        this.registerMessageHandlers(socket, sessionId, sc);
      }
      return socket;
    }

    // Force clear: delete existing session
    if (forceClear && this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
    }

    const { state, saveCreds } = await usePrismaAuthState(sessionId, forceClear);
    this.saveCredsMap.set(sessionId, saveCreds);

    const socket = makeWASocket({
      auth: state,
      version: [2, 3000, 1039568566],
      logger: this.logger,
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
    await this.saveSessionToDB(sessionId);

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

  private async updateWaSessionMeta(
    sessionId: string,
    data: {
      status?: string;
      isActive?: boolean;
      phoneNumber?: string | null;
      lastConnectedAt?: Date | null;
      lastDisconnectedAt?: Date | null;
      lastQrAt?: Date | null;
    },
  ): Promise<void> {
    try {
      await prisma.waSession.upsert({
        where: { sessionId },
        update: data,
        create: { sessionId, ...data },
      });
    } catch (err) {
      log.error(`[WaSession] Gagal update metadata "${sessionId}":`, err as object);
    }
  }

  private registerMessageHandlers(socket: WASocket, sessionId: string, saveCreds: () => Promise<void>): void {
    log.info(`🔌 [SessionManager] Registering event handlers for session: ${sessionId}`);

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
        await this.updateWaSessionMeta(sessionId, {
          status: 'qr',
          isActive: false,
          lastQrAt: new Date(),
        });
      }

      if (connection === 'close') {
        const isLoggedOut =
          (lastDisconnect?.error as Boom)?.output?.statusCode ===
          DisconnectReason.loggedOut;

        const shouldReconnect = !isLoggedOut;

        log.info(
          `Connection closed for session ${sessionId}. Reconnecting: ${shouldReconnect}`
        );

        await this.updateWaSessionMeta(sessionId, {
          status: isLoggedOut ? 'logged_out' : 'disconnected',
          isActive: false,
          lastDisconnectedAt: new Date(),
        });

        if (shouldReconnect) {
          const attempts = this.reconnectAttempts.get(sessionId) || 0;

          if (attempts >= this.maxReconnectAttempts) {
            log.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached for session ${sessionId}`);
            this.reconnectAttempts.delete(sessionId);
            this.saveCredsMap.delete(sessionId);
            this.sessions.delete(sessionId);
            await this.triggerDisconnectCallbacks(sessionId);
            return;
          }

          this.reconnectAttempts.set(sessionId, attempts + 1);
          const backoffDelay = Math.min(1000 * Math.pow(2, attempts), 30000); // Max 30 seconds

          log.info(`Reconnecting session ${sessionId} in ${backoffDelay}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);

          setTimeout(async () => {
            this.sessions.delete(sessionId);
            this.saveCredsMap.delete(sessionId);
            await this.triggerDisconnectCallbacks(sessionId);
            await this.createSession(sessionId);
          }, backoffDelay);
        } else {
          this.reconnectAttempts.delete(sessionId);
          this.saveCredsMap.delete(sessionId);
          this.sessions.delete(sessionId);
          await this.triggerDisconnectCallbacks(sessionId);
        }
      } else if (connection === 'open') {
        this.reconnectAttempts.delete(sessionId);
        log.info(`Connection opened for session ${sessionId}`);

        const userId = socket.user?.id;
        const phoneNumber = userId?.split(':')[0] || userId || null;

        await this.updateWaSessionMeta(sessionId, {
          status: 'connected',
          isActive: true,
          lastConnectedAt: new Date(),
          phoneNumber,
        });
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
      // Mark as inactive but keep auth data
      await prisma.waSession.upsert({
        where: { sessionId },
        update: { isActive: false, status: 'disconnected' },
        create: { sessionId, isActive: false, status: 'disconnected' },
      }).catch(() => {
        // Session might not exist, that's ok
      });
      await this.triggerDisconnectCallbacks(sessionId);
    }
    this.sessions.clear();
  }

  private async saveSessionToDB(sessionId: string): Promise<void> {
    try {
      await prisma.waSession.upsert({
        where: { sessionId },
        update: { isActive: true },
        create: { sessionId, isActive: true },
      });
    } catch (error) {
      log.error(`Error saving session ${sessionId} to DB:`, error as object);
    }
  }

  private async deleteSessionFromDB(sessionId: string): Promise<void> {
    try {
      await prisma.waSession.upsert({
        where: { sessionId },
        update: { isActive: false, status: 'disconnected' },
        create: { sessionId, isActive: false, status: 'disconnected' },
      });
    } catch (error) {
      log.error(`Error deleting session ${sessionId} from DB:`, error as object);
    }
  }

  async loadActiveSessions(forceClear = false): Promise<void> {
    try {
      // Cari session yang punya creds di WaAuthState (tidak peduli status isActive)
      const credsRows = await prisma.waAuthState.findMany({
        where: { type: 'creds', key: 'creds' },
        select: { sessionId: true },
      });
      const seen = new Set<string>();
      const sessionIds: string[] = [];
      for (const r of credsRows) {
        if (!seen.has(r.sessionId)) {
          seen.add(r.sessionId);
          sessionIds.push(r.sessionId);
        }
      }

      // Optional allowlist / blocklist via env vars (comma-separated session ids)
      // - INCLUDE_SESSIONS=a,b => only load these
      // - EXCLUDE_SESSIONS=dev,staging => load all EXCEPT these
      // INCLUDE wins if both are set.
      const includeRaw = process.env.INCLUDE_SESSIONS?.trim();
      const excludeRaw = process.env.EXCLUDE_SESSIONS?.trim();
      const includeList = includeRaw
        ? includeRaw.split(',').map(s => s.trim()).filter(Boolean)
        : null;
      const excludeList = excludeRaw
        ? new Set(excludeRaw.split(',').map(s => s.trim()).filter(Boolean))
        : new Set<string>();

      const filtered = sessionIds.filter((sid) => {
        if (includeList && !includeList.includes(sid)) return false;
        if (excludeList.has(sid)) return false;
        return true;
      });

      const skipped = sessionIds.length - filtered.length;
      if (includeList) {
        log.info(`📦 [SessionManager] INCLUDE_SESSIONS active: loading ${filtered.length}/${sessionIds.length} session(s)`);
      } else if (skipped > 0) {
        log.info(`📦 [SessionManager] EXCLUDE_SESSIONS active: loading ${filtered.length}/${sessionIds.length} session(s) (skipped: ${[...excludeList].join(', ')})`);
      } else {
        log.info(`📦 [SessionManager] Found ${sessionIds.length} session(s) in database`);
      }

      for (const sid of filtered) {
        log.info(`Loading session: ${sid}`);
        await this.createSession(sid, forceClear);
      }
    } catch (error) {
      log.error('Error loading active sessions:', error as object);
    }
  }
}

export default new SessionManager();

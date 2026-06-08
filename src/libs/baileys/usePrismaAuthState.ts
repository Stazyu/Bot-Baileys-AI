import prisma from '../../database/prisma.js';
import { log } from '../../utils/logger.js';
import {
  initAuthCreds,
  BufferJSON,
  AuthenticationCreds,
  AuthenticationState,
} from '@innovatorssoft/baileys';

// ─── Single-value helpers ────────────────────────────────────────

export async function getAuthValue(
  sessionId: string,
  type: string,
  key: string,
): Promise<any> {
  try {
    const row = await prisma.waAuthState.findUnique({
      where: { sessionId_type_key: { sessionId, type, key } },
    });
    if (!row?.value) return null;
    return JSON.parse(JSON.stringify(row.value), BufferJSON.reviver);
  } catch (err) {
    log.error(`[getAuthValue] ${sessionId}/${type}/${key} failed:`, err as object);
    return null;
  }
}

export async function setAuthValue(
  sessionId: string,
  type: string,
  key: string,
  value: any,
): Promise<void> {
  if (value == null) {
    await removeAuthValue(sessionId, type, key);
    return;
  }
  try {
    const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
    await prisma.waAuthState.upsert({
      where: { sessionId_type_key: { sessionId, type, key } },
      update: { value: serialized },
      create: { sessionId, type, key, value: serialized },
    });
  } catch (err) {
    log.error(`[setAuthValue] ${sessionId}/${type}/${key} failed:`, err as object);
  }
}

export async function removeAuthValue(
  sessionId: string,
  type: string,
  key: string,
): Promise<void> {
  try {
    await prisma.waAuthState.delete({
      where: { sessionId_type_key: { sessionId, type, key } },
    });
  } catch {
    // row may not exist — ignore
  }
}

// ─── Full auth-state helper (mirip useMultiFileAuthState) ────────

export async function usePrismaAuthState(
  sessionId: string,
  forceClear = false,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  // ── force-clear: hapus semua auth data ───────────────────────
  if (forceClear) {
    log.info(`[usePrismaAuthState] Force-clearing auth data for "${sessionId}"`);
    await prisma.waAuthState.deleteMany({ where: { sessionId } });
    await prisma.waSession.upsert({
      where: { sessionId },
      update: { status: 'disconnected', isActive: false },
      create: { sessionId, status: 'disconnected', isActive: false },
    });
  }

  // ── pastikan WaSession ada ─────────────────────────────────────
  await prisma.waSession.upsert({
    where: { sessionId },
    update: {},
    create: { sessionId },
  });

  // ── load creds ────────────────────────────────────────────────
  let creds: AuthenticationCreds;
  const credsRow = await prisma.waAuthState.findUnique({
    where: { sessionId_type_key: { sessionId, type: 'creds', key: 'creds' } },
  });

  if (credsRow?.value) {
    creds = JSON.parse(JSON.stringify(credsRow.value), BufferJSON.reviver);
    if (!creds || !creds.me) {
      log.info('[usePrismaAuthState] creds.me hilang — generate ulang');
      creds = initAuthCreds();
    }
  } else {
    log.info('[usePrismaAuthState] Tidak ada creds — inisialisasi baru');
    creds = initAuthCreds();
    const serialized = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
    await prisma.waAuthState.upsert({
      where: { sessionId_type_key: { sessionId, type: 'creds', key: 'creds' } },
      update: { value: serialized },
      create: { sessionId, type: 'creds', key: 'creds', value: serialized },
    });
  }

  // ── load semua keys ke memory ─────────────────────────────────
  const keys: Record<string, any> = {};
  const allRows = await prisma.waAuthState.findMany({
    where: { sessionId, type: { not: 'creds' } },
  });
  for (const row of allRows) {
    if (!keys[row.type]) keys[row.type] = {};
    keys[row.type][row.key] = JSON.parse(JSON.stringify(row.value), BufferJSON.reviver);
  }

  // ── saveCreds ─────────────────────────────────────────────────
  const saveCreds = async () => {
    try {
      const serialized = JSON.parse(JSON.stringify(creds, BufferJSON.replacer));
      await prisma.waAuthState.upsert({
        where: { sessionId_type_key: { sessionId, type: 'creds', key: 'creds' } },
        update: { value: serialized },
        create: { sessionId, type: 'creds', key: 'creds', value: serialized },
      });
    } catch (err) {
      log.error(`[saveCreds] Gagal menyimpan creds session "${sessionId}":`, err as object);
    }
  };

  // ── state ──────────────────────────────────────────────────────
  return {
    state: {
      creds,
      keys: {
        get: (type: string, ids: string[]) => {
          if (!ids || ids.length === 0) {
            return keys[type] || {};
          }
          const result: any = {};
          for (const id of ids) {
            result[id] = keys[type]?.[id];
          }
          return result;
        },
        set: async (data: any) => {
          for (const type in data) {
            const items = data[type];
            for (const id in items) {
              const value = items[id];
              if (value == null) {
                await removeAuthValue(sessionId, type, id);
                if (keys[type]) delete keys[type][id];
              } else {
                const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
                await prisma.waAuthState.upsert({
                  where: { sessionId_type_key: { sessionId, type, key: id } },
                  update: { value: serialized },
                  create: { sessionId, type, key: id, value: serialized },
                });
                if (!keys[type]) keys[type] = {};
                keys[type][id] = value;
              }
            }
          }
        },
      },
    },
    saveCreds,
  };
}

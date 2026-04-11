import prisma from '../database/prisma.js';
import { Prisma } from '@prisma/client';
import { log } from '../utils/logger.js';
import {
  initAuthCreds,
  BufferJSON,
  AuthenticationCreds,
  AuthenticationState,
} from 'baileys';

/**
 * Database-based auth state storage for Baileys
 * Stores auth credentials in database instead of files
 * @param sessionId - Session identifier
 * @param forceClear - If true, clears existing auth data and starts fresh
 */
export async function useMultiFileAuthStateDB(
  sessionId: string,
  forceClear = false
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  // Load session info from database
  const sessionInfo = await prisma.session.findUnique({
    where: { sessionId },
    select: { authData: true, isActive: true },
  });

  // Force clear old auth data if requested
  if (forceClear) {
    log.info(`Force clearing auth data for session ${sessionId}`);
    await prisma.session.update({
      where: { sessionId },
      data: { authData: Prisma.JsonNull },
    }).catch(() => {
      // Session might not exist, that's ok
    });
  }

  let creds: AuthenticationCreds;
  let keys: any = {};

  // Parse authData if it's a string (Prisma returns JSON as string)
  let authDataToParse = sessionInfo?.authData;
  if (typeof authDataToParse === 'string') {
    authDataToParse = JSON.parse(authDataToParse);
  }

  if (authDataToParse && typeof authDataToParse === 'object') {
    try {
      const parsedAuth = JSON.parse(JSON.stringify(authDataToParse), BufferJSON.reviver);
      creds = parsedAuth.creds;
      keys = parsedAuth.keys || {};

      // Validate creds structure
      if (!creds || !creds.me) {
        log.info('Invalid creds structure in DB, initializing new creds');
        creds = initAuthCreds();
      }
    } catch (error) {
      log.error('Error parsing auth data from DB, initializing new creds:', error as object);
      creds = initAuthCreds();
      keys = {};
    }
  } else {
    creds = initAuthCreds();
  }

  // Ensure creds has required structure
  if (!creds.me) {
    log.warn('creds.me is missing, initializing with default structure');
    creds = initAuthCreds();
  }

  const saveState = async () => {
    try {
      const authData = JSON.stringify({ creds, keys }, BufferJSON.replacer);

      const result = await prisma.session.upsert({
        where: { sessionId },
        update: { authData },
        create: {
          sessionId,
          authData,
          isActive: true,
        },
      });
    } catch (error) {
      log.error(`Error saving auth state for session ${sessionId}:`, error as object);
    }
  };

  return {
    state: {
      creds,
      keys: {
        get: (type: string, ids: string[]) => {
          // If no IDs provided, return entire type object
          if (!ids || ids.length === 0) {
            return keys[type] || {};
          }
          // Return all requested keys
          const result: any = {};
          for (const id of ids) {
            result[id] = keys[type]?.[id];
          }
          return result;
        },
        set: async (data: any) => {
          // data structure: { type: { id: value } }
          for (const type in data) {
            if (!keys[type]) {
              keys[type] = {};
            }
            const typeData = data[type];
            for (const id in typeData) {
              keys[type][id] = typeData[id];
            }
          }
          await saveState();
        },
      },
    },
    saveCreds: async () => {
      await saveState();
    },
  };
}

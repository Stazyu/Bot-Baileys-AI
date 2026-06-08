import prisma from '../database/prisma.js';

const AI_DISABLED_GROUPS = new Set<string>();
const DB_PREFIX = 'ai_group_disabled:';
let loaded = false;

async function loadFromDB(): Promise<void> {
  if (loaded) return;
  try {
    const rows = await prisma.botConfig.findMany({
      where: { key: { startsWith: DB_PREFIX } },
    });
    for (const row of rows) {
      AI_DISABLED_GROUPS.add(row.key.replace(DB_PREFIX, ''));
    }
    loaded = true;
  } catch (error) {
    console.error('Failed to load AI group settings from DB:', error);
  }
}

export async function initAIGroupToggle(): Promise<void> {
  await loadFromDB();
}

export function isAIGroupEnabled(groupJid: string): boolean {
  return !AI_DISABLED_GROUPS.has(groupJid);
}

export async function setAIGroupEnabled(groupJid: string, enabled: boolean): Promise<void> {
  await loadFromDB();
  const dbKey = `${DB_PREFIX}${groupJid}`;

  if (enabled) {
    AI_DISABLED_GROUPS.delete(groupJid);
    try {
      await prisma.botConfig.deleteMany({ where: { key: dbKey } });
    } catch { /* ignore */ }
  } else {
    AI_DISABLED_GROUPS.add(groupJid);
    try {
      await prisma.botConfig.upsert({
        where: { key: dbKey },
        create: { key: dbKey, value: 'true' },
        update: { value: 'true' },
      });
    } catch (error) {
      console.error('Failed to save AI group setting to DB:', error);
    }
  }
}

export function getAIGroupStatus(groupJid: string): boolean {
  return !AI_DISABLED_GROUPS.has(groupJid);
}

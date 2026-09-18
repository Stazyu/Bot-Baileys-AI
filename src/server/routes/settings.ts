import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../database/prisma.js';
import { getPrefixes, loadConfig, patchRuntimeConfig } from '../../config/botConfig.js';
import { premiumService } from '../../services/premiumService.js';
import { rateLimiter } from '../../utils/rateLimiter.js';
import { parseBody } from '../validate.js';

const AI_TOOLS = ['webSearch', 'webFetch', 'downloadSocial', 'downloadYoutube', 'pinterestSearch', 'pinterestSticker'] as const;

const settingsPatch = z
  .object({
    profile: z
      .object({
        botName: z.string().min(1).max(64).optional(),
        ownerNumbers: z.array(z.string().max(64)).max(20).optional(),
      })
      .optional(),
    prefixes: z
      .object({
        list: z.array(z.string().min(1).max(4)).min(1).max(10).optional(),
        commandCooldownSec: z.number().int().min(0).max(3600).optional(),
      })
      .optional(),
    ai: z
      .object({
        provider: z.string().max(32).optional(),
        model: z.string().max(128).optional(),
        systemPromptName: z.string().max(64).optional(),
        maxToolRounds: z.number().int().min(1).max(20).optional(),
        streamResponses: z.boolean().optional(),
        groupAutoReply: z.boolean().optional(),
        groupMentionOnly: z.boolean().optional(),
        toolsEnabled: z.record(z.string(), z.boolean()).optional(),
      })
      .optional(),
    tiers: z
      .object({
        free: z.object({ ai: z.number().int().min(0), group: z.number().int().min(0), command: z.number().int().min(0) }).optional(),
        premium: z.object({ ai: z.number().int().min(0), group: z.number().int().min(0), command: z.number().int().min(0) }).optional(),
        enforcePrivateAi: z.boolean().optional(),
        enforceGroupAi: z.boolean().optional(),
        enforceCommand: z.boolean().optional(),
      })
      .optional(),
    maintenance: z
      .object({
        enabled: z.boolean().optional(),
        message: z.string().max(500).optional(),
      })
      .optional(),
    security: z
      .object({
        blockUnknownJid: z.boolean().optional(),
        logAllMessages: z.boolean().optional(),
        rateLimitPerMinute: z.number().int().min(1).max(10_000).optional(),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty_patch' });

async function readConfigs(): Promise<Record<string, string>> {
  const rows = await prisma.botConfig.findMany();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

async function writeConfigs(entries: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(entries).map(([key, value]) =>
      prisma.botConfig.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );
}

const num = (raw: string | undefined, fallback: number): number => {
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (raw: string | undefined, fallback: boolean): boolean =>
  raw === undefined ? fallback : raw === 'true';

export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/settings', async () => {
    const [cfg, tiers, toggles] = await Promise.all([
      readConfigs(),
      Promise.resolve(premiumService.getAllTiers()),
      Promise.resolve(premiumService.getToggleStatus()),
    ]);
    const base = loadConfig();
    const toolsEnabled: Record<string, boolean> = {};
    for (const tool of AI_TOOLS) toolsEnabled[tool] = cfg[`ai:tool:${tool}`] !== 'false';
    return {
      profile: {
        botName: cfg['bot:name'] ?? process.env.BOT_NAME ?? 'Bot-Baileys-AI',
        ownerNumbers: (cfg['bot:ownerNumbers'] ?? base.ownerNumbers.join(',')).split(',').map((s) => s.trim()).filter(Boolean),
        version: process.env.BOT_VERSION ?? '2.0.0',
      },
      prefixes: {
        list: (cfg['bot:prefixes'] ?? getPrefixes().join(',')).split(',').map((s) => s.trim()).filter(Boolean),
        commandCooldownSec: num(cfg['bot:cooldownSec'], 2),
      },
      ai: {
        provider: cfg['ai:provider'] ?? process.env.AI_PROVIDER ?? 'openrouter',
        model: cfg['ai:model'] ?? '',
        systemPromptName: cfg['ai:systemPrompt'] ?? 'default',
        maxToolRounds: num(cfg['ai:maxToolRounds'], 4),
        streamResponses: bool(cfg['ai:stream'], true),
        groupAutoReply: bool(cfg['ai:groupAutoReply'], true),
        groupMentionOnly: bool(cfg['ai:groupMentionOnly'], true),
        toolsEnabled,
      },
      tiers: {
        free: { ai: tiers.free.dailyAiChatLimit, group: tiers.free.dailyGroupAiLimit, command: tiers.free.dailyCommandLimit },
        premium: { ai: tiers.premium.dailyAiChatLimit, group: tiers.premium.dailyGroupAiLimit, command: tiers.premium.dailyCommandLimit },
        enforcePrivateAi: toggles.privateAi,
        enforceGroupAi: toggles.groupAi,
        enforceCommand: toggles.command,
      },
      maintenance: {
        enabled: (cfg['bot:maintenance'] ?? String(base.maintenance)) === 'true',
        message: cfg['bot:maintenanceMessage'] ?? base.maintenanceMessage ?? '',
      },
      security: {
        blockUnknownJid: bool(cfg['sec:blockUnknownJid'], false),
        logAllMessages: bool(cfg['sec:logAllMessages'], true),
        rateLimitPerMinute: num(cfg['sec:rateLimitPerMinute'], 30),
      },
    };
  });

  app.patch('/api/settings', (req, reply) => {
    const body = parseBody(settingsPatch, req.body, reply);
    if (!body) return;
    return (async () => {
      const applied: Record<string, boolean> = {};
      const requiresRestart: string[] = [];
      const pendingEnforcement: string[] = [];
      const entries: Record<string, string> = {};

      if (body.profile) {
        if (body.profile.botName !== undefined) entries['bot:name'] = body.profile.botName;
        if (body.profile.ownerNumbers !== undefined) {
          entries['bot:ownerNumbers'] = body.profile.ownerNumbers.join(',');
          patchRuntimeConfig({ ownerNumbers: body.profile.ownerNumbers });
          applied['profile.ownerNumbers'] = true;
        }
      }

      if (body.prefixes) {
        if (body.prefixes.list !== undefined) {
          entries['bot:prefixes'] = body.prefixes.list.join(',');
          patchRuntimeConfig({ prefixes: body.prefixes.list });
          applied['prefixes.list'] = true;
        }
        if (body.prefixes.commandCooldownSec !== undefined) {
          entries['bot:cooldownSec'] = String(body.prefixes.commandCooldownSec);
          rateLimiter.configure({ defaultCooldownSec: body.prefixes.commandCooldownSec });
          applied['prefixes.commandCooldownSec'] = true;
        }
      }

      if (body.ai) {
        const ai = body.ai;
        if (ai.provider !== undefined) entries['ai:provider'] = ai.provider;
        if (ai.model !== undefined) entries['ai:model'] = ai.model;
        if (ai.systemPromptName !== undefined) entries['ai:systemPrompt'] = ai.systemPromptName;
        if (ai.maxToolRounds !== undefined) entries['ai:maxToolRounds'] = String(ai.maxToolRounds);
        if (ai.streamResponses !== undefined) entries['ai:stream'] = String(ai.streamResponses);
        if (ai.groupAutoReply !== undefined) entries['ai:groupAutoReply'] = String(ai.groupAutoReply);
        if (ai.groupMentionOnly !== undefined) entries['ai:groupMentionOnly'] = String(ai.groupMentionOnly);
        if (ai.toolsEnabled) {
          for (const [tool, enabled] of Object.entries(ai.toolsEnabled)) {
            if ((AI_TOOLS as readonly string[]).includes(tool)) entries[`ai:tool:${tool}`] = String(enabled);
          }
        }
        // Belum ada loader yang membaca ai:* dari DB — override tersimpan tapi tidak
        // berefek ke runtime (aiService baca process.env saat boot). Lihat plans/TODO.md.
        requiresRestart.push('ai');
      }

      if (body.tiers) {
        const tiers = body.tiers;
        if (tiers.free) {
          entries['tier:free:ai'] = String(tiers.free.ai);
          entries['tier:free:group'] = String(tiers.free.group);
          entries['tier:free:command'] = String(tiers.free.command);
        }
        if (tiers.premium) {
          entries['tier:premium:ai'] = String(tiers.premium.ai);
          entries['tier:premium:group'] = String(tiers.premium.group);
          entries['tier:premium:command'] = String(tiers.premium.command);
        }
        if (tiers.free || tiers.premium) {
          await writeConfigs(entries);
          for (const key of Object.keys(entries)) delete entries[key];
          await premiumService.reloadTiers();
          applied['tiers.limits'] = true;
        }
        if (tiers.enforcePrivateAi !== undefined) {
          await premiumService.setPrivateAiLimitEnabled(tiers.enforcePrivateAi);
          applied['tiers.enforcePrivateAi'] = true;
        }
        if (tiers.enforceGroupAi !== undefined) {
          await premiumService.setGroupAiLimitEnabled(tiers.enforceGroupAi);
          applied['tiers.enforceGroupAi'] = true;
        }
        if (tiers.enforceCommand !== undefined) {
          await premiumService.setCommandLimitEnabled(tiers.enforceCommand);
          applied['tiers.enforceCommand'] = true;
        }
      }

      if (body.maintenance) {
        if (body.maintenance.enabled !== undefined) {
          entries['bot:maintenance'] = String(body.maintenance.enabled);
          patchRuntimeConfig({ maintenance: body.maintenance.enabled });
          applied['maintenance.enabled'] = true;
        }
        if (body.maintenance.message !== undefined) {
          entries['bot:maintenanceMessage'] = body.maintenance.message;
          patchRuntimeConfig({ maintenanceMessage: body.maintenance.message });
          applied['maintenance.message'] = true;
        }
      }

      if (body.security) {
        const sec = body.security;
        if (sec.blockUnknownJid !== undefined) {
          entries['sec:blockUnknownJid'] = String(sec.blockUnknownJid);
          pendingEnforcement.push('sec.blockUnknownJid');
        }
        if (sec.logAllMessages !== undefined) {
          entries['sec:logAllMessages'] = String(sec.logAllMessages);
          pendingEnforcement.push('sec:logAllMessages');
        }
        if (sec.rateLimitPerMinute !== undefined) {
          entries['sec:rateLimitPerMinute'] = String(sec.rateLimitPerMinute);
          pendingEnforcement.push('sec:rateLimitPerMinute');
        }
      }

      if (Object.keys(entries).length > 0) await writeConfigs(entries);
      return { saved: true, applied, requiresRestart, pendingEnforcement };
    })();
  });
}

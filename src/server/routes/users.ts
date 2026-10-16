import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../database/prisma.js';
import { userService } from '../../services/userService.js';
import { computeExpiry, resolveEffectiveTier, MAX_DURATION_DAYS } from '../../services/premiumExpiry.js';
import { parseBody, parseQuery } from '../validate.js';

const usersQuery = z.object({
  search: z.string().max(64).optional(),
  tier: z.enum(['free', 'premium', 'pro']).optional(),
  status: z.string().max(24).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['lastSeen', 'messageCount', 'firstSeen']).default('lastSeen'),
});

const userPatch = z
  .object({
    tier: z.enum(['free', 'premium', 'pro']).optional(),
    isBlocked: z.boolean().optional(),
    aiModeEnabled: z.boolean().optional(),
    status: z.string().max(24).optional(),
    /** Tanggal berakhir eksplisit (ISO 8601) atau null untuk menghapus. */
    premiumExpiry: z.union([z.string().datetime(), z.null()]).optional(),
    /** Cara praktis: N hari dari sekarang. null = tanpa expiry. */
    durationDays: z.number().int().min(1).max(MAX_DURATION_DAYS).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty_patch' })
  .refine((v) => !(v.premiumExpiry !== undefined && v.durationDays !== undefined), {
    message: 'conflicting_expiry_fields',
  });

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/users', (req, reply) => {
    const query = parseQuery(usersQuery, req, reply);
    if (!query) return;
    return (async () => {
      const where: Prisma.UserWhereInput = {};
      if (query.tier) where.tier = query.tier;
      if (query.status) where.status = query.status;
      if (query.search) {
        where.OR = [
          { userId: { contains: query.search, mode: 'insensitive' } },
          { pushName: { contains: query.search, mode: 'insensitive' } },
        ];
      }
      const [total, rows] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy: { [query.sort]: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return {
        items: rows.map((u) => ({
          userId: u.userId,
          pushName: u.pushName,
          sessionId: u.sessionId,
          tier: u.tier,
          // Tier sebenarnya sekarang — `tier` di DB bisa basi sampai lazy
          // downgrade menyentuh user ini.
          effectiveTier: resolveEffectiveTier(u),
          premiumExpiry: u.premiumExpiry ? u.premiumExpiry.toISOString() : null,
          status: u.status,
          isBlocked: u.isBlocked,
          aiModeEnabled: u.aiModeEnabled,
          messageCount: u.messageCount,
          firstSeen: u.firstSeen.toISOString(),
          lastSeen: u.lastSeen.toISOString(),
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    })();
  });

  app.patch('/api/users/:userId', (req, reply) => {
    const body = parseBody(userPatch, req.body, reply);
    if (!body) return;
    return (async () => {
      const { userId } = req.params as { userId: string };
      const existing = await prisma.user.findUnique({ where: { userId } });
      if (!existing) {
        await reply.code(404).send({ error: 'user_not_found' });
        return;
      }

      // `durationDays` adalah kenyamanan UI: ubah ke tanggal di sini supaya
      // hanya `premiumExpiry` yang sampai ke service.
      let premiumExpiry: Date | null | undefined;
      if (body.durationDays !== undefined) {
        premiumExpiry = body.durationDays === null ? null : computeExpiry(body.durationDays);
      } else if (body.premiumExpiry !== undefined) {
        premiumExpiry = body.premiumExpiry === null ? null : new Date(body.premiumExpiry);
      }

      const updated = await userService.updateUser(userId, {
        tier: body.tier,
        premiumExpiry,
        isBlocked: body.isBlocked,
        aiModeEnabled: body.aiModeEnabled,
        status: body.status,
      });
      if (!updated) {
        await reply.code(500).send({ error: 'update_failed' });
        return;
      }
      return {
        userId: updated.userId,
        pushName: updated.pushName,
        sessionId: updated.sessionId,
        tier: updated.tier,
        effectiveTier: resolveEffectiveTier(updated),
        premiumExpiry: updated.premiumExpiry ? updated.premiumExpiry.toISOString() : null,
        status: updated.status,
        isBlocked: updated.isBlocked,
        aiModeEnabled: updated.aiModeEnabled,
        messageCount: updated.messageCount,
        lastSeen: updated.lastSeen.toISOString(),
      };
    })();
  });
}

/** Summary for stat cards + filter pill counts (1 round-trip). */
export async function registerUserSummaryRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/users/summary', async () => {
    const soon = new Date(Date.now() + 7 * 86_400_000);
    const [total, active, byTier, aiMode, expiring7d] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'active' } }),
      prisma.user.groupBy({ by: ['tier'], _count: { _all: true } }),
      prisma.user.count({ where: { aiModeEnabled: true } }),
      // Premium yang masa aktifnya habis dalam 7 hari ke depan.
      prisma.user.count({
        where: { tier: { not: 'free' }, premiumExpiry: { not: null, lte: soon } },
      }),
    ]);
    const tiers: Record<string, number> = { free: 0, premium: 0, pro: 0 };
    for (const row of byTier) tiers[row.tier] = row._count._all;
    return { total, active, inactive: total - active, byTier: tiers, aiMode, expiring7d };
  });
}

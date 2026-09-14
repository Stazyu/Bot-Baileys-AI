import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

/**
 * Strict boolean query param. z.coerce.boolean() uses Boolean(value)
 * so "?success=false" reads as TRUE (non-empty strings are always truthy).
 */
export const stringBool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));
/** Parse the querystring with zod. null = 400 already sent. */
export function parseQuery<T>(schema: z.ZodType<T>, req: FastifyRequest, reply: FastifyReply): T | null {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    void reply.code(400).send({ error: 'invalid_query', issues: parsed.error.issues });
    return null;
  }
  return parsed.data;
}

/** Parse the JSON body with zod. null = 400 already sent. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    void reply.code(400).send({ error: 'invalid_body', issues: parsed.error.issues });
    return null;
  }
  return parsed.data;
}

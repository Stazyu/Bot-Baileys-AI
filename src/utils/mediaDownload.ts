import { downloadContentFromMessage, DEF_MEDIA_HOST, type MediaType } from '@stazyu/baileys';
import type { DownloadableMessage } from '@stazyu/baileys';
import { log } from './logger.js';

/**
 * Robust media download for WhatsApp CDN payloads.
 *
 * Why this exists: `downloadContentFromMessage` builds the download URL from
 * `directPath` + a host. When no host is threaded through it falls back to
 * `DEF_MEDIA_HOST` (mmg.whatsapp.net) — which resolves — but any `url` handed
 * to it is fetched verbatim. Recent payloads carry `https://a.whatsapp.net/...`,
 * a hostname WhatsApp does not publish in public DNS, so `fetch` dies with
 * `getaddrinfo ENOTFOUND a.whatsapp.net` before a single byte is transferred.
 *
 * This helper:
 *   1. Rewrites unusable hosts (a.whatsapp.net, web.whatsapp.net, …) to a
 *      reachable CDN host, preferring the per-socket `media_conn` hostname
 *      Baileys already negotiated (the authoritative one for this session).
 *   2. Falls back across known-good hosts (mmg → mmg-fallback).
 *   3. Retries transient network/DNS failures with backoff.
 */

/** Media kinds accepted by Baileys' downloader. */
export type MediaKind = Extract<MediaType, 'image' | 'video' | 'audio' | 'document' | 'sticker'>;

/**
 * Hostnames seen in WhatsApp payloads that are NOT resolvable in public DNS.
 * `a.whatsapp.net` is the common one (sticker/image payloads); `web.whatsapp.net`
 * shows up in older/gateway payloads.
 */
const UNRESOLVABLE_HOSTS = new Set([
  'a.whatsapp.net',
  'web.whatsapp.net',
  'media.whatsapp.net',
  'mmg-fna.whatsapp.net',
]);

/** Known-good CDN hosts, in fallback order. */
const FALLBACK_HOSTS = [DEF_MEDIA_HOST, 'mmg-fallback.whatsapp.net'];

/** Transient network error codes worth a retry (NOT 403/404 — those are terminal). */
const TRANSIENT_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
]);

const MAX_ATTEMPTS = Number(process.env.WA_MEDIA_DOWNLOAD_RETRIES) || 3;
const BASE_DELAY_MS = Number(process.env.WA_MEDIA_DOWNLOAD_BACKOFF_MS) || 250;

/** Explicit operator override, e.g. WA_MEDIA_HOST=mmg.whatsapp.net. */
function envMediaHost(): string | undefined {
  const host = process.env.WA_MEDIA_HOST?.trim();
  return host ? host.replace(/^https?:\/\//, '').replace(/\/+$/, '') : undefined;
}

/** True when the hostname is one WhatsApp serves but does not publish in DNS. */
export function isUnresolvableMediaHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return UNRESOLVABLE_HOSTS.has(host.toLowerCase());
}

/**
 * Ordered host candidates for a download: operator override → socket-negotiated
 * media_conn host → public CDN defaults. Deduplicated, never empty.
 */
export function mediaHostCandidates(socketMediaHost?: string | null): string[] {
  const candidates = [envMediaHost(), socketMediaHost, ...FALLBACK_HOSTS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const host of candidates) {
    if (!host) continue;
    const clean = host.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

/**
 * Resolve the effective fetch URL for a payload, rewriting hosts that cannot be
 * resolved (a.whatsapp.net) to a reachable one. Valid alternate hosts are kept.
 */
export function resolveMediaUrl(
  media: DownloadableMessage,
  host: string,
): string | undefined {
  const raw = media.url ?? undefined;
  if (!raw) {
    return media.directPath ? `https://${host}${media.directPath}` : undefined;
  }
  try {
    const parsed = new URL(raw);
    if (isUnresolvableMediaHost(parsed.hostname)) {
      parsed.hostname = host;
      return parsed.toString();
    }
    return raw;
  } catch {
    return raw;
  }
}

/** Walk an error chain (fetch wraps the real DNS/socket error in `cause`). */
function errorChain(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    const node = current as { code?: string; name?: string; message?: string; cause?: unknown };
    if (node.code) codes.push(String(node.code));
    if (node.name) codes.push(String(node.name));
    if (typeof node.message === 'string') codes.push(node.message);
    current = node.cause;
  }
  return codes;
}

/**
 * True for retryable failures: DNS hiccups, socket resets, timeouts.
 * HTTP 4xx (expired media → 403/404) is terminal — retrying will not help.
 */
export function isTransientMediaError(error: unknown): boolean {
  const status = (error as { output?: { statusCode?: number }; statusCode?: number })?.output?.statusCode
    ?? (error as { statusCode?: number })?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;

  for (const token of errorChain(error)) {
    for (const code of TRANSIENT_CODES) {
      if (token.includes(code)) return true;
    }
    if (token.includes('fetch failed')) return true;
    if (/socket hang up|network|timeout/i.test(token)) return true;
  }
  return false;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Best-effort read of a socket's negotiated media host. Returns undefined when
 * the socket has no `getMediaHost` (older Baileys) or the call throws.
 */
export function safeMediaHost(socket: { getMediaHost?: () => string } | null | undefined): string | undefined {
  try {
    return socket?.getMediaHost?.();
  } catch {
    return undefined;
  }
}

async function collectStream(stream: AsyncIterable<unknown>): Promise<Buffer> {
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk as Buffer]);
  }
  return buffer;
}

/**
 * Download media bytes, transparently fixing dead hosts and retrying transient
 * failures. Throws with a diagnostic message when every host/attempt fails.
 *
 * @param media         image/video/sticker/… proto payload
 * @param kind          Baileys media type for HKDF key derivation
 * @param socketMediaHost  optional `socket.getMediaHost()` — the negotiated CDN host
 */
export async function downloadMediaBuffer(
  media: DownloadableMessage,
  kind: MediaKind,
  socketMediaHost?: string | null,
): Promise<Buffer> {
  const hosts = mediaHostCandidates(socketMediaHost);
  let lastError: unknown;
  let attemptsRun = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Rotate hosts across attempts so a dead host is not retried forever.
    const host = hosts[(attempt - 1) % hosts.length];
    const url = resolveMediaUrl(media, host);
    attemptsRun = attempt;
    try {
      const stream = await downloadContentFromMessage({ ...media, url }, kind, { host });
      const buffer = await collectStream(stream as AsyncIterable<unknown>);
      if (!buffer || buffer.length === 0) {
        throw new Error('Downloaded media is empty');
      }
      if (attempt > 1) {
        log.info(`📥 [Media] Download succeeded on attempt ${attempt} via host ${host}`);
      }
      return buffer;
    } catch (error) {
      lastError = error;
      const transient = isTransientMediaError(error);
      log.warn(
        `⚠️ [Media] Download attempt ${attempt}/${MAX_ATTEMPTS} (${kind} via ${host}) failed` +
          `${transient ? ' — retrying' : ' — non-transient, giving up'}`,
        error as object,
      );
      // HTTP 4xx (expired media, bad signature) and other terminal failures
      // will not be fixed by retrying or by switching hosts.
      if (!transient) break;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 100));
      }
    }
  }

  const detail = errorChain(lastError).find((t) => t.length > 0) ?? 'unknown error';
  throw new Error(
    `Media download failed after ${attemptsRun} attempt(s) via [${hosts.join(', ')}]: ${detail}`,
  );
}

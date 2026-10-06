import type { proto } from '@stazyu/baileys';
import sharp from 'sharp';
import { downloadMediaBuffer, safeMediaHost } from './mediaDownload.js';
import {
  extractVisionImagePayload,
  extractVisionImageSource,
  type VisionImageSource,
} from './messageHelper.js';
import { log } from './logger.js';

/**
 * One image handed to a vision-capable model.
 *
 * Kept provider-agnostic on purpose: `aiService` turns this into an AI SDK
 * `file` content part (OpenAI-compatible) or an Ollama `images` entry.
 */
export interface VisionImage {
  /** IANA media type, e.g. `image/jpeg`. */
  mediaType: string;
  /** Normalized bytes ready for base64 encoding. */
  data: Uint8Array;
  /**
   * True when the payload came from a WhatsApp sticker.
   *
   * A sticker is not a question — it is the user expressing a mood/reaction, so
   * the prompt must tell the model to read it as an emotion, not as "what is
   * in this picture?".
   */
  isSticker?: boolean;
  /**
   * Origin of the payload.
   *
   * `own` = the user sent it; `quoted` = it is the message they replied to.
   * Stickers need this distinction: one the user sends is a mood, while one
   * they reply to is the SUBJECT of their question.
   */
  source?: VisionImageSource;
}

/** Reject absurd payloads before downloading — real WA images are far below this. */
const MAX_RAW_BYTES = 15 * 1024 * 1024;
/** Downscale so the base64 payload stays small enough for every provider. */
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 80;

/** Anything exposing `getMediaHost` (WASocket) is accepted. */
type MediaHostSource = { getMediaHost?: () => string } | null | undefined;

/** True when the message (or its quote) carries an image worth sending to the AI. */
export function hasVisionImage(
  content: proto.IMessage | null | undefined,
): boolean {
  return extractVisionImagePayload(content) !== null;
}

/**
 * Download + normalize the image attached to a message (or the one it quotes).
 *
 * Never throws: a failed download/decode logs a warning and returns null so the
 * caller can fall back to plain text handling.
 */
export async function extractVisionImage(
  content: proto.IMessage | null | undefined,
  socket?: MediaHostSource,
): Promise<VisionImage | null> {
  const resolved = extractVisionImageSource(content);
  if (!resolved) return null;
  const source = resolved.payload;

  // Undownloadable payload (no key/path) — nothing we can fetch.
  if (!source.mediaKey && !source.url && !source.directPath) {
    log.warn('⚠️ [Vision] Image payload has no mediaKey/url/directPath — skipping');
    return null;
  }

  const declared = Number(source.fileLength ?? 0);
  if (Number.isFinite(declared) && declared > MAX_RAW_BYTES) {
    log.warn(`⚠️ [Vision] Image too large (${declared} bytes) — skipping`);
    return null;
  }

  // Sticker ini `image/webp` walau bukan foto — dipakai buat nandain "ini ekspresi".
  const isSticker = (source.mimetype ?? '').includes('webp');
  const origin: VisionImageSource = resolved.source;

  try {
    const raw = await downloadMediaBuffer(source, 'image', safeMediaHost(socket));
    if (raw.length > MAX_RAW_BYTES) {
      log.warn(`⚠️ [Vision] Downloaded image too large (${raw.length} bytes) — skipping`);
      return null;
    }
    const image = await normalize(raw, source.mimetype);
    return { ...image, ...(isSticker ? { isSticker: true } : {}), source: origin };
  } catch (error) {
    log.warn(`⚠️ [Vision] Image load failed: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Recompress to a bounded JPEG (max 1280px, q80) so vision payloads stay small.
 * Falls back to the raw bytes when sharp cannot process the input.
 */
async function normalize(raw: Buffer, mimetype?: string | null): Promise<VisionImage> {
  try {
    const { data } = await sharp(raw)
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { mediaType: 'image/jpeg', data };
  } catch (error) {
    log.debug(`[Vision] Recompress skipped: ${(error as Error).message}`);
    return { mediaType: mimetype || 'image/jpeg', data: new Uint8Array(raw) };
  }
}

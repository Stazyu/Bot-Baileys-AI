import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InstagramScrapeResource {
  index: number;
  id: string;
  type: string;
  format: string;
  quality: string;
  size: number;
  downloadUrl: string;
  resourceContent: string;
  downloadMode: string;
}

export interface InstagramCarouselMediaResource {
  index: number;
  type: string;
  format: string;
  quality: string;
  downloadUrl: string;
  resourceContent: string;
}

export interface InstagramCarouselMedia {
  index: number;
  id: string;
  type: string;
  thumbnail: string;
  resources: InstagramCarouselMediaResource[];
}

export interface InstagramScrapeAuthor {
  uid: string;
  username: string;
  avatar: string;
}

export interface InstagramScrapeStats {
  likes: number;
  comments: number;
}

export interface InstagramScrapeResult {
  id: string;
  title: string;
  caption: string;
  thumbnail: string;
  duration: number;
  publishTimestamp: number | null;
  publishDate: string | null;
  stats: InstagramScrapeStats;
  author: InstagramScrapeAuthor;
  resources: InstagramScrapeResource[];
  carouselMedia: InstagramCarouselMedia[];
  /** Raw API response for forward compatibility */
  raw: Record<string, unknown>;
}

export interface DownloadTaskResult {
  downloadUrl: string;
  filesize: number;
  status: 'success';
}

export interface DownloadProgress {
  received: number;
  total: number;
  percent: number | null;
}

export interface ScrapeOptions {
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface DownloadOptions {
  /** Custom headers forwarded to the download request */
  headers?: Record<string, string>;
}

// ─── Config ─────────────────────────────────────────────────────────────────

export const CONFIG = {
  API_BASE_URL: 'https://api.savefromins.com/api/contentsite_api',
  SSE_BASE_URL: 'https://api.savefromins.com/sse/contentsite_api',
  AUTH_TOKEN: '20250901majwlqo',
  DOMAIN: 'api-ak.savefromins.com',
  ORIGIN_DOMAIN: 'savefromins.com',
  USER_AGENT:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  AES_KEYS: [
    'f8a1c2d4f8a1c2d4f8a1c2d4f8a1c2d4',
    'rz18efAXUbdiaO7k',
  ],
} as const;

// ─── AES Decryption ─────────────────────────────────────────────────────────

/**
 * Attempt to decrypt an AES-encrypted response from the SaveFromIns API.
 * Tries each configured key; returns the parsed JSON or raw string.
 */
export function decryptAES(encryptedBase64: string): unknown {
  if (!encryptedBase64 || typeof encryptedBase64 !== 'string') {
    return encryptedBase64;
  }

  const cleanBase64 = encryptedBase64.trim();
  let lastError: Error | null = null;

  for (const keyStr of CONFIG.AES_KEYS) {
    try {
      const key = Buffer.from(keyStr, 'utf8');
      const iv = Buffer.from(keyStr.slice(0, 16), 'utf8');
      const algorithm = key.length === 32 ? 'aes-256-cbc' : 'aes-128-cbc';

      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAutoPadding(false);

      let decrypted = decipher.update(cleanBase64, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      // oxlint-disable-next-line no-control-regex
      decrypted = decrypted.replace(/\0+$/, '');

      try {
        return JSON.parse(decrypted) as unknown;
      } catch {
        return decrypted;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `AES decryption failed: ${
      lastError ? lastError.message : 'Invalid key or ciphertext'
    }`,
  );
}

// ─── URL Normalisation ──────────────────────────────────────────────────────

/**
 * Validate and normalise an Instagram URL.
 * Accepts `instagram.com` and `instagr.am` (including subdomains).
 */
export function normalizeInstagramUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Please provide a valid Instagram URL');
  }

  let clean = rawUrl.trim();

  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }

  const isInstagram =
    /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\//i.test(
      clean,
    );

  if (!isInstagram) {
    throw new Error(
      'URL must be a valid Instagram link (e.g., https://www.instagram.com/reel/...)',
    );
  }

  return clean;
}

// ─── Scrape ─────────────────────────────────────────────────────────────────

/**
 * Scrape Instagram media metadata from a public post URL using the
 * SaveFromIns API.
 *
 * @param instagramUrl - Public Instagram post/reel/story URL
 * @param options - Optional headers and timeout
 * @returns Normalised scrape result with resources and carousel structure
 */
export async function scrapeInstagram(
  instagramUrl: string,
  options: ScrapeOptions = {},
): Promise<InstagramScrapeResult> {
  const targetUrl = normalizeInstagramUrl(instagramUrl);
  const endpoint = `${CONFIG.API_BASE_URL}/media/parse`;

  const payload = new URLSearchParams({
    auth: CONFIG.AUTH_TOKEN,
    domain: CONFIG.DOMAIN,
    origin: 'source',
    link: targetUrl,
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': CONFIG.USER_AGENT,
      'Origin': `https://${CONFIG.ORIGIN_DOMAIN}`,
      'Referer': `https://${CONFIG.ORIGIN_DOMAIN}/id`,
      'Accept': 'application/json, text/plain, */*',
      ...options.headers,
    },
    body: payload.toString(),
    signal: options.timeout
      ? AbortSignal.timeout(options.timeout)
      : undefined,
  });

  if (!response.ok) {
    throw new Error(
      `HTTP error from SaveFromIns API! Status: ${response.status} ${response.statusText}`,
    );
  }

  const rawJson = (await response.json()) as Record<string, unknown>;

  if (
    rawJson.status !== 1 &&
    rawJson.status_code === 'content_not_found'
  ) {
    throw new Error(
      'Media not found or account is private. Please ensure the Instagram link is publicly accessible.',
    );
  }

  if (rawJson.status !== 1 && !rawJson.data) {
    throw new Error(
      (rawJson.msg as string) || 'Failed to parse Instagram content.',
    );
  }

  let resultData = rawJson.data as Record<string, unknown> | string;

  if (typeof resultData === 'string') {
    const decrypted = decryptAES(resultData);
    resultData = (decrypted ?? {}) as Record<string, unknown>;
  }

  if (!resultData) {
    throw new Error('Empty or invalid data received from scraper.');
  }

  const result = resultData as Record<string, unknown>;
  const userItem = result.user_item as Record<string, unknown> | undefined;
  const resources = (result.resources as Array<Record<string, unknown>>) ?? [];
  const media = (result.media as Array<Record<string, unknown>>) ?? [];

  const formattedResult: InstagramScrapeResult = {
    id: (result.id as string) ?? '',
    title: (result.title as string) ?? '',
    caption: (result.title as string) ?? '',
    thumbnail: (result.thumbnail as string) ?? '',
    duration: (result.duration as number) ?? 0,
    publishTimestamp: (result.publish_ts as number) ?? null,
    publishDate: result.publish_ts
      ? new Date((result.publish_ts as number) * 1000).toISOString()
      : null,

    stats: {
      likes: (result.like_count as number) ?? 0,
      comments: (result.comment_count as number) ?? 0,
    },

    author: {
      uid: (userItem?.uid as string) ?? '',
      username: (userItem?.nickname as string) ?? '',
      avatar: (userItem?.avatar as string) ?? '',
    },

    resources: resources.map((res, index) => ({
      index: index + 1,
      id: (res.resource_id as string) ?? `res_${index}`,
      type: (res.type as string) ?? 'video',
      format: ((res.format as string) ?? 'mp4').toLowerCase(),
      quality: (res.quality as string) ?? 'HD',
      size: (res.size as number) ?? 0,
      downloadUrl: (res.download_url as string) ?? '',
      resourceContent: (res.resource_content as string) ?? '',
      downloadMode: (res.download_mode as string) ?? 'direct',
    })),

    carouselMedia: media.map((item, index) => {
      const itemResources =
        (item.resources as Array<Record<string, unknown>>) ?? [];
      return {
        index: index + 1,
        id: (item.media_id as string) ?? `media_${index}`,
        type: (item.type as string) ?? 'video',
        thumbnail: (item.thumbnail as string) ?? '',
        resources: itemResources.map((r, rIdx) => ({
          index: rIdx + 1,
          type: (r.type as string) ?? 'video',
          format: ((r.format as string) ?? 'mp4').toLowerCase(),
          quality: (r.quality as string) ?? 'HD',
          downloadUrl: (r.download_url as string) ?? '',
          resourceContent: (r.resource_content as string) ?? '',
        })),
      };
    }),

    raw: result,
  };

  return formattedResult;
}

// ─── Download Task Resolution ───────────────────────────────────────────────

/**
 * Resolve a download task from a `resourceContent` token returned by
 * `scrapeInstagram`.  Polls the API's SSE stream until a direct download link
 * is available.
 *
 * @param resourceContent - Token from a resource entry's `resourceContent`
 * @returns Object containing the final download URL and file size
 */
export async function resolveDownloadTask(
  resourceContent: string,
): Promise<DownloadTaskResult> {
  if (!resourceContent) {
    throw new Error('resourceContent is required to resolve download task');
  }

  const initPayload = new URLSearchParams({
    auth: CONFIG.AUTH_TOKEN,
    domain: CONFIG.DOMAIN,
    request: resourceContent,
  });

  const initRes = await fetch(
    `${CONFIG.API_BASE_URL}/media/download`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': CONFIG.USER_AGENT,
        'Origin': `https://${CONFIG.ORIGIN_DOMAIN}`,
        'Referer': `https://${CONFIG.ORIGIN_DOMAIN}/id`,
      },
      body: initPayload.toString(),
    },
  );

  const initJson = (await initRes.json()) as Record<string, unknown>;

  if (initJson.status !== 1 || !initJson.data) {
    throw new Error(
      (initJson.msg as string) ||
        'Failed to initialize download conversion task',
    );
  }

  const data = initJson.data as Record<string, unknown>;
  const taskId = data.task_id as string;

  if (!taskId) {
    throw new Error(
      'Failed to initialize download conversion task: no task_id in response',
    );
  }

  const sseUrl =
    `${CONFIG.SSE_BASE_URL}/media/download_query` +
    `?task_id=${encodeURIComponent(taskId)}` +
    `&download_domain=${CONFIG.ORIGIN_DOMAIN}` +
    `&origin=content_site`;

  const sseRes = await fetch(sseUrl, {
    headers: {
      'Accept': 'text/event-stream',
      'User-Agent': CONFIG.USER_AGENT,
      'Origin': `https://${CONFIG.ORIGIN_DOMAIN}`,
      'Referer': `https://${CONFIG.ORIGIN_DOMAIN}/id`,
    },
  });

  if (!sseRes.ok) {
    throw new Error(
      `SSE stream failed with status ${sseRes.status}`,
    );
  }

  const reader = sseRes.body!.getReader();
  const decoder = new TextDecoder();

  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) {
        continue;
      }

      try {
        const jsonStr = line.replace(/^data:\s*/, '').trim();

        if (!jsonStr) {
          continue;
        }

        const data = JSON.parse(jsonStr) as Record<string, unknown>;

        if (data.status === 'success' && data.download_link) {
          return {
            downloadUrl: data.download_link as string,
            filesize: (data.filesize as number) ?? 0,
            status: 'success',
          };
        }

        if (data.status === 'failed') {
          throw new Error(
            (data.msg as string) ||
              'Download conversion task failed on server',
          );
        }
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  throw new Error(
    'Download task stream ended without returning a valid link',
  );
}

// ─── Direct Media Download ──────────────────────────────────────────────────

/**
 * Download a media file from a URL to a local path, with optional progress
 * callback.
 *
 * @param fileUrl - Direct download URL from `resolveDownloadTask`
 * @param destinationPath - Local filesystem path to write the file
 * @param onProgress - Optional callback invoked with progress info
 * @returns The resolved absolute path of the downloaded file
 */
export async function downloadMedia(
  fileUrl: string,
  destinationPath: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<string> {
  if (!fileUrl) {
    throw new Error('fileUrl is required for download');
  }

  if (!destinationPath) {
    throw new Error('destinationPath is required for download');
  }

  const response = await fetch(fileUrl, {
    headers: {
      'User-Agent': CONFIG.USER_AGENT,
      'Referer': 'https://www.instagram.com/',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download media file: ${response.status} ${response.statusText}`,
    );
  }

  const totalBytes =
    Number(response.headers.get('content-length')) || 0;

  let receivedBytes = 0;

  const dir = path.dirname(destinationPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const fileStream = fs.createWriteStream(destinationPath);

  const reader = response.body!.getReader();

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    fileStream.write(Buffer.from(value));

    receivedBytes += value.length;

    if (typeof onProgress === 'function') {
      const percent =
        totalBytes > 0
          ? Math.round((receivedBytes / totalBytes) * 100)
          : null;

      onProgress({
        received: receivedBytes,
        total: totalBytes,
        percent,
      });
    }
  }

  fileStream.end();

  return new Promise<string>((resolve, reject) => {
    fileStream.on('finish', () => resolve(path.resolve(destinationPath)));
    fileStream.on('error', reject);
  });
}
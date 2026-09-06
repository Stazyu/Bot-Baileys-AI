import { spawn } from 'child_process';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  scrapeInstagram,
  resolveDownloadTask,
  type InstagramScrapeResult,
  type InstagramScrapeResource,
} from './instagram-savefromins.js';

// ─── Types ─────────────────────────────────────────────────────────────────

/** Response shape matching nexo-aio-downloader's InstagramResponse for drop-in compatibility */
export interface InstagramMediaData {
  url: string[];
  /** Local file path when a DASH video was downloaded & merged with ffmpeg */
  mergedFilePath?: string;
  caption: string | null;
  username: string | null;
  like: number | null;
  comment: number | null;
  isVideo: boolean;
  /** Video duration in seconds (undefined for image posts) */
  duration?: number;
}

export interface InstagramResult {
  status: boolean;
  data?: InstagramMediaData;
  message?: string;
}

// ─── Konfigurasi ────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_CHARS = 100_000;
const TEMP_DIR = join(process.cwd(), 'temp');

function getBinary(): string {
  return process.env.YTDLP_BIN?.trim() || 'yt-dlp';
}

function getTimeoutMs(): number {
  const configured = Number(process.env.YTDLP_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function appendLimited(current: string, chunk: Buffer): string {
  const next = current + chunk.toString();
  return next.length > MAX_OUTPUT_CHARS ? next.slice(-MAX_OUTPUT_CHARS) : next;
}

function ensureTempDir(): void {
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true });
  }
}

/**
 * Push cookie-related flags into `args` based on env vars.
 *
 * Supports two modes:
 * 1. INSTAGRAM_DL_COOKIES / YTDLP_COOKIES → path ke file cookies.txt (Netscape format)
 *    → `--cookies /path/to/cookies.txt`
 * 2. INSTAGRAM_DL_COOKIES_BROWSER → nama browser (chrome, firefox, edge, dll)
 *    → `--cookies-from-browser chrome`
 *
 * Prioritas: browser mode jika diset, lalu file mode.
 */
function pushCookieArgs(args: string[]): void {
  const browser = process.env.INSTAGRAM_DL_COOKIES_BROWSER?.trim();
  if (browser) {
    console.log(`[Instagram Utils] Using cookies-from-browser: ${browser}`);
    args.push('--cookies-from-browser', browser);
    return;
  }

  const cookiesPath =
    process.env.INSTAGRAM_DL_COOKIES?.trim() ||
    process.env.YTDLP_COOKIES?.trim();
  if (cookiesPath) {
    console.log(`[Instagram Utils] Using cookies file: ${cookiesPath} (exists: ${existsSync(cookiesPath)})`);
    args.push('--cookies', cookiesPath);
  } else {
    console.log('[Instagram Utils] No cookies configured — Instagram may block unauthenticated requests.');
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────

interface YtDlpFormat {
  url?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  format_id?: string;
  format_note?: string;
  width?: number;
  height?: number;
  tbr?: number;
  abr?: number;
  vbr?: number;
  resolution?: string;
}

interface YtDlpEntry {
  url?: string;
  ext?: string;
  title?: string;
  description?: string;
  uploader?: string;
  like_count?: number;
  comment_count?: number;
  duration?: number;
  webpage_url?: string;
  _type?: string;
  id?: string;
  formats?: YtDlpFormat[];
  requested_formats?: YtDlpFormat[];
  /** Carousel/image post children (may contain nested entries) */
  entries?: YtDlpEntry[];
  /** For carousel posts, yt-dlp sometimes uses `playlist` key (may be a string title, not array) */
  playlist?: YtDlpEntry[];
  /** Image posts: actual CDN image URLs live in thumbnails[] */
  thumbnails?: YtDlpFormat[];
}

function isVideo(entry: YtDlpEntry): boolean {
  if (entry.duration !== undefined && entry.duration > 0) return true;
  if (entry.ext) {
    const ext = entry.ext.toLowerCase();
    return ext === 'mp4' || ext === 'webm' || ext === 'mkv' || ext === 'mov';
  }
  return false;
}

/**
 * Check whether this entry (or any child in a carousel) is a DASH-streamed
 * video — has separate video-only and audio-only streams that need ffmpeg merging.
 */
function isDashVideo(entry: YtDlpEntry): boolean {
  const all = flattenEntries(entry);
  return all.some((e) => {
    const formats = Array.isArray(e.formats) ? e.formats : [];
    const hasVideoOnly = formats.some(
      (f) => f.vcodec && f.vcodec !== 'none' && (!f.acodec || f.acodec === 'none'),
    );
    const hasAudioOnly = formats.some(
      (f) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'),
    );
    return hasVideoOnly && hasAudioOnly;
  });
}

function extractCaption(entry: YtDlpEntry): string | null {
  if (entry.description && entry.description.trim().length > 0) {
    return entry.description.trim();
  }
  if (entry.title && entry.title.trim().length > 0) {
    return entry.title.trim();
  }
  return null;
}

/**
 * Flatten a playlist/carousel entry into its leaf (slide) entries.
 */
function flattenEntries(entry: YtDlpEntry): YtDlpEntry[] {
  if (Array.isArray(entry.entries) && entry.entries.length > 0) {
    return entry.entries;
  }
  if (Array.isArray(entry.playlist) && entry.playlist.length > 0) {
    return entry.playlist;
  }
  return [entry];
}

/**
 * Extract a single best media URL from an entry for non-DASH content.
 *
 * Priority:
 * 1. Top-level `url` (non-DASH single-file video or image)
 * 2. Largest thumbnail (Instagram image posts store CDN URLs here)
 *
 * DASH-streamed content is excluded here — it will be handled by downloadMergedVideo().
 */
function extractBestUrlFromEntry(entry: YtDlpEntry): string | null {
  // 1. Top-level direct URL — only for non-DASH (single file)
  if (entry.url && typeof entry.url === 'string' && entry.url.startsWith('http')) {
    return entry.url;
  }

  // 2. Thumbnails (image posts) — pick the highest-resolution
  if (Array.isArray(entry.thumbnails) && entry.thumbnails.length > 0) {
    const sorted = [...entry.thumbnails].sort((a, b) => {
      const areaA = (a.width ?? 0) * (a.height ?? 0);
      const areaB = (b.width ?? 0) * (b.height ?? 0);
      return areaB - areaA;
    });
    const best = sorted[0];
    if (best.url && typeof best.url === 'string' && best.url.startsWith('http')) {
      return best.url;
    }
  }

  return null;
}

/**
 * Run yt-dlp --dump-json via spawn and return parsed entries.
 */
function getInstagramJson(url: string): Promise<YtDlpEntry[]> {
  const args: string[] = [
    '--no-warnings',
    '--no-check-certificates',
    '--ignore-no-formats-error',
    '--dump-json',
  ];

  pushCookieArgs(args);
  args.push(url);

  return new Promise<YtDlpEntry[]>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(getBinary(), args, { windowsHide: true });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, getTimeoutMs());

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk);
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === 'ENOENT') {
        reject(
          new Error(
            'yt-dlp tidak ditemukan. Install dulu dengan "pip install yt-dlp" atau set YTDLP_BIN.',
          ),
        );
        return;
      }
      reject(new Error(`yt-dlp spawn gagal: ${error.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`yt-dlp timeout setelah ${getTimeoutMs() / 1000}s`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`yt-dlp exit code ${code}: ${stderr.slice(-500)}`));
        return;
      }
      try {
        const lines = stdout.trim().split('\n').filter(Boolean);
        if (lines.length === 0) {
          reject(new Error('yt-dlp tidak menghasilkan output'));
          return;
        }
        const parsed = lines.map((l) => JSON.parse(l) as YtDlpEntry);
        resolve(parsed);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        reject(new Error(`Gagal parse output yt-dlp: ${message}`));
      }
    });
  });
}

/**
 * Download and merge a DASH video using yt-dlp's built-in ffmpeg merge.
 * Returns the local file path of the merged mp4.
 */
function downloadMergedVideo(url: string, videoId: string): Promise<string> {
  ensureTempDir();

  const outputTemplate = join(TEMP_DIR, `ig_${videoId}.%(ext)s`);
  const expectedPath = join(TEMP_DIR, `ig_${videoId}.mp4`);

  const args: string[] = [
    '--no-warnings',
    '--no-check-certificates',
    '-f',
    // WhatsApp (especially Story) needs H.264 video + AAC audio in an MP4
    // container. HEVC/VP9/AV1 streams from Instagram DASH are rejected or
    // fail to process when re-uploaded as a Story.
    //  1. Prefer a single pre-merged H.264/AAC mp4 (av01/h264 filters applied)
    //  2. Fallback: bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best
    //  3. Last resort: whatever yt-dlp considers best
    'bestvideo[ext=mp4][vcodec^=avc1]+bestaudio[ext=m4a]/best[ext=mp4][vcodec^=avc1]/best',
    '--merge-output-format',
    'mp4',
    '-o',
    outputTemplate,
  ];

  pushCookieArgs(args);
  args.push(url);

  return new Promise<string>((resolve, reject) => {
    let stderr = '';
    let timedOut = false;

    const child = spawn(getBinary(), args, { windowsHide: true });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, getTimeoutMs());

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk);
    });

    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new Error(`yt-dlp download spawn gagal: ${error.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`yt-dlp download timeout setelah ${getTimeoutMs() / 1000}s`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`yt-dlp download exit code ${code}: ${stderr.slice(-500)}`));
        return;
      }
      if (existsSync(expectedPath)) {
        resolve(expectedPath);
      } else {
        reject(new Error('File hasil merge tidak ditemukan setelah download.'));
      }
    });
  });
}

function buildResult(entries: YtDlpEntry[]): {
  result: InstagramResult;
  needsMerge: boolean;
  mergeVideoId: string | null;
} {
  if (entries.length === 0) {
    return {
      result: { status: false, message: 'Tidak ada media ditemukan di URL Instagram tersebut.' },
      needsMerge: false,
      mergeVideoId: null,
    };
  }

  const first = entries[0];

  // Flatten playlist entries into individual slides
  const slides = entries.flatMap((e) => flattenEntries(e));
  const isVideoPost = slides.some((e) => isVideo(e)) || isDashVideo(first);
  const needsMerge = isDashVideo(first);

  if (needsMerge) {
    // DASH video: raw format URLs are separate video-only + audio-only streams.
    // They are unplayable on WhatsApp and would cause spam. The mergedFilePath
    // from downloadMergedVideo() is the single deliverable. Leave url[] sparse
    // so consumers know to check mergedFilePath.
    const duration = slides[0]?.duration && slides[0].duration > 0 ? slides[0].duration : undefined;
    return {
      result: {
        status: true,
        data: {
          url: [], // empty — use mergedFilePath instead
          caption: extractCaption(first),
          username: first.uploader ?? null,
          like: typeof first.like_count === 'number' ? first.like_count : null,
          comment: typeof first.comment_count === 'number' ? first.comment_count : null,
          isVideo: true,
          duration,
        },
      },
      needsMerge: true,
      mergeVideoId: first.id || first.webpage_url?.split('/').pop()?.split('?')[0] || null,
    };
  }

  // Non-DASH: pick one best URL per slide
  const urls: string[] = [];
  for (const slide of slides) {
    const best = extractBestUrlFromEntry(slide);
    if (best) urls.push(best);
  }

  if (urls.length === 0) {
    console.error(
      '[Instagram Utils] No direct media URLs extracted. Raw entry keys:',
      first ? Object.keys(first) : 'null',
      `_type: ${first?._type || 'none'}`,
      `formats isArray:${Array.isArray((first as any)?.formats)} len:${(first as any)?.formats?.length ?? 'N/A'}`,
      `thumbnails isArray:${Array.isArray((first as any)?.thumbnails)} len:${(first as any)?.thumbnails?.length ?? 'N/A'}`,
      `slides count: ${slides.length}`,
      first ? JSON.stringify(first).slice(0, 500) : '',
    );
    return {
      result: {
        status: false,
        message: 'Gagal mengekstrak URL media dari Instagram. Post mungkin privat atau tidak ditemukan.',
      },
      needsMerge: false,
      mergeVideoId: null,
    };
  }

  const duration =
    isVideoPost && typeof first.duration === 'number' && first.duration > 0
      ? first.duration
      : undefined;

  return {
    result: {
      status: true,
      data: {
        url: urls,
        caption: extractCaption(first),
        username: first.uploader ?? null,
        like: typeof first.like_count === 'number' ? first.like_count : null,
        comment: typeof first.comment_count === 'number' ? first.comment_count : null,
        isVideo: isVideoPost,
        duration,
      },
    },
    needsMerge: false,
    mergeVideoId: null,
  };
}

// ─── SaveFromIns (primary path) ─────────────────────────────────────────────

const SAVEFROMINS_TIMEOUT_MS = 45_000;

/**
 * Resolve a playable URL for one SaveFromIns resource.
 * Uses `downloadUrl` directly when present, otherwise converts the
 * `resourceContent` token into a real link via the download-task SSE flow.
 */
async function resolveResourceUrl(
  res: Pick<InstagramScrapeResource, 'downloadUrl' | 'resourceContent'>,
): Promise<string | null> {
  if (res.downloadUrl && res.downloadUrl.startsWith('http')) {
    return res.downloadUrl;
  }
  if (!res.resourceContent) {
    return null;
  }
  const task = await resolveDownloadTask(res.resourceContent);
  return task.downloadUrl && task.downloadUrl.startsWith('http')
    ? task.downloadUrl
    : null;
}

/**
 * Score a resource for "best quality" selection: file size first, then any
 * numeric resolution hint in `quality` ("1080p", "720"), then HD > SD.
 */
function resourceScore(res: { size?: number; quality?: string }): number {
  const size = typeof res.size === 'number' ? res.size : 0;
  const numeric = Number((res.quality ?? '').match(/\d+/)?.[0] ?? 0);
  const tier = /hd|high|full/i.test(res.quality ?? '') ? 1000 : 0;
  return size * 1e-6 + numeric + tier;
}

/**
 * Convert a SaveFromIns scrape result into the shared InstagramResult shape.
 *
 * The API returns multiple quality variants per media item, so each item
 * (top-level resource id, or carousel slide) contributes exactly one URL —
 * the best-scoring one. Throws when nothing resolves.
 */
async function buildResultFromScrape(
  scrape: InstagramScrapeResult,
): Promise<InstagramResult> {
  type Candidate = {
    downloadUrl: string;
    resourceContent: string;
    type: string;
    format: string;
    quality: string;
    size?: number;
  };

  // Group variants: carousel → one group per slide; single post → group by resource id.
  const groups: Candidate[][] = [];
  if (scrape.carouselMedia.length > 0) {
    for (const m of scrape.carouselMedia) groups.push(m.resources as Candidate[]);
  } else {
    const byId = new Map<string, Candidate[]>();
    for (const r of scrape.resources) {
      const bucket = byId.get(r.id);
      if (bucket) bucket.push(r);
      else byId.set(r.id, [r]);
    }
    groups.push(...byId.values());
  }

  const urls: string[] = [];
  let hasVideo = false;

  for (const group of groups) {
    if (group.length === 0) continue;
    const best = group.reduce((a, b) => (resourceScore(b) > resourceScore(a) ? b : a));
    const isVideoRes =
      best.type.toLowerCase().includes('video') || best.format.toLowerCase() === 'mp4';

    try {
      const resolved = await resolveResourceUrl(best);
      if (resolved) {
        urls.push(resolved);
        if (isVideoRes) hasVideo = true;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[Instagram Utils/SaveFromIns] Resource resolve failed:', msg);
    }
  }

  if (urls.length === 0) {
    throw new Error('Tidak ada URL media yang berhasil diresolve');
  }

  const isVideo = hasVideo || scrape.duration > 0;

  return {
    status: true,
    data: {
      url: urls,
      caption: scrape.caption?.trim() ? scrape.caption.trim() : null,
      username: scrape.author?.username ?? null,
      like: scrape.stats?.likes ?? null,
      comment: scrape.stats?.comments ?? null,
      isVideo,
      duration: isVideo && scrape.duration > 0 ? scrape.duration : undefined,
    },
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Extract media info from an Instagram URL.
 *
 * Primary path: SaveFromIns API (`instagram-savefromins.ts`) — fast, direct
 * download URLs, no ffmpeg merge needed. On any failure (network, private
 * post, API change) it falls back to yt-dlp --dump-json, which additionally
 * downloads & merges DASH videos via ffmpeg into `data.mergedFilePath`.
 *
 * @param url - Instagram post, Reel, or carousel URL
 * @returns InstagramResult with status, data, and optional message
 */
export default async function instagramDownload(url: string): Promise<InstagramResult> {
  // 1. Primary: SaveFromIns
  try {
    const scrape = await scrapeInstagram(url, { timeout: SAVEFROMINS_TIMEOUT_MS });
    return await buildResultFromScrape(scrape);
  } catch (sfErr: unknown) {
    const msg = sfErr instanceof Error ? sfErr.message : String(sfErr);
    console.warn('[Instagram Utils] SaveFromIns failed, falling back to yt-dlp:', msg);
  }

  // 2. Fallback: yt-dlp
  try {
    const entries = await getInstagramJson(url);
    const { result, needsMerge, mergeVideoId } = buildResult(entries);

    if (needsMerge && mergeVideoId && result.data) {
      try {
        const mergedPath = await downloadMergedVideo(url, mergeVideoId);
        result.data.mergedFilePath = mergedPath;
      } catch (mergeErr: unknown) {
        const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
        console.error('[Instagram Utils] Merge download failed, will fallback to raw URLs:', msg);
      }
    }

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Instagram Utils] Download error:', message);
    return {
      status: false,
      message: `Gagal mendownload dari Instagram: ${message}`,
    };
  }
}


/**
 * Clean up a temporary merged video file after it has been sent.
 * Call this after the file has been successfully delivered to WhatsApp.
 */
export function cleanupMergedFile(filePath: string): void {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Best-effort cleanup, ignore errors
  }
}

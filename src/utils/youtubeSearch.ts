/**
 * Song/video lookup by name: search YouTube for several candidates and pick
 * the one that actually matches the user's words.
 *
 * Asking yt-dlp for a single result (`ytsearch1`) downloads whatever YouTube
 * ranked first — a cover, a 60-minute compilation, or an unrelated song whose
 * title happens to contain one of the words ("Reagge Terlena" → "Regedut
 * Terlena"). This module fetches a candidate list, scores each entry against
 * the query (typo tolerant) and reports how confident that match is.
 */

/** One entry of a `ytsearch` result list. */
export interface YoutubeSearchCandidate {
  id: string;
  title: string;
  uploader: string;
  /** Seconds; 0 when yt-dlp did not report it. */
  duration: number;
  viewCount: number;
  url: string;
}

/** Candidate plus its match score against the query. */
export interface RankedCandidate extends YoutubeSearchCandidate {
  /** 1-based position in YouTube's relevance order. */
  rank: number;
  /** Share of the query's meaningful words found in this candidate (0..1). */
  coverage: number;
  /** Coverage minus flavour penalties plus a small relevance-order prior. */
  score: number;
  /** Query words matched exactly (not just fuzzily). */
  exactMatches: number;
  /** Why this candidate was penalized, e.g. `["cover", "compilation"]`. */
  penalties: string[];
}

export type MatchConfidence = 'high' | 'medium' | 'none';

export interface YoutubeMatchResult {
  best: RankedCandidate | null;
  /** Runners-up, best first — use when asking the user which one they meant. */
  alternates: RankedCandidate[];
  confidence: MatchConfidence;
}

/**
 * Minimal yt-dlp runner shape. youtube-dl-exec's own `Flags`/`Payload` types
 * describe a single extracted video and reject raw yt-dlp flags such as
 * `dumpSingleJson`/`flatPlaylist`, so call sites cast their instance to this.
 */
export type YoutubeDlRunner = (
  input: string,
  flags?: Record<string, unknown>,
  options?: Record<string, unknown>,
) => Promise<unknown>;

/** How many search results are fetched and ranked. */
export const SEARCH_CANDIDATE_LIMIT = 8;

/**
 * Cost of a result whose flavour the user did not ask for. Each rule is
 * skipped when the query itself asks for that flavour ("cover reggae").
 */
const FLAVOUR_RULES: Array<{ label: string; pattern: RegExp; penalty: number }> = [
  { label: 'karaoke/instrumental', pattern: /\bkaraoke\b|\binstrumental\b|minus one|backing track/i, penalty: 0.4 },
  { label: 'reaction', pattern: /\breaction\b/i, penalty: 0.5 },
  { label: 'cover', pattern: /\bcovers?\b/i, penalty: 0.25 },
  { label: 'remix/dj', pattern: /\bremix\b|\bdj\b|mashup|slowed|sped up|nightcore|jedag jedug/i, penalty: 0.25 },
  { label: 'live', pattern: /\blive\b|\bkonser\b|\bconcert\b/i, penalty: 0.15 },
  { label: 'loop/extended', pattern: /1 hour|10 hours?|\bloop\b|\brepeat\b|extended/i, penalty: 0.35 },
  { label: 'compilation', pattern: /kumpulan|full album|compilation|playlist|non-?stop|\bmix\b|terbaru|tiktok|viral|top hits|greatest hits/i, penalty: 0.3 },
  { label: 'lyrics-only', pattern: /\blyrics?\b|\blirik\b/i, penalty: 0.05 },
];

/** Flavour the user asked for — long/short form in these cases is intentional. */
const LONG_FORM_INTENT = /kumpulan|album|full|mix|non-?stop|1 hour|compilation|playlist|\bloop\b|podcast/i;
const SHORT_FORM_INTENT = /shorts?\b|tiktok|reels?\b|potongan/i;

/** Penalty applied to a result that is far outside normal song length. */
const LONG_VIDEO_SECONDS = 20 * 60;
const SHORT_VIDEO_SECONDS = 45;

/** Words that only carry the request itself, never matchable content. */
const IGNORED_QUERY_WORDS: Record<string, true> = {
  cari: true, cariin: true, carikan: true, carikanlah: true, tolong: true,
  dong: true, please: true, mohon: true, lagu: true, lagunya: true, lagu2: true,
  musik: true, music: true, song: true, songs: true, putar: true,
  mainkan: true, dengerin: true, dengarkan: true, sama: true, itu: true,
  ini: true, yang: true, yg: true, aja: true, ajah: true, deh: true,
  kak: true, bro: true, bang: true, min: true, boleh: true, bisa: true,
  versi: true, version: true, nya: true,
};

/** Minimum score for a result to be considered the intended one. */
const HIGH_CONFIDENCE_SCORE = 0.65;
/** Below this a result only counts as a match when a query word matched exactly. */
const MEDIUM_CONFIDENCE_SCORE = 0.35;

const normalizeWord = (word: string): string =>
  word.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Levenshtein distance, iterative with two rows (words here are short). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = [...current];
  }

  return previous[b.length];
}

/** Typo budget per word length: 0 for short words, up to 3 for long ones. */
const allowedEdits = (length: number): number => (length <= 4 ? 0 : length <= 7 ? 2 : 3);

/**
 * Similarity of two words: 1 exact, 0.8 for a tolerated typo (same first
 * letter, within the edit budget), 0 otherwise. "reagge" ≈ "reggae".
 */
export function wordSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 3 || b.length < 3) return 0;
  if (a[0] !== b[0]) return 0;

  const distance = levenshtein(a, b);
  if (distance === 0) return 1;
  if (distance > allowedEdits(Math.min(a.length, b.length))) return 0;
  return 0.8;
}

/** Meaningful query words (request wording stripped, typos preserved). */
export function queryWords(query: string): string[] {
  return query
    .split(/[^\p{L}\p{N}]+/u)
    .map(normalizeWord)
    .filter((word) => word.length > 0 && IGNORED_QUERY_WORDS[word] !== true);
}

const candidateWords = (candidate: YoutubeSearchCandidate): string[] =>
  [...new Set(`${candidate.title} ${candidate.uploader}`.split(/[^\p{L}\p{N}]+/u).map(normalizeWord).filter(Boolean))];

/** Flavour penalties for a result the user did not ask for. */
function flavourPenalties(query: string, candidate: YoutubeSearchCandidate): Array<{ label: string; penalty: number }> {
  const haystack = `${candidate.title} ${candidate.uploader}`;
  const applied: Array<{ label: string; penalty: number }> = [];

  for (const rule of FLAVOUR_RULES) {
    if (!rule.pattern.test(haystack)) continue;
    // The user asked for this flavour — it is the point, not a defect.
    if (rule.pattern.test(query)) continue;
    applied.push({ label: rule.label, penalty: rule.penalty });
  }

  if (candidate.duration > LONG_VIDEO_SECONDS && !LONG_FORM_INTENT.test(query)) {
    applied.push({ label: 'too-long', penalty: 0.2 });
  } else if (candidate.duration > 0 && candidate.duration < SHORT_VIDEO_SECONDS && !SHORT_FORM_INTENT.test(query)) {
    applied.push({ label: 'too-short', penalty: 0.3 });
  }

  return applied;
}

/** Score one candidate against the query. `rank` is 1-based relevance order. */
export function scoreCandidate(
  query: string,
  candidate: YoutubeSearchCandidate,
  rank: number,
  totalCandidates: number,
): RankedCandidate {
  const words = queryWords(query);
  const haystack = candidateWords(candidate);

  let matched = 0;
  let exactMatches = 0;
  for (const word of words) {
    let best = 0;
    for (const candidateWord of haystack) {
      const similarity = wordSimilarity(word, candidateWord);
      if (similarity > best) best = similarity;
    }
    if (best === 1) exactMatches++;
    matched += best;
  }

  const coverage = words.length > 0 ? matched / words.length : 0;
  const penalties = flavourPenalties(query, candidate);
  const penaltySum = penalties.reduce((sum, rule) => sum + rule.penalty, 0);
  // YouTube already ranks by relevance: keep a small prior so equally-scored
  // results stay in the order the user would have seen them.
  const positionBonus = 0.05 * (1 - (rank - 1) / Math.max(1, totalCandidates));

  return {
    ...candidate,
    rank,
    coverage,
    exactMatches,
    penalties: penalties.map((rule) => rule.label),
    score: Math.max(0, coverage - penaltySum) + positionBonus,
  };
}

/**
 * Rank every candidate and report how confident the top one is.
 * `best` is null when the search returned nothing usable.
 */
export function pickBestYoutubeMatch(
  query: string,
  candidates: YoutubeSearchCandidate[],
): YoutubeMatchResult {
  const ranked = candidates
    .map((candidate, index) => scoreCandidate(query, candidate, index + 1, candidates.length))
    .sort((a, b) => b.score - a.score || a.rank - b.rank);

  const best = ranked[0] ?? null;
  if (!best) return { best: null, alternates: [], confidence: 'none' };

  const confidence: MatchConfidence =
    best.score >= HIGH_CONFIDENCE_SCORE
      ? 'high'
      : best.score >= MEDIUM_CONFIDENCE_SCORE || best.exactMatches > 0
        ? 'medium'
        : 'none';

  return { best, alternates: ranked.slice(1, 5), confidence };
}

interface FlatSearchEntry {
  id?: unknown;
  title?: unknown;
  uploader?: unknown;
  channel?: unknown;
  duration?: unknown;
  view_count?: unknown;
  url?: unknown;
}

const toCandidate = (entry: FlatSearchEntry): YoutubeSearchCandidate | null => {
  const id = typeof entry.id === 'string' ? entry.id : '';
  const title = typeof entry.title === 'string' ? entry.title : '';
  if (!id || !title) return null;

  const uploader = typeof entry.uploader === 'string' && entry.uploader
    ? entry.uploader
    : typeof entry.channel === 'string' && entry.channel
      ? entry.channel
      : 'Unknown';

  return {
    id,
    title,
    uploader,
    duration: typeof entry.duration === 'number' ? entry.duration : 0,
    viewCount: typeof entry.view_count === 'number' ? entry.view_count : 0,
    url: typeof entry.url === 'string' && entry.url
      ? entry.url
      : `https://www.youtube.com/watch?v=${id}`,
  };
};

/**
 * Fetch search candidates for a plain-text query. Uses `--dump-single-json
 * --flat-playlist`, which returns every entry in one JSON document without
 * extracting each video (and resolves to raw text, not JSON, for `--print`).
 */
export async function searchYoutubeCandidates(
  youtubeDl: YoutubeDlRunner,
  query: string,
  tempDir: string,
  limit: number = SEARCH_CANDIDATE_LIMIT,
): Promise<YoutubeSearchCandidate[]> {
  const output = await youtubeDl(`ytsearch${limit}:${query}`, {
    noWarnings: true,
    noCheckCertificates: true,
    preferFreeFormats: true,
    dumpSingleJson: true,
    flatPlaylist: true,
    simulate: true,
    skipDownload: true,
  }, { cwd: tempDir }) as { entries?: FlatSearchEntry[] };

  const entries = Array.isArray(output?.entries) ? output.entries : [];
  return entries
    .map(toCandidate)
    .filter((candidate): candidate is YoutubeSearchCandidate => candidate !== null);
}

/** Short one-line description used in tool messages and logs. */
export const describeCandidate = (candidate: RankedCandidate): string =>
  `#${candidate.rank} "${candidate.title}" — ${candidate.uploader}`;

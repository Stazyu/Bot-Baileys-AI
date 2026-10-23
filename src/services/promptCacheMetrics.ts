/**
 * ──────────────────────────────────────────────
 *  PROMPT CACHE METRICS
 * ──────────────────────────────────────────────
 *
 * Why this exists: prompt caching is invisible without instrumentation. The
 * AI SDK already surfaces the provider's `prompt_tokens_details.cached_tokens`
 * as `usage.inputTokenDetails.cacheReadTokens`, but nothing read it — so a
 * regression (e.g. a timestamp sneaking back to the top of the system prompt)
 * would silently double the token bill with no signal.
 *
 * Definitions follow the providers:
 *   cacheReadTokens  → input tokens served from cache (cheap)
 *   noCacheTokens    → input tokens billed at full price
 *   inputTokens      → total input (read + no-cache)
 *
 * hit-rate = cacheReadTokens / inputTokens
 *
 * Reporting notes:
 * - The FIRST request of any session is always a miss (cache write). A
 *   `cacheReadTokens === 0` sample on a cold conversation is expected, not a bug.
 * - Provider gateways may alias the underlying model (e.g. a combo/fallback
 *   route), so `servedBy` is logged when known to explain hit-rate swings.
 */

/** Raw usage counters as reported by one model step. */
export interface CacheUsageSample {
  inputTokens?: number | null;
  cacheReadTokens?: number | null;
  noCacheTokens?: number | null;
  outputTokens?: number | null;
}

/** One aggregated per-turn cache measurement. */
export interface CacheMetric {
  /** Number of model steps that contributed (a tool loop makes several). */
  steps: number;
  inputTokens: number;
  cacheReadTokens: number;
  noCacheTokens: number;
  outputTokens: number;
  /** cacheReadTokens / inputTokens, 0..1. Zero when no input was reported. */
  hitRate: number;
  /** Provider-reported model that served the step, when available. */
  servedBy?: string;
}

const toInt = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;

/**
 * Combine several per-step usage samples into one turn-level metric.
 *
 * A tool-calling turn is several model steps; summing them is the honest
 * measure of what the turn cost. `hitRate` is a weighted ratio (not an
 * average of ratios) so a single huge cached step isn't outvoted by small ones.
 */
export function buildCacheMetric(
  samples: CacheUsageSample[],
  servedBy?: string,
): CacheMetric {
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let noCacheTokens = 0;
  let outputTokens = 0;

  for (const sample of samples) {
    const input = toInt(sample.inputTokens);
    // `noCacheTokens` is optional: derive it when the provider omits it.
    const read = toInt(sample.cacheReadTokens);
    const noCache = toInt(sample.noCacheTokens) || Math.max(0, input - read);

    inputTokens += input;
    cacheReadTokens += read;
    noCacheTokens += noCache;
    outputTokens += toInt(sample.outputTokens);
  }

  return {
    steps: samples.length,
    inputTokens,
    cacheReadTokens,
    noCacheTokens,
    outputTokens,
    hitRate: inputTokens > 0 ? cacheReadTokens / inputTokens : 0,
    servedBy,
  };
}

/** Running totals so a hit-rate can be read without parsing every log line. */
export class CacheRateTracker {
  private turns = 0;
  private inputTokens = 0;
  private cacheReadTokens = 0;

  record(metric: CacheMetric): void {
    if (metric.inputTokens <= 0) return;
    this.turns += 1;
    this.inputTokens += metric.inputTokens;
    this.cacheReadTokens += metric.cacheReadTokens;
  }

  /** Aggregate hit-rate across all recorded turns (0..1). */
  get hitRate(): number {
    return this.inputTokens > 0 ? this.cacheReadTokens / this.inputTokens : 0;
  }

  get stats(): {
    turns: number;
    inputTokens: number;
    cacheReadTokens: number;
    hitRate: number;
  } {
    return {
      turns: this.turns,
      inputTokens: this.inputTokens,
      cacheReadTokens: this.cacheReadTokens,
      hitRate: this.hitRate,
    };
  }

  reset(): void {
    this.turns = 0;
    this.inputTokens = 0;
    this.cacheReadTokens = 0;
  }
}

/** `0.8234` → `82%`; keeps log lines short. */
export function formatHitRate(metric: Pick<CacheMetric, 'hitRate'>): string {
  return `${Math.round(metric.hitRate * 100)}%`;
}

/**
 * One-line, greppable log summary. Grep for `[PromptCache]` in production logs
 * to audit cache efficiency per turn, and compare with the aggregate line to
 * see whether a change helped.
 */
export function summarizeCacheMetric(metric: CacheMetric, sessionId: string): string {
  const parts = [
    `hit=${formatHitRate(metric)}`,
    `cached=${metric.cacheReadTokens}/${metric.inputTokens} tok`,
    `out=${metric.outputTokens} tok`,
    `steps=${metric.steps}`,
  ];
  if (metric.servedBy) parts.push(`via=${metric.servedBy}`);
  return `[PromptCache] ${sessionId} ${parts.join(' ')}`;
}

export const promptCacheTracker = new CacheRateTracker();

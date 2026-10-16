/**
 * ──────────────────────────────────────────────
 *  PREMIUM EXPIRY — logika murni (tanpa I/O)
 * ──────────────────────────────────────────────
 *
 * Dipakai bersama oleh:
 *   - userService (lazy downgrade saat user dibaca)
 *   - command !premium set|expiry|expiring (parse durasi)
 *   - API dashboard POST/PATCH /api/users (validasi durasi)
 *   - groupTierService (lewat userService.getUser yang sudah ter-downgrade)
 *
 * Prinsip: satu sumber kebenaran untuk "kapan premium habis" dan "berapa
 * tier efektif sekarang". Semua fungsi di sini deterministik — `now` selalu
 * bisa di-inject supaya bisa diuji tanpa mengubah jam sistem.
 */

/** Tier yang boleh punya masa aktif. */
export const PAID_TIERS = new Set(['premium', 'pro']);

export type TierName = 'free' | 'premium' | 'pro';

export function isTierName(value: string): value is TierName {
  return value === 'free' || value === 'premium' || value === 'pro';
}

/** premium < pro. Tier tak dikenal → free. */
export function tierRank(tier: string): number {
  return tier === 'pro' ? 2 : tier === 'premium' ? 1 : 0;
}

/** Normalisasi tier apa adanya dari DB/input menjadi salah satu dari 3 tier. */
export function normaliseTier(tier: string | null | undefined): TierName {
  return tier === 'pro' || tier === 'premium' ? tier : 'free';
}

/** Apakah `expiry` sudah lewat (atau sama dengan) `now`. */
export function isExpired(expiry: Date | null | undefined, now: Date = new Date()): boolean {
  return Boolean(expiry && expiry.getTime() <= now.getTime());
}

/**
 * Tier EFEKTIF sekarang. Tier tersimpan bisa basi (expiry lewat tapi field
 * `tier` belum diturunkan) — fungsi ini yang memutuskan tier sebenarnya.
 */
export function resolveEffectiveTier(
  user: { tier?: string | null; premiumExpiry?: Date | null },
  now: Date = new Date(),
): TierName {
  const tier = normaliseTier(user.tier);
  if (tier === 'free') return 'free';
  return isExpired(user.premiumExpiry ?? null, now) ? 'free' : tier;
}

/** Sisa hari masa aktif (0 kalau sudah lewat/tidak ada). Dibulatkan ke atas. */
export function daysRemaining(expiry: Date | null | undefined, now: Date = new Date()): number {
  if (!expiry) return 0;
  const ms = expiry.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/** Hitung tanggal berakhir dari `days` hari sejak `base`. */
export function computeExpiry(days: number, base: Date = new Date()): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

export interface DurationOption {
  /** Label untuk pesan bantuan, mis. `30d`. */
  label: string;
  /** null = tanpa expiry (selamanya). */
  days: number | null;
}

/**
 * Satuan durasi yang diterima. `m` = 30 hari (bukan bulan kalender) supaya
 * nilainya deterministik dan tidak bergantung zona waktu.
 */
const DURATION_UNITS: Record<string, { days: number; label: string }> = {
  d: { days: 1, label: 'hari' },
  w: { days: 7, label: 'minggu' },
  m: { days: 30, label: 'bulan' },
  y: { days: 365, label: 'tahun' },
};

/** Kata kunci yang berarti "tanpa masa aktif". */
const FOREVER_WORDS = new Set(['off', 'none', 'forever', 'lifetime', 'selamanya', '-']);

/** Batas wajar: 10 tahun — mencegah salah ketik (mis. `999999`). */
export const MAX_DURATION_DAYS = 3650;

export interface ParsedDuration {
  ok: boolean;
  /** null = tanpa expiry. undefined tidak pernah dikembalikan (lihat `ok`). */
  days: number | null;
  /** Pesan siap pakai kalau `ok` = false. */
  error?: string;
}

/**
 * Parse durasi premium dari teks user.
 *
 * Contoh: `30` → 30 hari, `2w` → 14 hari, `1m` → 30, `1y` → 365,
 * `off` → tanpa expiry. Angka tanpa satuan dianggap hari.
 */
export function parseDuration(raw: string | undefined | null): ParsedDuration {
  const text = (raw ?? '').trim().toLowerCase();
  if (!text) return { ok: false, days: null, error: 'durasi_kosong' };
  if (FOREVER_WORDS.has(text)) return { ok: true, days: null };

  const match = /^(\d+(?:\.\d+)?)\s*([dwmy]?)$/.exec(text);
  if (!match) return { ok: false, days: null, error: 'format_tidak_valid' };

  const amount = Number(match[1]);
  const unit = match[2] || 'd';
  const multiplier = DURATION_UNITS[unit]?.days;
  if (!multiplier) return { ok: false, days: null, error: 'satuan_tidak_dikenal' };

  const days = Math.round(amount * multiplier);
  if (!Number.isFinite(days) || days < 1) return { ok: false, days: null, error: 'durasi_terlalu_kecil' };
  if (days > MAX_DURATION_DAYS) return { ok: false, days: null, error: 'durasi_terlalu_besar' };
  return { ok: true, days };
}

/** Ringkasan masa aktif untuk pesan/log — 'tanpa expiry' kalau null. */
export function describeExpiry(expiry: Date | null | undefined, now: Date = new Date()): string {
  if (!expiry) return 'tanpa expiry';
  if (isExpired(expiry, now)) return `SUDAH EXPIRED (${expiry.toLocaleDateString('id-ID')})`;
  const days = daysRemaining(expiry, now);
  return `${expiry.toLocaleDateString('id-ID')} (±${days} hari lagi)`;
}

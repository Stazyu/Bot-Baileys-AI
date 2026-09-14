/** Base URL Dashboard API. Samedev default ke backend lokal :3001. */
export const API_BASE: string = (import.meta.env.VITE_API_URL ?? '').trim() || 'http://127.0.0.1:3001';

const TOKEN_KEY = 'dashboard.token';

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage tidak tersedia (private mode) — API tetap jalan tanpa token tersimpan.
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
function errorMessage(status: number, data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return data.error;
  }
  return `Request failed (${status})`;
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const url = new URL(API_BASE + path);
  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  const hasBody = opts.body !== undefined;
  const headers: Record<string, string> = hasBody ? { 'Content-Type': 'application/json' } : {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
  const text = await res.text();
  let data: unknown = text;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) throw new ApiError(res.status, errorMessage(res.status, data), data);
  return data as T;
}

/** URL WebSocket ke API (token via ?token= — browser WS tidak bisa set header). */
export function apiWs(path: string): string {
  const base = API_BASE.replace(/^http/, 'ws');
  const token = getToken();
  if (!token) return base + path;
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${path}${sep}token=${encodeURIComponent(token)}`;
}

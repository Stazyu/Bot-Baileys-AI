import { onUnmounted, ref, type Ref } from 'vue';
import { API_BASE, getToken } from '@/lib/api';

export type SseStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

/**
 * SSE via fetch reader (EventSource tidak bisa set Authorization header).
 * Auto-reconnect dengan backoff, status koneksi terekspos untuk badge Live.
 */
export function useSse<T>(path: string, retryMs = 3000) {
  const status: Ref<SseStatus> = ref('connecting');
  const items: Ref<T[]> = ref([]);
  let stopped = false;
  let abort: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<(item: T, event: string) => void>();

  function emit(item: T, event: string): void {
    items.value.push(item);
    for (const fn of listeners) {
      try {
        fn(item, event);
      } catch {
        // Isolasi listener.
      }
    }
  }

  function scheduleReconnect(): void {
    if (stopped) {
      status.value = 'offline';
      return;
    }
    status.value = 'reconnecting';
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => void connect(), retryMs);
  }

  function parseBlock(block: string): void {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      else if (line.startsWith(':')) continue; // komentar/heartbeat
    }
    if (dataLines.length === 0 || event === 'ping') return;
    try {
      emit(JSON.parse(dataLines.join('\n')) as T, event);
    } catch {
      // Frame rusak — lewati, koneksi tetap jalan.
    }
  }

  async function connect(): Promise<void> {
    if (stopped) return;
    status.value = items.value.length > 0 ? 'reconnecting' : 'connecting';
    abort = new AbortController();
    try {
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(API_BASE + path, { headers, signal: abort.signal });
      if (!res.ok || !res.body) {
        scheduleReconnect();
        return;
      }
      status.value = 'live';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep = buffer.indexOf('\n\n');
        while (sep >= 0) {
          parseBlock(buffer.slice(0, sep));
          buffer = buffer.slice(sep + 2);
          sep = buffer.indexOf('\n\n');
        }
        if (stopped) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
    } catch {
      // Abort (unmount) atau network error — reconnect kecuali stopped.
    } finally {
      abort = null;
    }
    if (!stopped) scheduleReconnect();
    else status.value = 'offline';
  }

  function onItem(fn: (item: T, event: string) => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }

  function destroy(): void {
    stopped = true;
    clearTimeout(retryTimer);
    if (abort) abort.abort();
    listeners.clear();
    status.value = 'offline';
  }

  onUnmounted(destroy);
  void connect();

  return { items, status, onItem, reconnect: () => void connect(), destroy };
}

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ApiError, api, apiWs } from '@/lib/api';
import type { LinkEvent, SessionItem } from '@/lib/api-types';

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Network error — is the API running?';
}

function isLinkEvent(value: unknown): value is LinkEvent {
  return (
    !!value &&
    typeof value === 'object' &&
    'type' in value &&
    (value.type === 'qr' || value.type === 'pairingCode' || value.type === 'status' || value.type === 'error')
  );
}

/** Sesi WhatsApp — dipakai SessionsView + SessionTable dashboard (satu sumber). */
export const useSessionsStore = defineStore('sessions', () => {
  const items = ref<SessionItem[]>([]);
  const loading = ref(false);
  const error = ref('');
  const busyId = ref('');

  const linkQr = ref<Record<string, string>>({});
  const linkCode = ref<Record<string, string>>({});
  const linkStatus = ref<Record<string, string>>({});
  const linkError = ref('');
  let socket: WebSocket | null = null;
  let linkedId: string | null = null;

  async function fetchAll(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      items.value = await api<SessionItem[]>('/api/sessions');
    } catch (e) {
      error.value = messageOf(e);
    } finally {
      loading.value = false;
    }
  }

  async function create(id: string, phone?: string): Promise<string> {
    busyId.value = id;
    try {
      await api<{ id: string }>('/api/sessions', {
        method: 'POST',
        body: phone ? { id, phone } : { id },
      });
      await fetchAll();
      return id;
    } finally {
      busyId.value = '';
    }
  }

  async function toggle(session: SessionItem): Promise<'disconnect' | 'reconnect'> {
    const action = session.status === 'connected' ? 'disconnect' : 'reconnect';
    busyId.value = session.id;
    error.value = '';
    try {
      await api(`/api/sessions/${session.id}/${action}`, { method: 'POST' });
      await fetchAll();
      return action;
    } catch (e) {
      error.value = messageOf(e);
      throw e;
    } finally {
      busyId.value = '';
    }
  }
  async function remove(id: string): Promise<void> {
    busyId.value = id;
    error.value = '';
    try {
      await api(`/api/sessions/${id}`, { method: 'DELETE' });
      await fetchAll();
    } catch (e) {
      error.value = messageOf(e);
      throw e;
    } finally {
      busyId.value = '';
    }
  }

  function closeLink(): void {
    if (socket) {
      socket.close();
      socket = null;
    }
    linkedId = null;
  }

  function connectLink(id: string): void {
    if (linkedId === id && socket) return;
    closeLink();
    linkedId = id;
    linkError.value = '';
    const ws = new WebSocket(apiWs(`/api/sessions/${id}/link`));
    socket = ws;
    ws.onmessage = (ev: MessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!isLinkEvent(parsed)) return;
      if (parsed.type === 'qr' && 'sessionId' in parsed && parsed.sessionId === id && parsed.dataUrl) {
        linkQr.value = { ...linkQr.value, [id]: parsed.dataUrl };
      } else if (parsed.type === 'pairingCode' && 'sessionId' in parsed && parsed.sessionId === id) {
        linkCode.value = { ...linkCode.value, [id]: parsed.code };
      } else if (parsed.type === 'status' && 'sessionId' in parsed && parsed.sessionId === id) {
        linkStatus.value = { ...linkStatus.value, [id]: parsed.status };
        if (parsed.status === 'connected') void fetchAll();
      } else if (parsed.type === 'error') {
        linkError.value = parsed.message;
      }
    };
    ws.onclose = () => {
      if (linkedId === id) {
        linkedId = null;
        socket = null;
      }
    };
    ws.onerror = () => {
      linkError.value = 'Link stream error — retrying via QR refresh';
    };
  }

  function requestPairing(phone: string): void {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action: 'pairing', phone }));
    }
  }

  function clearLink(id: string): void {
    closeLink();
    const { [id]: _qr, ...qrRest } = linkQr.value;
    void _qr;
    linkQr.value = qrRest;
    const { [id]: _code, ...codeRest } = linkCode.value;
    void _code;
    linkCode.value = codeRest;
    const { [id]: _st, ...stRest } = linkStatus.value;
    void _st;
    linkStatus.value = stRest;
    linkError.value = '';
  }

  return {
    items,
    loading,
    error,
    busyId,
    linkQr,
    linkCode,
    linkStatus,
    linkError,
    fetchAll,
    create,
    toggle,
    remove,
    connectLink,
    closeLink,
    requestPairing,
    clearLink,
  };
});

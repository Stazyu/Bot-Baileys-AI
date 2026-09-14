import { onUnmounted } from 'vue';

/** Polling interval yang bersih sendiri saat komponen unmount. */
export function usePoll(fn: () => void, ms: number, immediate = true): () => void {
  if (immediate) fn();
  const timer = setInterval(fn, ms);
  const stop = (): void => {
    clearInterval(timer);
  };
  onUnmounted(stop);
  return stop;
}

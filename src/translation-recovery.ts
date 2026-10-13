export function withTranslationDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
  onTimeout?: () => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(value as T);
    };
    const abort = () => finish(new Error('Translation task cancelled'));
    const timer = setTimeout(() => {
      finish(new Error('Translation operation timed out'));
      onTimeout?.();
    }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    // Always consume late rejection, including after cancellation or timeout.
    promise.then(value => finish(null, value), error => finish(error));
  });
}

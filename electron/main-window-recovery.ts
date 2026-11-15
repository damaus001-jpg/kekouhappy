import type { BrowserWindow } from 'electron';
import { appendFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { freemem, totalmem } from 'node:os';

// Signal has its own renderer: losing the host must not leave its native window
// visible over a dead shell. Recovery never restarts or deletes an account.
export function installMainWindowRecovery(window: BrowserWindow, options: {
  logPath: string;
  hideSignalWindows: () => void;
  recoveryFailed: () => void;
}) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts: number[] = [];
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
  window.once('closed', stop);
  window.webContents.on('render-process-gone', (_event, details) => {
    if (stopped || window.isDestroyed()) return;
    options.hideSignalWindows();
    const now = Date.now();
    attempts = attempts.filter(at => now - at < 60_000);
    try {
      mkdirSync(dirname(options.logPath), { recursive: true });
      try {
        if (statSync(options.logPath).size > 256 * 1024) writeFileSync(options.logPath, '');
      } catch { /* First event has no log yet. */ }
      appendFileSync(options.logPath, JSON.stringify({
        at: new Date(now).toISOString(), reason: details.reason,
        exitCode: details.exitCode, attempts: attempts.length,
        freeMemory: freemem(), totalMemory: totalmem()
      }) + '\n');
    } catch { /* A full or unavailable disk must not block closing the client. */ }
    if (timer) clearTimeout(timer);
    if (attempts.length >= 2) {
      options.recoveryFailed();
      return;
    }
    attempts.push(now);
    timer = setTimeout(() => {
      timer = undefined;
      if (!stopped && !window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.reload();
      }
    }, 500);
  });
  return stop;
}

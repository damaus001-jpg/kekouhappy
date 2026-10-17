import { app, ipcMain, safeStorage, type IpcMainEvent } from 'electron';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type OpenSmsLoginScope = { profileId: string; origin: string };
type LoginState = { 'sa-token': string; refresh_token: string; user: string };
const maxBytes = 128 * 1024;
function stateFrom(value: unknown): LoginState {
  if (!value || typeof value !== 'object') throw new Error('Invalid login state');
  const data = value as Record<string, unknown>;
  const result = { 'sa-token': '', refresh_token: '', user: '' };
  for (const key of ['sa-token', 'refresh_token', 'user'] as const) {
    if (typeof data[key] !== 'string' || data[key].length > (key === 'user' ? 65536 : 16384)) throw new Error('Invalid login state');
    result[key] = data[key];
  }
  if (!result['sa-token']) return { 'sa-token': '', refresh_token: '', user: '' };
  if (result.user) {
    // Only the site's persisted user store is retained, never password inputs.
    // Also omit credential-like fields if the server includes them in that store.
    result.user = JSON.stringify(JSON.parse(result.user), (key, child) =>
      /password|passwd|^pwd$|credential|secret|private.?key/i.test(key) ? undefined : child);
    if (typeof result.user !== 'string') throw new Error('Invalid user state');
  }
  return result;
}
function filename(scope: OpenSmsLoginScope) {
  if (!/^[0-9a-f-]{36}$/i.test(scope.profileId) || !['https://www.opensms.cc', 'https://opensms.cc'].includes(scope.origin)) throw new Error('Invalid login scope');
  return join(app.getPath('userData'), 'opensms-login', `${scope.profileId}-${new URL(scope.origin).hostname}.enc`);
}
export function readOpenSmsLogin(scope: OpenSmsLoginScope): LoginState | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const file = filename(scope);
  try {
    if (statSync(file).size > maxBytes) return null;
    const saved = JSON.parse(safeStorage.decryptString(readFileSync(file)));
    if (saved.version !== 1 || saved.profileId !== scope.profileId || saved.origin !== scope.origin) return null;
    return stateFrom(saved.state);
  } catch { return null; }
}
export function writeOpenSmsLogin(scope: OpenSmsLoginScope, value: unknown) {
  const state = stateFrom(value), file = filename(scope);
  if (!safeStorage.isEncryptionAvailable()) {
    if (!state['sa-token']) rmSync(file, { force: true });
    return false;
  }
  const bytes = safeStorage.encryptString(JSON.stringify({ version: 1, ...scope, state }));
  if (bytes.length > maxBytes) throw new Error('Login state too large');
  mkdirSync(join(app.getPath('userData'), 'opensms-login'), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, bytes, { mode: 0o600 }); renameSync(temporary, file); }
  finally { rmSync(temporary, { force: true }); }
  return true;
}
export function removeOpenSmsLogin(profileId: string) {
  for (const origin of ['https://www.opensms.cc', 'https://opensms.cc']) rmSync(filename({ profileId, origin }), { force: true });
}
export function installOpenSmsLoginPersistence(resolveScope: (event: IpcMainEvent) => OpenSmsLoginScope | null) {
  ipcMain.on('opensms-login:read', event => {
    try { const scope = resolveScope(event); event.returnValue = scope ? readOpenSmsLogin(scope) : null; }
    catch { event.returnValue = null; }
  });
  ipcMain.on('opensms-login:write', (event, value: unknown) => {
    try { const scope = resolveScope(event); event.returnValue = !!scope && writeOpenSmsLogin(scope, value); }
    catch { event.returnValue = false; }
  });
}

import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { randomUUID } from 'node:crypto';

export function registerDevelopmentPageDebugWindow(
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  assertRuntimeAllowed: () => void,
  windows: Set<BrowserWindow>
) {
  ipcMain.handle('development:open-debug-url', async (event, address: unknown) => {
    assertTrustedSender(event);
    assertRuntimeAllowed();
    if (typeof address !== 'string' || address.length > 4096) throw new Error('请输入有效网址');
    let target: URL;
    try {
      target = new URL(address.trim());
    } catch {
      throw new Error('请输入完整网址，例如 https://example.com');
    }
    if ((target.protocol !== 'http:' && target.protocol !== 'https:') || target.username || target.password) {
      throw new Error('网址必须使用 http 或 https，且不能包含账号密码');
    }

    const owner = BrowserWindow.fromWebContents(event.sender);
    const debugWindow = new BrowserWindow({
      title: `页面调试 · ${target.hostname}`,
      ...(owner ? { parent: owner } : {}),
      width: 1440,
      height: 960,
      webPreferences: {
        partition: `development-page-debug-${randomUUID()}`,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: true
      }
    });
    windows.add(debugWindow);
    debugWindow.once('closed', () => windows.delete(debugWindow));
    debugWindow.setMenu(null);
    debugWindow.webContents.on('devtools-opened', () => {
      void debugWindow.webContents.devToolsWebContents?.executeJavaScript("DevToolsAPI.showPanel('network')").catch(() => {});
    });
    debugWindow.webContents.on('before-input-event', (inputEvent, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        inputEvent.preventDefault();
        debugWindow.webContents.toggleDevTools();
      }
    });
    debugWindow.webContents.openDevTools({ mode: 'detach' });
    try {
      await debugWindow.loadURL(target.href);
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_ABORTED' && !debugWindow.isDestroyed() && debugWindow.webContents.getURL().startsWith(target.origin)) return;
      if (!debugWindow.isDestroyed()) debugWindow.destroy();
      throw error;
    }
  });
}

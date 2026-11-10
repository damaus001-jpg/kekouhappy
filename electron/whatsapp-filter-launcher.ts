import { createServer, type Server, type Socket } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type FilterTheme = 'blackGold' | 'pink' | 'murongPurple' | 'clearWaterBlue';
export type FilterLaunchGrant = { theme: FilterTheme; suiteId: string; keyId: string; hardwareHash: string };
export function resolveWhatsAppFilterLaunch(options: {
  packaged: boolean; resourcesPath: string; workspaceRoot: string;
  expected: { suiteId: string; keyId: string; hardwareHash: string }; theme: FilterTheme;
}) {
  const executable = options.packaged
    ? join(options.resourcesPath, 'whatsapp-filter', 'whatsapp-number-filter.exe')
    : join(options.workspaceRoot, '.package-staging', 'whatsapp-filter-runtime', 'whatsapp-number-filter.exe');
  if (!statSync(executable, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(options.packaged ? '当前安装缺少号码筛选程序，请更新完整安装包' : '开发版号码筛选程序尚未准备好，请重新启动开发环境');
  }
  if (!/^[a-f0-9]{64}$/i.test(options.expected.hardwareHash)) throw new Error('请先完成本机授权初始化');
  let { suiteId, keyId } = options.expected;
  if (!options.packaged) {
    // Development has its own translator suite. The filter still uses the
    // actual delivery suite so its four-digit codes work with that issuer.
    const profile = JSON.parse(readFileSync(join(options.workspaceRoot, '.package-staging', 'whatsapp-number-filter', 'app', 'filter-license-public.json'), 'utf8'));
    if (!/^\d{9}$/.test(profile.suiteId) || typeof profile.keyId !== 'string' || !profile.keyId.startsWith('k_')) throw new Error('开发版筛选套装配置无效');
    suiteId = profile.suiteId; keyId = profile.keyId;
  }
  return { executable, grant: { theme: options.theme, suiteId, keyId, hardwareHash: options.expected.hardwareHash } };
}
export class WhatsAppFilterLauncher {
  constructor(private readonly spawnProcess: typeof spawn = spawn) {}
  private socket: Socket | null = null;
  private server: Server | null = null;
  private pending: Promise<void> | null = null;
  private theme: FilterTheme = 'blackGold';
  private child: ChildProcess | null = null;
  private focusPending: { requestId: string; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;

  setTheme(theme: FilterTheme) {
    this.theme = theme;
    this.send({ type: 'theme', theme });
  }
  private send(message: unknown) {
    if (this.socket && !this.socket.destroyed) this.socket.write(JSON.stringify(message) + '\n');
  }
  async open(executable: string, grant: FilterLaunchGrant) {
    this.setTheme(grant.theme);
    if (this.pending) return this.pending;
    if (this.socket && !this.socket.destroyed) return this.requestFocus();
    this.pending = this.start(executable, grant);
    try { await this.pending; } finally { this.pending = null; }
  }
  private settleFocus(visible: boolean) {
    const pending = this.focusPending;
    if (!pending) return;
    clearTimeout(pending.timer); this.focusPending = null;
    if (visible) pending.resolve(); else pending.reject(new Error('号码筛选窗口未成功显示，请重试'));
  }
  private requestFocus() {
    this.settleFocus(false);
    return new Promise<void>((resolve, reject) => {
      const requestId = randomBytes(12).toString('hex');
      const timer = setTimeout(() => this.settleFocus(false), 5_000);
      this.focusPending = { requestId, resolve, reject, timer };
      this.send({ type: 'focus', requestId });
    });
  }
  private start(executable: string, grant: FilterLaunchGrant) {
    const token = randomBytes(32).toString('hex');
    const pipe = '\\\\.\\pipe\\pikachu-filter-' + randomBytes(16).toString('hex');
    return new Promise<void>((resolve, reject) => {
      let finished = false;
      let authenticated: Socket | null = null;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        this.server?.close(); this.server = null;
        if (error) { authenticated?.destroy(); reject(error); } else resolve();
      };
      const timer = setTimeout(() => finish(new Error('号码筛选启动超时，请重试')), 20_000);
      const server = createServer(socket => {
        let buffer = '', authorized = false;
        socket.setTimeout(20_000, () => socket.destroy());
        socket.on('error', () => socket.destroy());
        socket.on('data', chunk => {
          buffer += chunk.toString('utf8');
          if (buffer.length > 8192) { socket.destroy(); return; }
          let newline: number;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
            try {
              const message = JSON.parse(line);
              if (!authorized) {
                if (authenticated || message.type !== 'hello' || typeof message.token !== 'string' || message.token.length !== token.length || !timingSafeEqual(Buffer.from(message.token), Buffer.from(token))) { socket.destroy(); return; }
                authorized = true; authenticated = socket; this.socket = socket;
                socket.setTimeout(0);
                socket.write(JSON.stringify({ type: 'welcome', ...grant, theme: this.theme }) + '\n');
              } else if (message.type === 'ready') {
                finish(message.visible === true ? undefined : new Error('号码筛选已启动，但窗口未成功显示，请重试'));
              }
              else if (message.type === 'focus-applied' && message.requestId === this.focusPending?.requestId) { this.settleFocus(message.visible === true); }
              else if (message.type === 'error') { finish(new Error('号码筛选启动失败，请检查对应套装和本机授权')); }
            } catch { socket.destroy(); }
          }
        });
        socket.on('close', () => { if (this.socket === socket) { this.socket = null; this.settleFocus(false); } });
      });
      this.server = server;
      server.on('error', error => finish(error));
      server.listen(pipe, () => {
        const env = { ...process.env, PIKACHU_FILTER_PIPE: pipe, PIKACHU_FILTER_TOKEN: token };
        for (const name of ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'WNF_SMOKE', 'WNF_STARTUP_CHECK', 'WNF_USER_DATA_DIR']) delete (env as NodeJS.ProcessEnv)[name];
        // This is the requested interactive application. SW_HIDE can suppress
        // Electron's first ShowWindow call, so only background helpers hide.
        this.child = this.spawnProcess(executable, [], { env, windowsHide: false, stdio: 'ignore' });
        this.child.once('error', error => finish(error));
        this.child.unref();
      });
    });
  }
  dispose() {
    this.settleFocus(false);
    this.socket?.destroy(); this.socket = null;
    this.server?.close(); this.server = null;
    // The independently running filter is intentionally not terminated.
    this.child = null;
  }
}

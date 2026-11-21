import { execFile, spawn } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createHmac, randomBytes } from 'node:crypto';
import { loadWorkspaceKey } from './workspace-access.js';
import type { Backend8070Action, Backend8070Result } from './backend8070-types.js';

const missing = (): Backend8070Result => ({ ok: false, state: 'unknown', code: 'MISSING_FILES', message: '安装文件缺失' });
const maxOutput = 64 * 1024;

export function signBackend8070Command(action: Backend8070Action, installDir: string, key: Buffer,
  timestamp = String(Math.floor(Date.now() / 1000)), nonce = randomBytes(16).toString('hex')) {
  const canonical = installDir.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  const payload = `pikachu-8070-control-v1\n${action}\n${canonical}\n${timestamp}\n${nonce}`;
  return { v: 1, timestamp, nonce, signature: createHmac('sha256', key).update(payload, 'utf8').digest('hex') };
}

export async function discoverBackend8070(): Promise<string> {
  // Explicit UTF-8 preserves non-ASCII installation paths on every Windows code page.
  const script = `[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
$key = $base.OpenSubKey('Software\\PhoneWorkbench8070')
if ($null -eq $key) { exit 2 }
try { @{ InstallDir = $key.GetValue('InstallDir'); ControlProtocol = $key.GetValue('ControlProtocol') } | ConvertTo-Json -Compress } finally { $key.Dispose(); $base.Dispose() }`;
  const output = await new Promise<string>((resolve, reject) => {
    execFile(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 5000, maxBuffer: maxOutput, encoding: 'utf8' },
      (error, stdout) => error ? reject(error) : resolve(stdout));
  });
  const { InstallDir: directory, ControlProtocol: protocol } = JSON.parse(output.replace(/^\uFEFF/, ''));
  if (typeof directory !== 'string' || !isAbsolute(directory) || protocol !== 1) throw new Error('安装文件缺失');
  return realpathSync.native(directory);
}

export function validateBackend8070Installation(directory: string) {
  for (const file of ['runtime/python.exe', 'iphone_batch/host_control.py', '8070-host-policy.json']) {
    if (!statSync(join(directory, file)).isFile()) throw new Error('安装文件缺失');
  }
  const policy = JSON.parse(readFileSync(join(directory, '8070-host-policy.json'), 'utf8').replace(/^\uFEFF/, ''));
  if (policy.protocol !== 1 || policy.mode !== 'pikachu-only') throw new Error('安装文件缺失');
}

export function runBackend8070Command(directory: string, action: Backend8070Action, envelope: object): Promise<Backend8070Result> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };
    for (const name of Object.keys(env)) if (/^(PYTHONHOME|PYTHONPATH|PATH)$/i.test(name)) delete env[name];
    env.PATH = join(directory, 'runtime') + ';' + (process.env.PATH || process.env.Path || '');
    const child = spawn(join(directory, 'runtime', 'python.exe'), [join(directory, 'iphone_batch', 'host_control.py'), action],
      { cwd: directory, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', bytes = 0, finished = false;
    const finish = (result: Backend8070Result) => {
      if (finished) return;
      finished = true; clearTimeout(timer); resolve(result);
    };
    const failure = (message: string): Backend8070Result => ({ ok: false, state: 'unknown', message });
    const timer = setTimeout(() => { child.kill(); finish(failure('后台操作超时，请重新查询状态')); }, action === 'status' ? 15000 : 120000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (value: string) => { stdout += value; });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (value: string | Buffer) => {
      bytes += Buffer.byteLength(value);
      if (bytes > maxOutput) { child.kill(); finish(failure('后台响应过大，请重新查询状态')); }
    });
    child.on('error', (error: NodeJS.ErrnoException) => finish(error.code === 'ENOENT' ? missing() : failure('后台控制命令执行失败')));
    child.stdin.on('error', () => finish(failure('后台授权传递失败')));
    child.on('close', (exitCode) => {
      try {
        const value = JSON.parse(stdout.trim());
        if (value.protocol !== 1 || value.action !== action || typeof value.ok !== 'boolean' ||
          !['running', 'stopped', 'residual', 'unknown'].includes(value.state) || typeof value.message !== 'string') throw new Error();
        if (exitCode === 2 || value.code === 'MISSING_FILES') return finish(missing());
        const ok = exitCode === 0 && value.ok && (action === 'status' || value.state === (action === 'start' ? 'running' : 'stopped'));
        const message = value.ok && !ok ? '后台操作未完成，请重新查询状态' : value.message.slice(0, 500);
        finish({ ok, state: value.state, message: message || (ok ? '后台操作完成' : '后台操作失败'), code: typeof value.code === 'string' ? value.code : undefined });
      } catch { finish(exitCode === 2 ? missing() : failure('后台响应无效，请重新查询状态')); }
    });
    child.stdin.end(JSON.stringify(envelope) + '\n');
  });
}

export class Backend8070Control {
  private pending = false;
  private state: Backend8070Result['state'] = 'unknown';
  constructor(private readonly discover = discoverBackend8070, private readonly run = runBackend8070Command,
    private readonly getKey = loadWorkspaceKey, private readonly validate = validateBackend8070Installation) {}

  async control(action: Backend8070Action): Promise<Backend8070Result> {
    if (!['status', 'start', 'stop'].includes(action)) throw new Error('无效的后台操作');
    if (this.pending) return { ok: false, state: this.state, code: 'BUSY', message: '后台操作进行中' };
    this.pending = true;
    if (action !== 'status') this.state = action === 'start' ? 'starting' : 'stopping';
    try {
      let directory: string;
      try { directory = await this.discover(); this.validate(directory); }
      catch { this.state = 'unknown'; return missing(); }
      const invoke = (command: Backend8070Action) => this.run(directory, command, signBackend8070Command(command, directory, this.getKey()));
      const result = await invoke(action);
      if (!result.ok && action !== 'status' && result.code !== 'MISSING_FILES') {
        const refreshed = await invoke('status');
        result.state = refreshed.state;
      }
      this.state = result.state;
      return result;
    } catch { this.state = 'unknown'; return { ok: false, state: 'unknown', message: '后台控制失败，请重新查询状态' }; }
    finally { this.pending = false; }
  }
}

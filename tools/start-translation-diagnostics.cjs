const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const { migrateDiagnosticDataRoot } = require('./translation-diagnostic-paths.cjs');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
if (process.platform === 'win32' && process.env.MAOYI_DIAGNOSTICS_LAUNCH_MUTEX_HELD !== '1') {
  const guarded = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(__dirname, 'start-translation-diagnostics.ps1'), '-DirectLaunch'
  ], { cwd: root, env: process.env, stdio: 'inherit', windowsHide: false });
  if (guarded.error) throw guarded.error;
  process.exit(guarded.status ?? 1);
}
(async () => {
// Generate developer-signed files separately from the files used by packaging.
for (const builder of ['build-translation-prompt-bundle.mjs', 'build-smart-reply-prompt-bundle.mjs']) {
  const promptEnv = { ...process.env };
  delete promptEnv.MAOYI_LICENSE_SUITE_PATH;
  promptEnv.MAOYI_DEVELOPMENT_PROMPTS_ONLY = '1';
  const result = spawnSync(process.execPath, [path.join(root, 'tools', builder)], {
    cwd: root, env: promptEnv, windowsHide: true, stdio: 'inherit'
  });
  if (result.error || result.status !== 0) throw result.error || new Error('Developer prompt preparation failed.');
}
const signalSync = spawnSync(process.execPath, [path.join(__dirname, 'sync-signal-source-runtime.cjs')], {
  cwd: root, env: process.env, windowsHide: true, stdio: 'inherit'
});
if (signalSync.error || signalSync.status !== 0) {
  throw signalSync.error || new Error('Verified Signal developer runtime synchronization failed.');
}
const diagnosticRoot = path.join(root, '.tmp', 'translation-diagnostics-client');
const userDataPath = migrateDiagnosticDataRoot(root, process.env.APPDATA);
const sourceRuntime = path.join(root, '.runtime', 'signal-desktop');
const copiedRuntime = path.join(diagnosticRoot, 'signal-runtime');
const sourceAsar = path.join(sourceRuntime, 'resources', 'app.asar');
const copiedAsar = path.join(copiedRuntime, 'resources', 'app.asar');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (!fs.existsSync(path.join(sourceRuntime, 'Signal.exe')) || !fs.existsSync(sourceAsar)) {
  throw new Error('Signal developer runtime is missing. Restore the project environment first.');
}
if (!fs.existsSync(copiedAsar) || hash(sourceAsar) !== hash(copiedAsar)) {
  fs.mkdirSync(diagnosticRoot, { recursive: true });
  fs.cpSync(sourceRuntime, copiedRuntime, { recursive: true,
    filter: entry => path.basename(entry) !== 'df-runtime-binding.dat' });
}
await ensureSignalAcceptsDiagnosticDataRoot(copiedRuntime, copiedAsar);
const env = { ...process.env,
  MAOYI_TRANSLATION_DIAGNOSTICS: '1',
  MAOYI_USER_DATA_DIR: userDataPath,
  MAOYI_REQUIRE_LICENSE_IN_DEV: '0',
  MAOYI_SIGNAL_SOURCE_EXE: '', MAOYI_SIGNAL_SOURCE_SHA256: '', MAOYI_SIGNAL_SOURCE_ONLY_ACCEPTANCE: '',
  VITE_DEV_SERVER_URL: process.argv.includes('--live') ? 'http://127.0.0.1:5173' : '', ELECTRON_RUN_AS_NODE: '',
  MAOYI_SMOKE_CAPTURE_PATH: '', MAOYI_SMOKE_ENTER_RUNTIME: '', MAOYI_SMOKE_TEST_EXIT: '',
  MAOYI_LICENSE_PUBLIC_SUITE_PATH: '', MAOYI_SERVICE_SECRET: ''
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
const pendingKey = path.join(diagnosticRoot, 'service-key.pending');
if (fs.existsSync(pendingKey)) {
  env.MAOYI_DIAGNOSTIC_SECRET = fs.readFileSync(pendingKey, 'utf8').trim();
  fs.unlinkSync(pendingKey);
}
fs.mkdirSync(path.join(diagnosticRoot, 'logs'), { recursive: true });
const output = fs.openSync(path.join(diagnosticRoot, 'logs', 'startup.log'), 'a');
// This Electron process owns the interactive client window. SW_HIDE can
// suppress its first ShowWindow call on Windows; only helper processes hide.
const debugArguments = process.argv.includes('--inspect') ? ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9338'] : [];
const child = spawn(require('electron'), [root, ...debugArguments], { cwd: root, env, windowsHide: false, stdio: ['ignore', output, output] });
fs.closeSync(output);
const launchLog = value => fs.appendFileSync(path.join(diagnosticRoot, 'logs', 'startup.log'), `${new Date().toISOString()} launcher:${value}\n`);
child.on('spawn', () => launchLog(`spawned pid=${child.pid}`));
child.on('error', error => { launchLog(`failed code=${error.code || 'unknown'}`); process.exitCode = 1; });
child.on('exit', (code, signal) => { launchLog(`exited code=${code} signal=${signal || 'none'}`); process.exitCode = code || 0; });
console.log(`Diagnostic client started. Data and reports: ${diagnosticRoot}`);

async function ensureSignalAcceptsDiagnosticDataRoot(runtimeDir, asarPath) {
  const acceptedRoot = 'maoyi diagnostics client data';
  const packageAcceptsRoot = () => {
    const checkSource = [
      "const a=require('@electron/asar');",
      "(async()=>{const p=process.argv[1],r=process.argv[2],e=await a.listPackage(p),g=e.find(x=>x.toLowerCase().includes('df-bootstrap.cjs')),t=g||'bundles/main.js',s=Buffer.from(await a.extractFile(p,t)).toString('utf8').toLowerCase();process.exit(s.includes(r)?0:1)})().catch(()=>process.exit(2));"
    ].join('');
    const checked = spawnSync(process.execPath, ['-e', checkSource, asarPath, acceptedRoot], {
      cwd: root, env: process.env, windowsHide: true, stdio: 'ignore'
    });
    return !checked.error && checked.status === 0;
  };
  if (packageAcceptsRoot()) return;

  const patched = spawnSync(process.execPath, [path.join(__dirname, 'patch-signal-control-channel.cjs'), runtimeDir], {
    cwd: root, env: process.env, windowsHide: true, stdio: 'inherit'
  });
  if (patched.error || patched.status !== 0 || !packageAcceptsRoot()) {
    throw new Error('Signal runtime still rejects the diagnostics data directory; refusing to launch an incompatible runtime.');
  }
}
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const shortSource = path.join(root, '.tmp/s');
const source = fs.existsSync(path.join(shortSource, '.df-short-build.json'))
  ? shortSource : path.join(root, '.tmp/signal-source/v8.36.0/Signal-Desktop-8.36.0');
const nodeDir = path.join(root, '.toolchains/node-v24.22.3-win-x64');
const pnpm = path.join(root, '.toolchains/pnpm-11.24.0/package/bin/pnpm.cjs');
const bin = path.join(root, '.toolchains/bin');
fs.mkdirSync(bin, { recursive: true });
fs.writeFileSync(path.join(bin, 'pnpm.cmd'), '@"%~dp0..\\node-v24.22.3-win-x64\\node.exe" "%~dp0..\\pnpm-11.24.0\\package\\bin\\pnpm.cjs" %*\r\n');
const action = process.argv[2];
const actions = {
  generate: ['run', 'generate'],
  types: ['run', 'check:types'],
  rebuild: ['rebuild', '--pending'],
  native: ['run', 'electron:install-app-deps'],
  bundle: ['run', 'build:rolldown:prod'],
  unit: ['exec', 'mocha', '--no-config', '--no-package', '--import=tsx', '--timeout', '10000', '--ignore', 'ts/test-node/maoyi/refreshState_test.node.ts', 'ts/test-node/maoyi/*_test.node.ts'],
  install: ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'],
  workspace: ['--filter', '@signalapp/types', 'run', 'build'],
  windows: ['--filter', '@signalapp/windows-ucv', 'run', 'build'],
  mock: ['--filter', '@signalapp/mock-server', 'run', 'build'],
  'electron-unit': ['exec', 'electron-mocha', '--no-config', '--no-package', '--timeout', '10000', '--extension', 'ts,tsx', '--recursive', 'ts/test-node/maoyi'],
  package: ['run', 'build:release', '--win', 'dir', '--publish', 'never'],
};
if (!Object.hasOwn(actions, action)) throw new Error('Unknown isolated build action');
const env = {
  ...process.env,
  PATH: `${bin}${path.delimiter}${nodeDir}${path.delimiter}${process.env.PATH}`,
  CI: 'true',
  npm_config_cache: path.join(root, '.toolchains/npm-cache'),
  PNPM_CONFIG_STORE_DIR: path.join(root, '.pnpm-store-complete'),
  ELECTRON_CACHE: path.join(root, '.toolchains/electron-cache'),
  ELECTRON_BUILDER_CACHE: path.join(root, '.toolchains/electron-builder-cache'),
  ELECTRON_SKIP_BINARY_DOWNLOAD: '1',
};
if (action === 'electron-unit') env.NODE_OPTIONS = '--import=tsx';
let restorePackage = () => {};
if (action === 'package') {
  const wrapper = path.join(source, 'packages/windows-ucv/dist/index.js');
  if (!fs.existsSync(wrapper) || !fs.readFileSync(wrapper, 'utf8').includes('hasWindowOwner')) {
    throw new Error('Windows owner wrapper is missing; run the windows action before packaging');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'signal-source/baselines/v8.36.0.json'), 'utf8'));
  const archive = path.join(root, '.toolchains/electron-cache/electron-v45.4.1-win32-x64.zip');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex').toUpperCase();
  if (sha !== manifest.build.electronArchiveSha256) throw new Error('Electron archive SHA256 mismatch');
  const main = fs.readFileSync(path.join(source, 'bundles/main.js'), 'utf8');
  for (const marker of ['dfLaunchPipe', 'local-direct-blocked', 'credential-accepted', 'signal-main.js']) {
    if (!main.includes(marker)) throw new Error(`Built launcher guard missing: ${marker}`);
  }
  const packagePath = path.join(source, 'package.json');
  const original = fs.readFileSync(packagePath);
  const pkg = JSON.parse(original);
  const signing = pkg.build.win.signtoolOptions;
  if (signing.sign !== 'scripts/sign-windows.mjs') throw new Error('Unreviewed signing hook');
  delete signing.certificateSha1;
  delete signing.certificateSubjectName;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  restorePackage = () => fs.writeFileSync(packagePath, original);
  actions.package.push('--config.electronDist', path.relative(source, archive));
}
let cwd = source;
const logs = path.join(root, '.tmp/signal-836-logs');
fs.mkdirSync(logs, { recursive: true });
const log = path.join(logs, `${action}.log`);
const fd = fs.openSync(log, 'w');
const startedAt = new Date().toISOString();
console.log(`Running ${action}; log: ${log}`);
const child = spawn(path.join(nodeDir, 'node.exe'), [pnpm, ...actions[action]], { cwd, env, windowsHide: true, stdio: ['ignore', fd, fd] });
fs.closeSync(fd);
child.on('error', error => { restorePackage(); console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => {
  restorePackage();
  fs.writeFileSync(path.join(logs, `${action}.result.json`), JSON.stringify({startedAt, completedAt: new Date().toISOString(), code, signal}, null, 2));
  console.log(`${action} exited ${code}; ${log}`);
  if (code) console.log(fs.readFileSync(log, 'utf8').split(/\r?\n/).slice(-45).join('\n'));
  process.exitCode = code ?? 1;
});

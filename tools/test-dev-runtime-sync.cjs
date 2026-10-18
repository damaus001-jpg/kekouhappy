const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const syncPath = path.join(root, 'tools', 'sync-signal-source-runtime.cjs');
const experimentPath = path.join(root, 'tools', 'signal-source-experiment.cjs');
const preparedRuntime = path.join(
  root,
  '.tmp',
  'signal-source',
  'v8.18.0',
  'Signal-Desktop-8.18.0',
  'release',
  'win-unpacked'
);

const syncSource = fs.readFileSync(syncPath, 'utf8');
const diagnosticsLauncher = fs.readFileSync(path.join(root, 'tools', 'start-translation-diagnostics.cjs'), 'utf8');
for (const [needle, message] of [
  ['ensureSignalAcceptsDiagnosticDataRoot(copiedRuntime, copiedAsar)', 'developer launcher does not validate the embedded Signal data-root guard in its isolated runtime'],
  ['patch-signal-control-channel.cjs', 'developer launcher cannot repair a stale embedded Signal guard'],
  ['maoyi diagnostics client data', 'developer launcher does not require its active Signal data-root name']
]) {
  if (!diagnosticsLauncher.includes(needle)) throw new Error(message);
}

const requiredContracts = [
  ["const baselineVersion = '8.18.0';", 'runtime synchronization is not bound to Signal 8.18.0'],
  ["requiredFile(sourceRoot, 'Signal.exe');", 'runtime synchronization does not require Signal.exe'],
  ["requiredFile(sourceRoot, path.join('resources', 'app.asar'));", 'runtime synchronization does not require app.asar'],
  ["const sourceHash = sha256(sourceAsar);", 'runtime synchronization does not hash the verified source'],
  ["if (sourceHash === targetHash)", 'runtime synchronization does not compare source and target hashes'],
  ["if (checkOnly)", 'runtime synchronization has no read-only check mode'],
  ["assertInsideProject(targetRoot, 'Signal development runtime');", 'runtime target is not confined to the project'],
  ["path.basename(resolved).startsWith('signal-desktop.sync-')", 'temporary runtime cleanup is not name-scoped'],
  ["fs.renameSync(targetRoot, backupPath);", 'the previous runtime is not preserved before replacement'],
  ["if (synchronizedHash !== sourceHash)", 'the synchronized runtime is not verified after replacement']
];

for (const [needle, message] of requiredContracts) {
  if (!syncSource.includes(needle)) throw new Error(message);
}

if (fs.statSync(preparedRuntime, { throwIfNoEntry: false })?.isDirectory()) {
  const result = spawnSync(process.execPath, [syncPath, '--check'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Verified Signal runtime synchronization check failed with exit code ${result.status ?? 'unknown'}`);
  }
  console.log('dev-runtime-sync: generated Signal runtime hash and recovery contracts passed');
  process.exit(0);
}

const baseline = spawnSync(process.execPath, [experimentPath, 'check', '--version', '8.18.0'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'inherit'
});
if (baseline.error || baseline.status !== 0) {
  throw new Error(`Signal recovery archive verification failed with exit code ${baseline.status ?? 'unknown'}`);
}
console.log('dev-runtime-sync: clean-clone archive and synchronization safety contracts passed; generated runtime hash check is not applicable before a Signal source build');

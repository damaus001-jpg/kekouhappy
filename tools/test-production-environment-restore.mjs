import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(projectRoot, 'tools', 'restore-production-environment.ps1');
const launcherPath = path.join(projectRoot, '恢复生产环境.cmd');
const packagePath = path.join(projectRoot, 'package.json');
const ignorePath = path.join(projectRoot, '.gitignore');
const electronSmokePath = path.join(projectRoot, 'tools', 'test-electron-smoke.cjs');
const publicReproductionPath = path.join(projectRoot, 'tools', 'test-public-reproduction.mjs');
const recoveryPath = path.join(projectRoot, 'RECOVERY.md');
const guidePath = path.join(projectRoot, 'NEW-SUITE-GUIDE.md');

const [
  script,
  launcher,
  packageSource,
  ignore,
  electronSmoke,
  publicReproduction,
  recovery,
  guide
] = await Promise.all([
  readFile(scriptPath, 'utf8'),
  readFile(launcherPath, 'utf8'),
  readFile(packagePath, 'utf8'),
  readFile(ignorePath, 'utf8'),
  readFile(electronSmokePath, 'utf8'),
  readFile(publicReproductionPath, 'utf8'),
  readFile(recoveryPath, 'utf8'),
  readFile(guidePath, 'utf8')
]);

function includes(source, marker, label) {
  assert.ok(source.includes(marker), `production restore contract missing ${label}: ${marker}`);
}

includes(launcher, 'tools\\restore-production-environment.ps1', 'double-click PowerShell entry');
includes(launcher, '-InstallMissingSystemTools', 'explicit system-tool installation permission');
includes(script, "$NodeVersion = '24.15.0'", 'fixed Node version');
includes(
  script,
  "$NodeArchiveSha256 = 'CC5149EABD53779CE1E7BDC5401643622D0C7E6800ADE18928A767E940BB0E62'",
  'official Node archive hash'
);
includes(script, "$PnpmVersion = '11.5.2'", 'fixed pnpm version');
includes(script, 'Ensure-PnpmShim', 'fixed pnpm child-process command shim');
includes(script, "$SignalVersion = '8.18.0'", 'fixed Signal version');
includes(
  script,
  "$SignalPatchSetSha256 = '38AF0DA1AEC1CEC40C44173F53DC68E6C835F0A94F974A8A8D2824B5FC3B43FE'",
  'fixed Signal patch-set hash'
);
includes(script, 'Git.Git', 'Git installer');
includes(script, 'Python.Python.3.13', 'Python installer');
includes(script, 'Microsoft.VisualStudio.2022.BuildTools', 'Visual Studio installer');
includes(script, "'ci'", 'clean maoyi dependency install');
includes(script, "'signal-source:check:v8.18'", 'Signal baseline check');
includes(script, "'signal-source:prepare:v8.18'", 'Signal source preparation');
includes(script, 'Reset-StaleSignalExperiment -Baseline $baseline', 'safe stale experiment recovery');
includes(script, "'pnpm', 'install', '--frozen-lockfile'", 'online Signal dependency hydration');
includes(script, "'signal-source:preflight:v8.18'", 'offline Signal preflight');
includes(script, "'signal-source:build:v8.18'", 'Signal source build');
includes(script, '$env:MAOYI_SIGNAL_SOURCE_EXE = [IO.Path]::GetFullPath($signalSourceExe)', 'absolute Signal UI artifact');
includes(script, '$env:MAOYI_SIGNAL_SOURCE_SHA256 =', 'Signal UI artifact hash');
includes(script, "'tools\\sync-signal-source-runtime.cjs'", 'Signal runtime synchronization');
includes(script, "'test:public-reproduction'", 'fresh-suite reproduction check');
includes(script, "'test:security'", 'full security test');
includes(script, "'test:signal-render-cache'", 'Signal runtime and cache test');
includes(script, "'test:electron-smoke'", 'maoyi and issuer UI smoke test');
includes(script, "'test:signal-source-window-ui:v8.18'", 'Signal window UI acceptance');
includes(script, "suiteIdConsumed = $false", 'no formal suite ID consumption report');
includes(script, "installerGenerated = $false", 'no installer generation report');
includes(script, "'github-download-zip'", 'GitHub ZIP source report mode');
includes(
  script,
  "sourceRepository = 'https://github.com/baishihappy-ux/baishihappy-2'",
  'fixed public source repository'
);
includes(script, '生产环境恢复完成，现在可以生成新套装。', 'plain-language success message');
includes(ignore, '.toolchains/', 'local downloaded toolchain exclusion');
includes(publicReproduction, 'collectPublicSourceFiles(projectRoot)', 'Git-independent public source scan');
includes(publicReproduction, "'.git'", 'explicit Git metadata exclusion');
assert.equal(
  /\bls-files\b/.test(publicReproduction),
  false,
  'public reproduction must not require Git repository metadata'
);
includes(recovery, 'Download ZIP', 'sole GitHub ZIP recovery path');
includes(guide, 'Download ZIP', 'sole GitHub ZIP suite guide path');
assert.doesNotMatch(recovery, /\bgit clone\b/i, 'recovery guide must not offer Git clone');
assert.doesNotMatch(guide, /\bgit clone\b/i, 'suite guide must not offer Git clone');
includes(electronSmoke, 'fs.mkdir(clientData, { recursive: true })', 'fresh client smoke data directory');
includes(electronSmoke, 'fs.mkdir(issuerData, { recursive: true })', 'fresh issuer smoke data directory');
includes(electronSmoke, "MAOYI_SIGNAL_SOURCE_EXE: ''", 'Signal experiment isolation for client smoke');
includes(electronSmoke, "MAOYI_SIGNAL_SOURCE_SHA256: ''", 'Signal experiment hash isolation for client smoke');
includes(
  electronSmoke,
  "MAOYI_SIGNAL_SOURCE_ONLY_ACCEPTANCE: ''",
  'Signal-only acceptance isolation for client smoke'
);

for (const forbidden of [
  "'suite:create'",
  "'suite:package'",
  'MAOYI_SUITE_SEQUENCE',
  'create-license-suite.cjs',
  'package-license-suite.cjs',
  '.package-secrets',
  'MAOYI_SERVICE_SECRET'
]) {
  assert.equal(
    script.includes(forbidden),
    false,
    `production restore script must not cross suite/secret boundary: ${forbidden}`
  );
}

const packageJson = JSON.parse(packageSource);
assert.equal(
  packageJson.scripts['test:production-environment-restore'],
  'node tools/test-production-environment-restore.mjs',
  'package script must expose production restore contract test'
);
assert.match(
  packageJson.scripts['test:security'],
  /npm run test:production-environment-restore/,
  'security suite must include production restore contract test'
);

console.log('Production environment restore contract passed');

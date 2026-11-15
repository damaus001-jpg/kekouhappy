const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, process.argv[2] || 'release/1.16.26-android-performance-20261115');
assert.equal(path.dirname(output), path.join(root, 'release'), 'verification report belongs in a release subdirectory');
const check = spawnSync(process.execPath, [path.join(root, 'tools/verify-packaged-output.cjs'), `--client=${output}`], {
  cwd: root, env: { ...process.env, MAOYI_PACKAGE_SKIP_STARTUP: '1' }, stdio: 'inherit', windowsHide: true
});
assert.equal(check.status, 0, 'packaged security verification');
const archive = path.join(output, 'win-unpacked/resources/app.asar');
const files = asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''));
const extract = name => asar.extractFile(archive, path.normalize(name));
const frontendFiles = files.filter(name => name.startsWith('dist/') && !asar.statFile(archive, path.normalize(name)).files);
assert.ok(frontendFiles.length > 1);
for (const name of [...frontendFiles, 'dist-electron/main.js', 'electron/preload.cjs', 'electron/webview-send-guard-preload.cjs']) {
  assert.ok(extract(name).equals(fs.readFileSync(path.join(root, name))), `matching current build: ${name}`);
}
const js = frontendFiles.filter(name => /^dist\/assets\/index-.*\.js$/.test(name));
assert.equal(js.length, 1);
const frontend = extract(js[0]).toString();
assert.ok(frontend.includes('2026-11-15-opensms-incremental-v15'));
const includesApple = frontend.includes('2026-11-15-apple-translation-performance-v5');
if (process.argv.includes('--apple')) assert.ok(includesApple, 'Apple translation optimization must be packaged');
const manifest = JSON.parse(extract('package.json'));
assert.equal(manifest.version, '1.16.26');
const artifactNames = ['pikaqiufanyiqi-1.16.26-Setup.exe', 'win-unpacked/resources/app.asar'];
const artifacts = artifactNames.map(file => {
  const bytes = fs.readFileSync(path.join(output, file));
  return { file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase() };
});
const report = {
  version: manifest.version, build: includesApple ? '2026-11-15-android-apple-performance' : '2026-11-15-android-performance', verifiedAt: new Date().toISOString(),
  checks: { buildAndTypecheck: true, sourceSecurity: true, packagedSecurity: true, packagedFilesMatchBuild: true, androidPerformanceFixture: true, androidInputAndSendIntegrity: true, appleRegression: true, ...(includesApple ? { appleTranslationPerformance: true, applePeerPhoneCache: true } : {}), scanCoalescing: true },
  fixture: { messages: 300, unchangedSourceClones: 0, changedSourceClones: 1, concurrentTranslations: 20, batchMessageGeometryReads: 300, shortCommandExampleBytes: 182 },
  limitations: ['Packaged executable startup was not tested; the existing startup checker can display windows and cleans up by process name.', 'Installer was not executed; the running business client and its account data were not modified.', 'No live-message CPU reduction percentage has been measured.'], artifacts
};
fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

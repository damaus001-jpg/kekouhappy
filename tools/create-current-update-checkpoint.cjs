const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const name = process.argv[2];
if (!name || !/^\d{4}-\d{2}-\d{2}_[\d.]+$/.test(name)) throw new Error('Provide a dated checkpoint name.');
const output = path.join(root, '.recovery', name);
if (fs.existsSync(path.join(output, 'manifest.json'))) throw new Error('Checkpoint already sealed; refusing to overwrite.');
if (!fs.existsSync(path.join(output, 'suite-secrets.dpapi'))) throw new Error('Encrypted identity backup is required first.');
const evidence = path.join(output, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
for (const file of files) {
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || /^(?:\.recovery|\.package-secrets|\.tmp|\.runtime|release|node_modules)[\\/]/.test(file)) throw new Error('Unexpected source archive path.');
}
fs.writeFileSync(path.join(output, 'source-files.txt'), files.join('\n') + '\n');
const count = Number(execFileSync('python', ['-c',
  'import sys,zipfile,pathlib; root=pathlib.Path(sys.argv[1]); files=pathlib.Path(sys.argv[2]).read_text(encoding="utf-8").splitlines(); z=zipfile.ZipFile(sys.argv[3],"w",zipfile.ZIP_DEFLATED); [z.write(root/f,f) for f in files]; z.close(); z=zipfile.ZipFile(sys.argv[3]); assert z.testzip() is None; print(len(z.namelist())); z.close()',
  root, path.join(output, 'source-files.txt'), path.join(output, 'source.zip')], { cwd: root, windowsHide: true }).toString().trim());
if (count !== files.length) throw new Error('Source archive file count mismatch.');
const installerName = `pikaqiufanyiqi-${version}-Setup.exe`;
const installer = path.join(root, 'release', installerName);
fs.copyFileSync(installer, path.join(output, installerName));
if (hash(installer) !== hash(path.join(output, installerName))) throw new Error('Installer copy mismatch.');
fs.copyFileSync(path.join(root, `恢复点_${name}.md`), path.join(output, '恢复说明.md'));
fs.copyFileSync(path.join(root, '.recovery/2026-10-01_0.2.2/evidence/previous-suite-manifest.json'), path.join(evidence, 'previous-suite-manifest.json'));
for (const test of ['test-web-missing-translation-refresh.mjs', 'test-web-bubble-refresh-layout.mjs', 'test-signal-missing-translation-refresh.cjs', 'test-signal-live-translation-queue.cjs', 'test-development-prompt-isolation.mjs', 'test-whatsapp-long-message.mjs']) {
  const result = execFileSync(process.execPath, [path.join(root, 'tools', test)], { cwd: root, windowsHide: true }).toString('utf8');
  fs.writeFileSync(path.join(evidence, test + '.txt'), result);
}
const compatibility = execFileSync(process.execPath, [path.join(root, 'tools/test-packaged-update-license.mjs'), path.join(evidence, 'previous-suite-manifest.json'), path.join(root, 'release/win-unpacked/resources')], { cwd: root, windowsHide: true }).toString('utf8');
fs.writeFileSync(path.join(evidence, 'packaged-update-license.txt'), compatibility);
const entries = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else entries.push({ path: path.relative(output, file).replaceAll('\\', '/'), bytes: fs.statSync(file).size, sha256: hash(file) });
  }
}
collect(output);
for (const entry of entries) if (hash(path.join(output, entry.path)) !== entry.sha256) throw new Error('Checkpoint checksum mismatch.');
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ status: 'complete', version, suiteId: '572987197', createdAt: new Date().toISOString(), sourceFileCount: files.length, acceptance: { signal: 'user-accepted', telegram: 'user-accepted', whatsapp: 'latest-fix-awaiting-user-acceptance' }, encryptedIdentityBackup: 'Windows DPAPI CurrentUser; original Windows user required', files: entries }, null, 2));
console.log(JSON.stringify({ checkpoint: output, status: 'complete', sourceFiles: files.length, archivedFiles: entries.length, checksumVerification: 'passed' }));

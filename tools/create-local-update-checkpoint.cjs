const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.recovery', '2026-10-01_0.2.2');
const installerName = 'pikaqiufanyiqi-0.2.2-Setup.exe';
const expectedHash = '9aef938060ef473f4dd102681f1d6e36e4564248d107328a74ceec6a5daf2eb3';
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
fs.mkdirSync(path.join(output, 'evidence'), { recursive: true });
if (fs.existsSync(path.join(output, 'manifest.json'))) throw new Error('Checkpoint already sealed; refusing to overwrite.');
if (!fs.existsSync(path.join(output, 'suite-secrets.dpapi'))) throw new Error('Encrypted identity backup is required first.');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
for (const file of files) {
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..') || /^(?:\.recovery|\.package-secrets|\.tmp|release|node_modules)[\\/]/.test(file)) throw new Error('Unexpected source archive path');
}
const list = path.join(output, 'source-files.txt');
fs.writeFileSync(list, files.join('\n') + '\n');
const archiveCount = Number(execFileSync('python', ['-c',
  'import sys,zipfile,pathlib; root=pathlib.Path(sys.argv[1]); files=pathlib.Path(sys.argv[2]).read_text(encoding="utf-8").splitlines(); z=zipfile.ZipFile(sys.argv[3],"w",zipfile.ZIP_DEFLATED); [z.write(root/f,f) for f in files]; z.close(); z=zipfile.ZipFile(sys.argv[3]); assert z.testzip() is None; print(len(z.namelist())); z.close()',
  root, list, path.join(output, 'source.zip')], { cwd: root, windowsHide: true }).toString().trim());
if (archiveCount !== files.length) throw new Error('Source archive entry count mismatch');
const installer = path.join(root, 'release', installerName);
if (hash(installer) !== expectedHash) throw new Error('Installer no longer matches accepted build');
fs.copyFileSync(installer, path.join(output, installerName));
fs.copyFileSync(path.join(root, '恢复点_2026-10-01_0.2.2.md'), path.join(output, '恢复说明.md'));
fs.copyFileSync(path.join(root, 'release', '更新验收说明.md'), path.join(output, 'evidence', '更新验收说明.md'));
fs.copyFileSync('D:/taozhuang/taozhuang999_9_25_14.32/suite-manifest.json', path.join(output, 'evidence', 'previous-suite-manifest.json'));
for (const file of ['smart-reply-translation-baseline.json', 'smart-reply-translation-results.json', 'web-send-guard-baseline.json', 'web-send-guard-results.json']) {
  fs.copyFileSync(path.join(root, '.tmp', file), path.join(output, 'evidence', file));
}
const entries = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(file);
    else entries.push({ path: path.relative(output, file).replaceAll('\\', '/'), bytes: fs.statSync(file).size, sha256: hash(file) });
  }
}
collect(output);
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ status: 'complete', version: '0.2.2', suiteId: '572987197', createdAt: new Date().toISOString(), sourceFileCount: files.length, encryptedIdentityBackup: 'Windows DPAPI CurrentUser; original Windows user required', files: entries }, null, 2));
for (const entry of entries) if (hash(path.join(output, entry.path)) !== entry.sha256) throw new Error('Checkpoint checksum mismatch');
console.log(JSON.stringify({ checkpoint: output, status: 'complete', sourceFiles: files.length, archivedFiles: entries.length, checksumVerification: 'passed' }));

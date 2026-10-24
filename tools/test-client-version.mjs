import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const packageLock = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package-lock.json'), 'utf8'));
const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const clientVersionSource = fs.readFileSync(path.join(projectRoot, 'src', 'client-version.ts'), 'utf8');
const clientBuilder = fs.readFileSync(
  path.join(projectRoot, 'electron-builder.client-suite.cjs'),
  'utf8'
);

const expectedVersion = packageJson.version;
assert.match(expectedVersion, /^\d+\.\d+\.\d+$/);
assert.match(clientVersionSource, /export const clientVersion = '1\.6\.16';/);
assert.equal(packageJson.build.buildVersion, '1.6.16');
assert.equal(packageJson.shortVersionWindows, '1.6.16');

assert.equal(packageJson.version, expectedVersion);
assert.equal(packageLock.version, expectedVersion);
assert.equal(packageLock.packages?.['']?.version, expectedVersion);
assert.ok(packageJson.build.files.includes('dist-electron/main.js'));
assert.ok(!packageJson.build.files.includes('dist-electron/profile-data-cleanup.js'));
assert.ok(appSource.includes("import { clientVersion } from './client-version';"));
assert.ok(appSource.includes('<span>V{{ clientVersion }}</span>'));
assert.ok(appSource.includes('皮卡丘翻译器 V{{ clientVersion }}'));
assert.ok(appSource.includes('皮卡丘翻译器 v{{ clientVersion }}'));
assert.doesNotMatch(appSource, /V0\.1\.2/);
assert.match(clientBuilder, /buildVersion: '1\.6\.16'/);
assert.match(clientBuilder, /artifactName: 'pikaqiufanyiqi-\$\{buildVersion\}-Setup\.\$\{ext\}'/);

console.log('client-version: package, lock file, client UI, and installer artifact contracts passed');

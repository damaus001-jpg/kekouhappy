import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => readFileSync(path.join(projectRoot, ...parts));
const main = read('electron', 'main.ts').toString('utf8');
const packageJson = JSON.parse(read('package.json').toString('utf8'));
const require = createRequire(import.meta.url);

process.env.MAOYI_CLIENT_BUILD_OUTPUT = path.join(projectRoot, '.tmp', 'windows-app-identity-test');
const clientSuiteBuilder = require(path.join(projectRoot, 'electron-builder.client-suite.cjs'));

const packagedAppId = 'com.maoyi.translator';
const developerAppId = 'com.maoyi.translator.developer';
const sourceIcon = 'src/assets/pikachu-translator.ico';
const packagedIcon = 'pikachu-translator.ico';

assert.equal(packageJson.build.appId, packagedAppId);
assert.equal(clientSuiteBuilder.appId, packagedAppId);
assert.equal(packageJson.build.win.icon, sourceIcon);
assert.equal(clientSuiteBuilder.win.icon, sourceIcon);

for (const [label, resources] of [
  ['default builder', packageJson.build.extraResources],
  ['suite builder', clientSuiteBuilder.extraResources]
]) {
  assert.ok(
    resources.some(resource => resource?.from === sourceIcon && resource?.to === packagedIcon),
    `${label} must package the enterprise taskbar icon as a stable resource`
  );
}

for (const marker of [
  `const windowsPackagedAppUserModelId = '${packagedAppId}';`,
  `const windowsDeveloperAppUserModelId = '${developerAppId}';`,
  `const packagedApplicationIconFileName = '${packagedIcon}';`,
  'app.isPackaged ? windowsPackagedAppUserModelId : windowsDeveloperAppUserModelId',
  "join(__dirname, '../src/assets/pikachu-translator.ico')",
  'nativeImage.createFromPath(applicationIconPath)',
  'icon: applicationIcon,',
  'mainWindow.setIcon(applicationIcon)',
  'applyTaskbarUnreadOverlay();'
]) {
  assert.ok(main.includes(marker), `main process is missing Windows identity marker: ${marker}`);
}
const createWindowStart = main.indexOf('async function createWindow()');
const createWindowEnd = main.indexOf('\nasync function ', createWindowStart + 1);
const createWindowSource = main.slice(createWindowStart, createWindowEnd);
assert.ok(
  createWindowSource.indexOf('mainWindow.setIcon(applicationIcon)') <
    createWindowSource.indexOf('applyTaskbarUnreadOverlay();'),
  'the enterprise base icon must be applied before the unread-count overlay'
);

const ico = read('src', 'assets', 'pikachu-translator.ico');
assert.equal(ico.readUInt16LE(0), 0, 'ICO reserved header must be zero');
assert.equal(ico.readUInt16LE(2), 1, 'enterprise taskbar asset must be an ICO file');
const entryCount = ico.readUInt16LE(4);
assert.ok(entryCount >= 6, 'enterprise ICO must include at least six Windows icon sizes');
const sizes = new Set();
for (let index = 0; index < entryCount; index += 1) {
  const offset = 6 + index * 16;
  const width = ico[offset] || 256;
  const height = ico[offset + 1] || 256;
  const bitsPerPixel = ico.readUInt16LE(offset + 6);
  if (width === height && bitsPerPixel === 32) sizes.add(width);
}
for (const size of [16, 32, 48, 64, 128, 256]) {
  assert.ok(sizes.has(size), `enterprise ICO must include the required ${size}x${size} Windows taskbar size`);
}

console.log('windows-app-identity: enterprise icon, packaged/developer identity isolation, installer resources, and unread overlay ordering passed');

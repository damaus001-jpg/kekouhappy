import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guard = fs.readFileSync(path.join(projectRoot, 'electron', 'webview-send-guard-preload.cjs'), 'utf8');
const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');
const app = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const clientSuiteBuilder = fs.readFileSync(path.join(projectRoot, 'electron-builder.client-suite.cjs'), 'utf8');

assert.match(guard, /2026-10-01-webview-preload-phone-and-chinese-send-v3/);
assert.match(guard, /conversation-compose-box-input/);
assert.match(guard, /media-caption-input-container/);
assert.match(guard, /simple-message-input-input/);
assert.match(guard, /new-message-wrapper/);
assert.match(guard, /event\.isComposing \|\| event\.keyCode === 229/);
assert.ok((guard.match(/if \(!event\.isTrusted\) return;/g) || []).length >= 4);
assert.match(guard, /compositionend/);
assert.match(guard, /insertLineBreak/);
assert.match(guard, /insertParagraph/);
assert.match(guard, /event\.preventDefault\(\)/);
assert.match(guard, /event\.stopImmediatePropagation\(\)/);
assert.match(guard, /Keep the browser's default IME commit/);
assert.match(guard, /addEventListener\('keypress', handleKeydown, true\)/);
assert.match(guard, /addEventListener\('keyup', handleKeydown, true\)/);
assert.match(guard, /ipcRenderer\.sendToHost\('df-translator'/);
assert.match(guard, /action: 'translate'/);
assert.match(guard, /action: 'enter-only-hint'/);
assert.match(guard, /action: 'web-enter-guard-debug'/);
assert.match(guard, /action: 'web-enter-guard-ready'/);
assert.match(guard, /setInterval\(announceGuardReady, 5000\)/);
assert.doesNotMatch(guard, /console\.(?:log|debug|info|warn|error)/);

assert.match(main, /const webviewSendGuardPreloadPath = join\(__dirname, '\.\.\/electron\/webview-send-guard-preload\.cjs'\)/);
assert.match(main, /webPreferences\.preload = webviewSendGuardPreloadPath/);
assert.doesNotMatch(main, /delete webPreferences\.preload/);
assert.match(app, /ipcEvent\.channel \|\| ipcEvent\.detail\?\.channel/);
assert.match(app, /payload\.action === 'web-enter-guard-debug'/);
assert.match(app, /type: 'web-enter-preload-guard'/);
assert.match(app, /payload\.action === 'web-enter-guard-ready'/);
assert.match(app, /webviewPreloadGuardStatus\.set\(profile\.id/);
assert.match(app, /前置守卫 \$\{preloadGuardLoaded \? `已加载/);
assert.match(app, /Date\.now\(\) - preloadGuard\.lastSeenAt <= 12_000/);
assert.ok(packageJson.build.files.includes('electron/webview-send-guard-preload.cjs'));
assert.match(clientSuiteBuilder, /'electron\/webview-send-guard-preload\.cjs'/);

console.log('webview-send-guard-preload: early WhatsApp and Telegram Chinese-send guard contracts passed');

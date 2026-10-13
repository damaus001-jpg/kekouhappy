import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const main = readFileSync(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');
const preload = readFileSync(path.join(projectRoot, 'electron', 'preload.ts'), 'utf8');

assert.match(main, /runtimeLoggingEnabled[\s\S]*?type: 'telegram-enter-keydown'[\s\S]*?sequence: enterSequence/);
assert.match(main, /contents\.on\('before-input-event', \(_event, input\) => \{/);
const diagnosticStart = main.indexOf("if ((platform === 'telegram-k' || platform === 'telegram-a') && runtimeLoggingEnabled)");
const diagnosticEnd = main.indexOf('\n    }', diagnosticStart) + 6;
assert.ok(diagnosticStart >= 0 && diagnosticEnd > diagnosticStart);
const diagnosticBlock = main.slice(diagnosticStart, diagnosticEnd);
assert.doesNotMatch(main, /telegramMediaCaptionStates|telegramMediaCaptionProfileIds/);
assert.doesNotMatch(diagnosticBlock, /preventDefault|webContents\.send|executeJavaScript/);
assert.doesNotMatch(main, /telegram:media-caption-enter|telegram:media-caption-state/);
assert.doesNotMatch(preload, /telegram:media-caption-enter|telegram:media-caption-state/);

assert.match(app, /const telegramPageGuardVersion = '2026-10-11-telegram-stable-conversation-v60';/);
assert.match(app, /const beginTelegramEnterTrace = \(event\) => \{/);
assert.match(app, /window\.__dfTelegramEnterCount = sequence/);
assert.match(app, /action: 'telegram-enter-debug'/);
assert.match(app, /type: 'telegram-enter-decision'/);
assert.doesNotMatch(app, /__dfHandleTelegramMediaHostEnter|telegram-media-caption-state/);
assert.doesNotMatch(app, /setTelegramMediaCaptionState|onTelegramMediaCaptionEnter/);

console.log('telegram-host-enter-gate: main-process interception is removed; developer builds only count physical Enter presses');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const section = (start, end) => {
  const startAt = appSource.indexOf(start);
  const endAt = appSource.indexOf(end, startAt + start.length);
  assert.ok(startAt >= 0 && endAt > startAt, `missing section: ${start}`);
  return appSource.slice(startAt, endAt);
};

assert.match(appSource, /2026-10-11-telegram-stable-conversation-v60/);
assert.match(appSource, /2026-10-15-signal-emoji-scope-v22/);

const sharedQueue = section('function enqueueComposerTranslation(', 'function enqueueMessageTranslationTask(');
assert.doesNotMatch(appSource, /function enqueueTelegramComposerTranslation/);
assert.match(sharedQueue, /const dedupeKey = `composer:\$\{stateKey\}:\$\{requestId\}`/);
assert.match(sharedQueue, /buildComposerRequestMatchScript\(requestId\)/);
assert.match(sharedQueue, /const isTelegramProfile = isTelegramPlatform\(currentProfile\.platform\)/);
assert.match(sharedQueue, /const webComposerWasReplaced = currentProfile\.platform !== 'signal' &&\s*!isTelegramProfile/);
assert.match(sharedQueue, /signalComposerWasReplaced[\s\S]*?currentComposerText !== text/);
assert.match(sharedQueue, /webComposerWasReplaced[\s\S]*?!requestStillCurrent[\s\S]*?currentComposerText !== text/);

const pageFlow = section('const queueNativeTranslate = (event, target = composer) => {', 'const isNativeSendButton = (button) => {');
assert.match(pageFlow, /const liveText = getComposerText\(target\);/);
assert.match(pageFlow, /const normalizedLiveText = liveText\.replace/);
assert.match(pageFlow, /if \(normalizedLiveText === normalizedReadyText\)/);
assert.match(pageFlow, /delete target\.dataset\.dfTranslatedReady/);
assert.match(pageFlow, /target\.dataset\.dfTranslationPending = normalizedText/);

console.log('composer-draft-replacement: Telegram legacy request binding plus WhatsApp and Signal stale-result rejection contracts passed');

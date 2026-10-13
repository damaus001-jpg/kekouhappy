import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const main = readFileSync(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');

const between = (start, end) => {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing source range: ${start}`);
  return app.slice(from, to);
};

const sharedQueue = between('function enqueueComposerTranslation(', 'function enqueueMessageTranslationTask(');
const pageFlow = between('const queueNativeTranslate = (event, target = composer) => {', 'const isNativeSendButton = (button) => {');
const sendFlow = between("if (action === 'send') {", 'async function snapshotOutgoingMessageKeys(');

assert.doesNotMatch(app, /function enqueueTelegramComposerTranslation/);
assert.match(sharedQueue, /const shouldReview = isSignalProfile && signalReviewEnabled/);
assert.match(sharedQueue, /from: 'Chinese',[\s\S]*?to: 'English'/);
assert.match(sharedQueue, /const isTelegramProfile = isTelegramPlatform\(currentProfile\.platform\)/);
assert.match(sharedQueue, /const webComposerWasReplaced = currentProfile\.platform !== 'signal' &&\s*!isTelegramProfile/);
assert.match(sharedQueue, /writeNativeComposer\(profile\.id, englishText, \{ instant: true, composerKind, requestId: effectiveRequestId \}\)/);
assert.match(sharedQueue, /focusWebviewNativeComposer\(profile\.id, composerKind, effectiveRequestId\)/);
assert.match(sharedQueue, /if \(!currentShouldReview\)[\s\S]*?reviewStatus: 'hidden'/);

assert.match(pageFlow, /if \(isDirectSendHttpUrl\(liveText\)\)[\s\S]*?sendTelegramMediaCaptionDirect\(event, target\)[\s\S]*?return false;/);
assert.match(app, /const sendTelegramMediaCaptionDirect = \(event, target\) => \{[\s\S]*?\.simple-message-input-confirm[\s\S]*?window\.__dfTranslatorProgrammaticSend = true;[\s\S]*?sendButton\.click\(\)/);
assert.match(pageFlow, /if \(!\/\[\\\\u4e00-\\\\u9fff\]\/\.test\(liveText\)\) \{[\s\S]*?sendTelegramMediaCaptionDirect\(event, target\)/);
assert.match(pageFlow, /if \(telegramComposerMode\) \{/);
assert.match(pageFlow, /if \(!\/\[\\\\u4e00-\\\\u9fff\]\/\.test\(liveText\)\) \{[\s\S]*?if \(isMediaCaptionComposer\(target\)\)[\s\S]*?return false;/);
assert.match(pageFlow, /stopSendEvent\(event\);[\s\S]*?queueEvent\(\{ action: 'translate', text: liveText, requestId, composerKind \}\)/);
assert.match(pageFlow, /dfTranslatedReady[\s\S]*?queueEvent\(\{ action: 'send', text: translatedReady, requestId, composerKind \}\)/);
assert.doesNotMatch(sendFlow, /sendTelegramComposerTranslation/);
assert.match(sendFlow, /authorizeTranslatedSend/);
assert.match(sendFlow, /sendNativeComposer\(profileId, text\)/);
assert.match(main, /const isWebComposerEnter = request\.reason === 'composer-enter'/);
assert.match(main, /request\.platform === 'whatsapp'/);
assert.match(
  main,
  /const approvedText = isWebComposerEnter \|\| isSignalChineseToEnglish[\s\S]*?\? translatedText[\s\S]*?: request\.text;/
);
assert.match(app, /if \(telegramComposerMode\) \{[\s\S]*?document\.getElementById\('df-composer-review'\)\?\.remove\(\);/);
assert.match(app, /const telegramPageGuardVersion = '2026-10-11-telegram-stable-conversation-v60';/);
assert.match(pageFlow, /window\.__dfTelegramMediaCaptionReady/);
assert.match(pageFlow, /mediaCaptionReadyMatches/);
assert.match(pageFlow, /mediaCaptionReady\?\.requestId/);

console.log('telegram-no-backtranslation: one page state machine handles normal/media Chinese double-Enter and direct English/digit/URL send');

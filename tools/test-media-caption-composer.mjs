import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const between = (start, end) => {
  const from = app.indexOf(start);
  const to = app.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing source range: ${start}`);
  return app.slice(from, to);
};

const detector = between('function isMediaCaptionComposerFromDom', 'function buildMediaCaptionComposerSource');
assert.match(detector, /\.input-message-container\.simple-message-input-inputs/);
assert.match(detector, /\[data-testid="media-caption-input-container"\]\[contenteditable="true"\]\[role="textbox"\]/);
assert.match(detector, /closest\?\.\('\.simple-message-input-container'\)/);
assert.match(detector, /querySelector\?\.\('\.simple-message-input-confirm'\)/);
assert.match(detector, /\[data-animation-group="NEW-MEDIA"\]\[contenteditable="true"\]/);
assert.match(detector, /:not\(\.input-field-input-fake\):not\(\.input-message-input-fake\)/);

assert.doesNotMatch(app, /telegramMediaCaptionDisableVersion|installTelegramMediaCaptionDisable|dfMediaCaptionDisabled/);
assert.doesNotMatch(app, /\.simple-message-input-container >[\s\S]{0,120}?\.input-message-container\.simple-message-input-inputs \{[\s\S]{0,200}?display: none !important;/);
assert.match(app, /const findVisibleTelegramMediaCaptionComposer = \(\) => \{[\s\S]*?const findNativeComposer = \(\) => \{\s*const mediaCaptionComposer = findVisibleTelegramMediaCaptionComposer\(\);\s*if \(mediaCaptionComposer\) return mediaCaptionComposer;/);
assert.match(app, /\.simple-message-input-input\[data-animation-group="NEW-MEDIA"\]\[contenteditable="true"\]/);
assert.match(app, /const resolveNativeComposerForEnter = \(event\) => \{\s*const mediaCaptionComposer = findVisibleTelegramMediaCaptionComposer\(\);\s*if \(mediaCaptionComposer\) return mediaCaptionComposer;/);
assert.match(app, /const composerKind = telegramComposerMode && isMediaCaptionComposer\(target\)[\s\S]*?'telegram-media-caption'/);
assert.doesNotMatch(app, /if \(composerKind === 'telegram-media-caption'\) startTelegramMediaCaptionFocusGuard\(target, requestId\);/);
assert.match(app, /queueEvent\(\{ action: 'translate', text: liveText, requestId, composerKind \}\)/);
assert.match(app, /const handleTelegramMediaCaptionLike008 = \(event, target\) => \{[\s\S]*?event\?\.key === 'Enter'[\s\S]*?event\?\.inputType === 'insertLineBreak'[\s\S]*?event\?\.inputType === 'insertParagraph'/);
assert.match(app, /const handled = queueNativeTranslate\(event, target\);[\s\S]*?'008-media-caption-handled' : '008-media-caption-native'/);
assert.match(app, /const nativeGuardVersion = telegramComposerMode[\s\S]*?telegramPageGuardVersion/);
assert.doesNotMatch(app, /window\.__dfHandleTelegramMediaHostEnter|host-media-caption|__dfTelegramMediaHostCompositionPending/);
assert.ok((app.match(/handleTelegramMediaCaptionLike008\(event,/g) || []).length >= 5);
assert.match(app, /document\.addEventListener\('keydown', window\.__dfNativeEnterKeydownHandler, true\)/);
assert.match(app, /document\.addEventListener\('beforeinput', window\.__dfNativeEnterBeforeInputHandler, true\)/);
assert.match(app, /const mediaCaptionConfirm = telegramComposerMode[\s\S]*?event\.target\?\.closest\?\.\('\.simple-message-input-confirm'\)/);
assert.match(app, /if \(mediaCaptionConfirm\) \{[\s\S]*?if \(mediaCaptionComposer && !getComposerText\(mediaCaptionComposer\)\.trim\(\)\) \{[\s\S]*?allowed-empty-media-caption-confirm[\s\S]*?return;[\s\S]*?stopSendEvent\(event\);[\s\S]*?blocked-media-caption-confirm-use-enter/);
assert.match(app, /if \(window\.__dfTranslatorProgrammaticSend\) return;[\s\S]*?if \(mediaCaptionConfirm\)/);
assert.match(app, /2026-10-11-telegram-stable-conversation-v60/);
assert.match(app, /window\.__dfTelegramMediaCaptionReady = \{[\s\S]*?text: payload\.state\.translated[\s\S]*?requestId:/);
assert.match(app, /if \(!findVisibleTelegramMediaCaptionComposer\(\)\) \{[\s\S]*?delete window\.__dfTelegramMediaCaptionReady;[\s\S]*?delete window\.__dfTelegramMediaCaptionPending;/);
assert.match(app, /const scheduleTelegramMediaCaptionRefocus = \(expectedText\) => \{[\s\S]*?requestAnimationFrame\(refocus\)[\s\S]*?\[30, 90, 180\]/);
assert.match(app, /scheduleTelegramMediaCaptionRefocus\(payload\.state\.translated\)/);
assert.match(app, /focusVisibleTelegramMediaCaptionComposer[\s\S]*?target\.focus\(\{ preventScroll: true \}\)[\s\S]*?range\.collapse\(false\)/);
assert.match(app, /const mediaCaptionSendButton = isMediaCaptionComposer\(composer\)[\s\S]*?\.simple-message-input-confirm/);
assert.match(app, /const sendButton = mediaCaptionSendButton \|\|/);
assert.match(app, /const sendTelegramMediaCaptionDirect = \(event, target\) => \{[\s\S]*?stopSendEvent\(event\);[\s\S]*?\.simple-message-input-confirm[\s\S]*?sendButton\.click\(\)/);
assert.match(app, /event\.__dfTelegramMediaDirectSendHandled = true/);
assert.doesNotMatch(app, /action: 'telegram-media-caption-state'|setTelegramMediaCaptionState/);
assert.match(app, /writeNativeComposer\(profile\.id, englishText, \{ instant: true, composerKind, requestId: effectiveRequestId \}\)/);
assert.match(app, /composerKind === 'telegram-media-caption' && !stateApplied/);
assert.match(app, /focusWebviewNativeComposer\(profile\.id, composerKind, effectiveRequestId\)/);
assert.match(app, /payload\.composerKind === 'telegram-media-caption'\) return mediaCaptionComposer/);
assert.match(app, /payload\.composerKind === 'telegram-media-caption' && payload\.requestId[\s\S]*?return requestBoundMediaCaptionComposer \|\| recoveredMediaCaptionComposer/);
assert.match(app, /if \(requestBoundMediaCaptionComposer\) return requestBoundMediaCaptionComposer/);
assert.match(app, /payload\.state\.composerKind === 'telegram-media-caption'\) return mediaCaptionCandidates\[0\] \|\| null/);
assert.match(app, /element\.dataset\.dfTranslatorRequestId === requestId[\s\S]*?element\.dataset\.dfTranslatorReadyRequestId === requestId/);
assert.match(app, /composerKind === 'telegram-media-caption' && !composer\) return/);
assert.match(app, /payload\.composerKind === 'telegram-media-caption'\s*\?\s*'telegram-media-caption-bound-composer-not-found'/);
assert.match(app, /payload\.action === 'write' && payload\.composerKind !== 'telegram-media-caption'/);
assert.match(app, /window\.__dfTelegramMediaCaptionPending = \{[\s\S]*?requestId,[\s\S]*?sourceText: normalizedText/);
assert.ok(
  (app.match(/\)\)\.filter\(\(element\) => element\.isConnected && isMediaCaptionComposer\(element\)\)/g) || []).length >= 3,
  'media-caption write, focus, and state recovery must not reject the exact Telegram caption node during transition visibility changes'
);
assert.doesNotMatch(app, /setInterval\([^)]*focusWebviewNativeComposer|setInterval\([^)]*buildNativeComposerFocusScript/);
const composerScript = between(
  'function buildComposerScript(',
  'function buildNativeComposerHelpersScript'
);
assert.equal(
  (composerScript.match(/const mediaCaptionCandidates =/g) || []).length,
  1,
  'composer write script must contain one media-caption candidate declaration'
);
assert.match(app, /if \(webSendGuardPlatform === 'telegram'\) \{\s*if \(isMediaCaptionComposer\(target\)\) \{\s*return null;/);

console.log('media-caption-composer: suite 008 single-state-machine behavior is restored for editable Telegram media captions without backtranslation');

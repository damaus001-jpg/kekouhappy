import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDirectSendHttpUrl } from '../dist-electron/shared.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8').replace(/\r\n/g, '\n');

const section = (start, end) => {
  const startAt = appSource.indexOf(start);
  assert.notEqual(startAt, -1, `missing section start: ${start}`);
  const endAt = appSource.indexOf(end, startAt + start.length);
  assert.notEqual(endAt, -1, `missing section end: ${end}`);
  return appSource.slice(startAt, endAt);
};

assert.match(appSource, /2026-10-11-telegram-stable-conversation-v60/);
assert.match(appSource, /2026-10-15-signal-emoji-scope-v22/);
assert.equal(isDirectSendHttpUrl('https://example.com/path?a=1#top'), true);
assert.equal(isDirectSendHttpUrl('http://example.com'), true);
assert.equal(isDirectSendHttpUrl('www.example.com/path?a=1'), true);
assert.equal(isDirectSendHttpUrl('WWW.Example.COM'), true);
assert.equal(isDirectSendHttpUrl('www'), false);
assert.equal(isDirectSendHttpUrl('www.'), false);
assert.equal(isDirectSendHttpUrl('example.com'), false);
assert.equal(isDirectSendHttpUrl('请看 https://example.com'), false);
assert.equal(isDirectSendHttpUrl('https://example.com\n谢谢'), false);
assert.ok(
  (appSource.match(/const isPlainSendEnter = \(event\) => Boolean\(/g) || []).length >= 2,
  'web platforms and Signal must both define plain-Enter-only dispatch'
);
const signalBlockOnly = section(
  'const blockOnlyHandler = (event) => {',
  'const addListeners = (target) => {'
);
assert.match(
  signalBlockOnly,
  /const text = getText\(composer\)\.trim\(\);[\s\S]*?if \(isDirectSendHttpUrl\(text\)\) return;[\s\S]*?hasEnglish\(text\)/,
  'Signal keypress and keyup guards must allow a complete standalone URL before the English-text block'
);
assert.match(
  appSource,
  /const previous = target\.__dfSignalEnterListeners;[\s\S]*?removeEventListener\('keydown', previous\.handler, true\)[\s\S]*?target\.__dfSignalEnterListeners = \{/,
  'Signal must retain listener references and remove the previous injected listener set during upgrades'
);
assert.ok(
  (appSource.match(/if \(!listenerIsCurrent\(\)\) return;/g) || []).length >= 5,
  'superseded Signal listener sets must become inert after a newer injection version is installed'
);
assert.ok(
  (appSource.match(/!event\.shiftKey &&[\s\S]{0,100}!event\.ctrlKey &&[\s\S]{0,100}!event\.altKey &&[\s\S]{0,100}!event\.metaKey/g) || []).length >= 2,
  'plain Enter must exclude Shift, Ctrl, Alt, and Meta modifiers everywhere'
);
assert.ok(
  (appSource.match(/event\.isComposing[\s\S]{0,50}event\.keyCode !== 229/g) || []).length >= 2,
  'IME composition Enter must not be mistaken for a send request'
);
assert.ok(
  (appSource.match(/shouldAllowShiftLineBreak\(event,/g) || []).length >= 3,
  'Shift+Enter must remain the intentional line-break path'
);
assert.match(
  appSource,
  /const resolveNativeComposerForEnter = \(event\) => \{[\s\S]*?candidates\.find\(\(candidate\) => Boolean\(getComposerText\(candidate\)\.trim\(\)\)\)/,
  'Telegram Enter must prefer the live editable candidate that actually contains the draft'
);
assert.ok(
  (appSource.match(/if \(isDirectSendHttpUrl\(/g) || []).length >= 4,
  'web platforms and Signal must bypass translation and backtranslation for a complete standalone URL'
);
assert.match(
  appSource,
  /const pendingIsLive = target\.dataset\.dfTranslationPending === normalizedText &&[\s\S]*?Date\.now\(\) - pendingAt < 15000;[\s\S]*?delete target\.dataset\.dfTranslationPending;/,
  'a stale web translation marker must expire instead of permanently swallowing Enter'
);
assert.match(
  appSource,
  /window\.addEventListener\('keydown', window\.__dfNativeEnterKeydownHandler, true\)/,
  'the web Enter guard must capture at window before Telegram document handlers can send the draft'
);
assert.match(
  appSource,
  /for \(const candidate of listNativeComposerCandidates\(\)\) \{[\s\S]*?if \(getComposerText\(candidate\)\.trim\(\)\) continue;[\s\S]*?delete candidate\.dataset\.dfTranslationPending;/,
  'installing a newer guard must clear orphaned pending state from empty composers'
);

const webOverlayClick = section(
  "overlay.addEventListener('click', (event) => {",
  "}, true);\n      }\n      overlay.__dfComposer"
);
assert.match(webOverlayClick, /showEnterOnlyHint\(guardedComposer\)/);
assert.doesNotMatch(webOverlayClick, /queueNativeTranslate|queueEvent\(\{ action: 'send'/);

const webClickGuard = section(
  'window.__dfNativeClickGuardHandler = (event) => {',
  'window.__dfNativePointerGuardHandler = window.__dfNativeClickGuardHandler;'
);
assert.match(webClickGuard, /if \(window\.__dfTranslatorProgrammaticSend\) return;/);
assert.match(webClickGuard, /if \(mediaCaptionConfirm\) \{[\s\S]*?if \(mediaCaptionComposer && !getComposerText\(mediaCaptionComposer\)\.trim\(\)\) \{[\s\S]*?allowed-empty-media-caption-confirm[\s\S]*?return;[\s\S]*?stopSendEvent\(event\);[\s\S]*?showEnterOnlyHint\(mediaCaptionComposer \|\| null\)/);
assert.match(webClickGuard, /blocked-media-caption-confirm-use-enter/);
assert.match(webClickGuard, /stopSendEvent\(event\)/);
assert.match(webClickGuard, /showEnterOnlyHint\(targetComposer\)/);
assert.doesNotMatch(webClickGuard, /queueEvent\(\{ action: 'send'/);

const signalPointerGuard = section(
  'const sendPointerHandler = (event) => {',
  'const rememberComposerText = (event) => {'
);
assert.match(signalPointerGuard, /CompositionArea__edit-button--accept/);
assert.match(signalPointerGuard, /stopSendEvent\(event\)/);
assert.match(signalPointerGuard, /queueEnterOnlyHint\(\)/);
assert.doesNotMatch(signalPointerGuard, /queueSend\(|blockAndTranslate\(|handleSensitiveSend\(/);

assert.match(
  appSource,
  /if \(action === 'enter-only-hint'\) \{[\s\S]*?setComposerStatus\(profileId, '请按回车键发送'\)/,
  'blocked pointer and modified-Enter attempts must produce a visible renderer hint'
);
assert.match(
  appSource,
  /if \(window\.__dfTranslatorProgrammaticSend\) return;/,
  'the internal send that follows an accepted Enter action must remain possible'
);
assert.match(
  appSource,
  /const hasTextDraft = Boolean\(getText\(composer\)\.trim\(\)\)[\s\S]*?if \(!hasTextDraft\) return;/,
  'Signal must leave non-text controls alone when the composer has no text-send state'
);

console.log('enter-only-send: web, Signal, modifier, IME, pointer, and non-text contracts passed');

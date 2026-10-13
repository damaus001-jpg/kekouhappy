import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { isBlockedPhoneNumberText, blockedPhoneNumberMessage, inspectSensitiveSendText } from '../dist-electron/payment-address.js';

const app = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
const guard = fs.readFileSync(new URL('../electron/webview-send-guard-preload.cjs', import.meta.url), 'utf8');
const stateStart = app.indexOf("  if (payload.action === 'state' && Object.prototype.hasOwnProperty.call(payload.state, 'sensitiveToken')) {");
const stateEnd = app.indexOf('  const parts = ensureHost();', stateStart);
assert.ok(stateStart > 0 && stateEnd > stateStart);
const applyApproval = new Function('payload', 'findNativeComposer', app.slice(stateStart, stateEnd));
const composer = { dataset: { dfSensitiveReviewPending: 'pending', dfSensitiveDispatchPending: 'old' }, focus() { this.focused = true; } };
const signalStateStart = app.indexOf('  window.__dfSignalApplySensitiveState = (state) => {');
const signalStateEnd = app.indexOf('\n  };', signalStateStart) + 5;
const signalWindow = {};
let signalComposer = composer;
new Function('window', 'listenerIsCurrent', 'findComposer', 'getText', 'readSignalConversationSignature',
  app.slice(signalStateStart, signalStateEnd))(
  signalWindow, () => true, () => signalComposer, () => '123456789012', () => 'signal:chat');
const signalState = { sensitiveToken: 'approval', sensitiveText: '123456789012', conversationSignature: 'signal:chat' };
assert.equal(signalWindow.__dfSignalApplySensitiveState(signalState), true);
assert.equal(signalWindow.__dfSignalApplySensitiveState({ ...signalState, sensitiveText: 'changed' }), false);
assert.equal(signalWindow.__dfSignalApplySensitiveState({ ...signalState, conversationSignature: 'signal:other' }), false);
signalComposer = null;
assert.equal(signalWindow.__dfSignalApplySensitiveState(signalState), false);
signalComposer = composer;
assert.equal(signalWindow.__dfSignalApplySensitiveState({ sensitiveToken: '' }), true);
assert.equal(composer.dataset.dfSensitiveSendToken, undefined);

// The dialog can return before the hidden Signal window has finished restoring.
const retryStart = app.indexOf('function buildSignalSensitiveStateScript(');
const retryEnd = app.indexOf('\nfunction ', retryStart + 1);
const retryBuilderSource = ts.transpile(app.slice(retryStart, retryEnd), { target: ts.ScriptTarget.ES2022 });
const retryBuilder = new Function(retryBuilderSource + '\nreturn buildSignalSensitiveStateScript;')();
let retryCount = 0;
const retryWindow = { __dfSignalApplySensitiveState: () => ++retryCount === 3 };
assert.equal(await new Function('window', 'setTimeout', 'return (' + retryBuilder(signalState) + ');')(
  retryWindow, callback => callback()), true);
assert.equal(retryCount, 3);
assert.equal(applyApproval({ action: 'state', state: { sensitiveToken: 'approval', sensitiveText: '123456789012' } }, () => composer), true);
assert.equal(composer.dataset.dfSensitiveSendToken, 'approval');
assert.equal(composer.focused, true);
assert.equal(composer.dataset.dfSensitiveReviewPending, undefined);

const rememberStart = app.indexOf('  const rememberComposerText = (event) => {');
const rememberEnd = app.indexOf('  const blockOnlyHandler', rememberStart);
let liveText = '123456789012';
const inputWindow = { __dfSetComposerReviewState() {} };
const remember = new Function('window', 'listenerIsCurrent', 'isComposer', 'findComposer', 'getText',
  app.slice(rememberStart, rememberEnd) + '\nreturn rememberComposerText;')(
  inputWindow, () => true, () => true, () => composer, () => liveText);
remember({ target: composer });
assert.equal(composer.dataset.dfSensitiveSendToken, 'approval');
assert.equal(inputWindow.__dfTranslatorQueue, undefined);
liveText = '123456789013';
remember({ target: composer });
assert.equal(composer.dataset.dfSensitiveSendToken, undefined);
assert.equal(inputWindow.__dfTranslatorQueue[0].action, 'sensitive-cancel');
applyApproval({ action: 'state', state: { sensitiveToken: 'approval', sensitiveText: '123456789012' } }, () => composer);

// Exercise the actual Signal second-Enter handler with the installed approval.
const handlerStart = app.indexOf('  const handleSensitiveSend = (event, composer) => {');
const handlerEnd = app.indexOf('  const queueTyping', handlerStart);
const windowMock = {};
const handle = new Function('window', 'getText', 'stopSendEvent', 'readSignalConversationSignature', 'isSensitiveSendCandidate',
  app.slice(handlerStart, handlerEnd) + '\nreturn handleSensitiveSend;')(
  windowMock, () => '123456789012', event => { event.blocked = true; }, () => 'Alice::chat', () => true);
const event = {};
assert.equal(handle(event, composer), true);
assert.equal(event.blocked, true);
assert.equal(windowMock.__dfTranslatorQueue[0].action, 'sensitive-send');
assert.equal(windowMock.__dfTranslatorQueue[0].requestId, 'approval');
handle({}, composer);
assert.equal(windowMock.__dfTranslatorQueue.length, 1);
applyApproval({ action: 'state', state: { sensitiveToken: '' } }, () => composer);
assert.equal(composer.dataset.dfSensitiveSendToken, undefined);
assert.equal(composer.dataset.dfSensitiveDispatchPending, undefined);
assert.equal(applyApproval({ action: 'state', state: { sensitiveToken: 'approval' } }, () => null), false);

const phoneStart = guard.indexOf('function blockPhoneNumberSend(');
const phoneEnd = guard.indexOf('\n}', phoneStart) + 2;
const notifications = [];
const phoneGuard = new Function('readComposerPlainText', 'stopNativeSend', 'blockedPhonePrompts', 'ipcRenderer',
  guard.slice(phoneStart, phoneEnd) + '\nreturn blockPhoneNumberSend;')(
  target => target.text, event => { event.blocked = true; }, new WeakMap(), { sendToHost: (...args) => notifications.push(args) });
for (let length = 1; length <= 11; length += 1) {
  const target = { text: '0'.repeat(length) };
  const event = {};
  assert.equal(phoneGuard(event, target), true);
  assert.equal(event.blocked, true);
  phoneGuard({}, target);
}
assert.equal(notifications.length, 11); // No duplicate popup for the same physical Enter.
assert.equal(phoneGuard({}, { text: '1'.repeat(12) }), false);

const prepareStart = main.indexOf('async function prepareSensitiveSend(');
const prepareEnd = main.indexOf('\nasync function authorizeSensitiveSend(', prepareStart);
const compiled = ts.transpile(main.slice(prepareStart, prepareEnd), { target: ts.ScriptTarget.ES2022 });
let popupCount = 0;
const prepare = new Function('isBlockedPhoneNumberText', 'blockedPhoneNumberMessage', 'showSensitiveSendDialog',
  compiled + '\nreturn prepareSensitiveSend;')(isBlockedPhoneNumberText, blockedPhoneNumberMessage,
  async options => { popupCount += 1; assert.equal(options.message, blockedPhoneNumberMessage); });
for (let length = 1; length <= 11; length += 1) {
  const result = await prepare({ text: '1'.repeat(length), conversationSignature: '' });
  assert.equal(result.ok, false);
  assert.equal(result.token, undefined);
}
assert.equal(popupCount, 11);
const invalidPopups = [];
const prepareInvalid = new Function('isBlockedPhoneNumberText', 'inspectSensitiveSendText', 'showSensitiveSendDialog',
  compiled + '\nreturn prepareSensitiveSend;')(isBlockedPhoneNumberText, inspectSensitiveSendText,
  async options => { invalidPopups.push(options); });
for (const text of [
  'gsfhfsh5jj56r65sd5gsd65jf65fdsfgjsffdgdshfdj',
  `0x${'12'.repeat(19)}`,
  `T${'0'.repeat(33)}`
]) {
  const result = await prepareInvalid({ text, conversationSignature: '' });
  assert.equal(result.ok, false);
  assert.equal(result.token, undefined);
}
assert.equal(invalidPopups.length, 3);
assert.ok(invalidPopups.every(options => options.message === '地址无效或暂不支持，已阻止发送'));
assert.match(invalidPopups[0].detail, /Solana 地址校验失败/);
assert.match(invalidPopups[1].detail, /EVM 地址格式或长度无效/);
assert.match(invalidPopups[2].detail, /TRC20 地址包含无效字符/);
console.log('Phone blocking, native popup, approval installation and second-Enter dispatch checks passed.');

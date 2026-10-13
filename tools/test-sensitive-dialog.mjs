import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const main = fs.readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const start = main.indexOf('const sensitiveDialogResponses = ');
const end = main.indexOf('async function prepareSensitiveSend', start);
const owner = new EventEmitter();
owner.isDestroyed = () => false;
owner.webContents = new EventEmitter();
const sent = [];
owner.webContents.send = (...args) => sent.push(args);
const compiled = ts.transpile(main.slice(start, end), { target: ts.ScriptTarget.ES2022 });
let sequence = 0;
const runtime = new Function('mainWindow', 'randomUUID', compiled + '\nreturn { showSensitiveSendDialog, sensitiveDialogResponses };')(owner, () => String(++sequence));
const options = { title: 'Confirm', message: 'Confirm account', detail: 'Details', buttons: ['Lock', 'Cancel'], cancelId: 1 };
const result = runtime.showSensitiveSendDialog(options);
const payload = sent[0][1];
assert.equal(sent[0][0], 'send-integrity:dialog');
assert.equal(payload.detail, 'Details');
runtime.sensitiveDialogResponses.get(payload.id).finish(0);
assert.deepEqual(await result, { response: 0 });
assert.equal(runtime.sensitiveDialogResponses.size, 0);
assert.equal(owner.listenerCount('closed'), 0);
assert.equal(owner.webContents.listenerCount('did-start-navigation'), 0);
assert.equal(sent[1][0], 'send-integrity:dialog-closed');
const canceled = runtime.showSensitiveSendDialog(options);
owner.webContents.emit('did-start-navigation');
assert.deepEqual(await canceled, { response: 1 });
assert.equal(runtime.sensitiveDialogResponses.size, 0);
const prepare = main.slice(end, main.indexOf('async function authorizeSensitiveSend', end));
assert.doesNotMatch(prepare, /dialog\.showMessageBox/);
assert.match(app, /class="modal-mask sensitive-dialog-mask"\s+:class="themeClass"/);
for (const theme of ['pink', 'black-gold', 'murong-purple', 'clear-water-blue']) {
  assert.ok(css.includes(`.theme-${theme}`));
}
assert.match(main, /response >= pending\.buttonCount/);
const preload = fs.readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const ipc = new EventEmitter();
const calls = [];
ipc.invoke = (...args) => { calls.push(args); return Promise.resolve(); };
ipc.send = () => {};
const exposed = {};
vm.runInNewContext(preload, {
  require: () => ({ contextBridge: { exposeInMainWorld: (name, api) => { exposed[name] = api; } }, ipcRenderer: ipc }),
  process: { argv: [] }, window: { addEventListener() {} }, document: { addEventListener() {} },
  setTimeout() {}, setInterval() {}
});
let received;
const unsubscribe = exposed.chatTranslator.onSensitiveSendDialog(value => { received = value; });
ipc.emit('send-integrity:dialog', {}, { id: 'test' });
assert.equal(received.id, 'test');
unsubscribe();
assert.equal(ipc.listenerCount('send-integrity:dialog'), 0);
const stopClosed = exposed.chatTranslator.onSensitiveSendDialogClosed(() => {});
stopClosed();
await exposed.chatTranslator.respondSensitiveSendDialog('test', 1);
assert.deepEqual(calls.at(-1), ['send-integrity:dialog-response', 'test', 1]);
assert.match(main, /preloadPath = join\(__dirname, '\.\.\/electron\/preload\.cjs'\)/);
console.log('Themed sensitive dialogs: confirmation, cancellation, cleanup and four-theme contracts passed.');

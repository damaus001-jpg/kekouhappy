// Read-only reproduction against the delivered 1.6.8 ASAR bundles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const ts = require('typescript');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const signalAsar = path.join(root, 'release/win-unpacked/resources/signal/resources/app.asar');
const clientAsar = path.join(root, 'release/win-unpacked/resources/app.asar');
const files = asar.listPackage(signalAsar);
const bridgeFile = files.find(name => /messageBridge\.main-[^\\/]+\.js$/.test(name));
const channelsFile = files.find(name => /messageBridgeChannels\.std-[^\\/]+\.js$/.test(name));
assert.ok(bridgeFile && channelsFile);
const extract = name => asar.extractFile(signalAsar, name.replace(/^[/\\]/, '')).toString();
const channels = { exports: {} };
const bundledHelpers = { n: initialize => { let ready = false; return () => { if (!ready) { ready = true; initialize(); } }; } };
vm.runInNewContext(extract(channelsFile), { exports: channels.exports, TextEncoder, require: () => bundledHelpers });
const moduleExports = {};
vm.runInNewContext(extract(bridgeFile), {
  exports: moduleExports, Buffer, setTimeout, clearTimeout, setInterval, clearInterval,
  require(name) {
    if (name.includes('chunk-DzJ5_V0X')) return bundledHelpers;
    if (name.includes('messageBridgeChannels')) return channels.exports;
    if (name === 'node:crypto') return crypto;
    return {};
  },
});
const commands = [];
const sent = [];
const commandHandlers = [];
const transportHandlers = [];
const control = {
  onCommand(handler) { commandHandlers.push(handler); return () => {}; },
  onTransportState(handler) { transportHandlers.push(handler); handler(true); return () => {}; },
  send(event) { sent.push(event); return true; },
};
const window = new EventEmitter();
window.visible = true;
window.isDestroyed = () => false;
window.isVisible = () => window.visible;
window.webContents = new EventEmitter();
window.webContents.isDestroyed = () => false;
window.webContents.send = (_channel, command) => commands.push(command);
let rendererHandler;
const bridge = moduleExports.n(control, { canExposeWindows: () => true }, {
  handle(_channel, handler) { rendererHandler = handler; }, removeHandler() {},
});
bridge.attachMainWindow(window);
const conversationId = '22222222-2222-4222-8222-222222222222';
const messageId = '33333333-3333-4333-8333-333333333333';
const projection = { conversationId, messageId, sourceHash: channels.exports.u('Hello'), sourceText: 'Hello', direction: 'incoming', timestamp: 1 };
const event = { sender: window.webContents };
assert.equal(rendererHandler(event, { type: 'conversation.changed', conversationId }), true);
const emit = command => commandHandlers.forEach(handler => handler(command));
window.visible = false;
window.emit('hide');
emit({ type: 'window.hide' });
window.visible = true;
commands.length = 0;
sent.length = 0;
emit({ type: 'window.present', requestId: crypto.randomUUID(), bounds: { x: 0, y: 0, width: 800, height: 600 } });
assert.equal(commands.length, 0, 'BUG: delivered bridge ignores the window.present resume command');
assert.equal(sent.length, 0, 'BUG: no conversation announcement is sent on resume');
assert.equal(rendererHandler(event, { type: 'message.visibleBatch', requestId: crypto.randomUUID(), conversationId, messages: [projection] }), true);
assert.equal(rendererHandler(event, { type: 'translation.refresh.request', requestId: crypto.randomUUID(), ...projection }), true);

// Execute the actual delivered launcher handler, with a cleared host conversation.
const packagedMain = asar.extractFile(clientAsar, 'dist-electron/main.js').toString();
const ast = ts.createSourceFile('packaged-main.js', packagedMain, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const handler = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'handleSignalControlMessage');
const clearState = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'clearSignalCacheRequestState');
assert.ok(handler && clearState);
const appId = 'signal:11111111-1111-4111-8111-111111111111';
const client = { socket: { destroyed: false } };
const active = new Map([[appId, { conversationId, client }]]);
let translations = 0;
let cacheLookups = 0;
const sandbox = {
  signalControlClients: new Map([[appId, client]]), activeSignalCacheConversations: active,
  pendingSignalCacheSnapshotRequests: new Map(), pendingSignalSmartReplyRequests: new Map(),
  signalOutgoingIntegrityObservations: new Map(), cancelSignalLiveTranslationsForApp() {},
  getSignalCacheControlContext: () => ({ profileId: appId.slice(7), client }),
  appendSignalSourceOnlyAcceptanceStage() {},
  persistSignalControlStatus() {},
  validateSignalTranslationRefreshRequest: value => value,
  validateSignalVisibleMessageBatch: value => value,
  getPendingSignalCacheRequest: () => null,
  enqueueSignalTranslationRefresh() { translations++; },
  tryAcquireSignalCacheLookupSlot() { cacheLookups++; return true; },
  console,
};
vm.createContext(sandbox);
vm.runInContext(clearState.getText(ast) + '\n' + handler.getText(ast), sandbox);
sandbox.clearSignalCacheRequestState(appId);
assert.equal(active.has(appId), false);
for (const value of sent) sandbox.handleSignalControlMessage(appId, value);
assert.equal(translations, 0, 'BUG: delivered launcher silently rejects manual refresh after host state was cleared');
assert.equal(cacheLookups, 0, 'BUG: delivered launcher silently rejects history cache lookup after host state was cleared');
active.set(appId, { conversationId, client });
sandbox.handleSignalControlMessage(appId, sent.find(value => value.type === 'translation.refresh.request'));
assert.equal(translations, 1, 'Restoring the host conversation makes the same refresh reach the translation queue');

commands.length = 0;
emit({ type: 'window.show' });
assert.equal(commands.at(-1)?.type, 'message.snapshot.request');
assert.equal(sent.filter(value => value.type === 'conversation.changed').length, 0);
commands.length = 0;
transportHandlers.forEach(handler => handler(false));
assert.equal(commands.at(-1)?.type, 'translation.runtime.clear');
commands.length = 0;
transportHandlers.forEach(handler => handler(true));
assert.equal(commands.length, 0, 'BUG: authentication recovery does not request a fresh snapshot');
bridge.stop();
const result = {
  version: JSON.parse(asar.extractFile(clientAsar, 'package.json').toString()).version,
  setupSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'release/pikaqiufanyiqi-1.6.8-Setup.exe'))).digest('hex'),
  launcherMatchesCompiledSource: packagedMain === fs.readFileSync(path.join(root, 'dist-electron/main.js'), 'utf8'),
  signalMatchesRuntime: fs.readFileSync(signalAsar).equals(fs.readFileSync(path.join(root, '.runtime/signal-desktop/resources/app.asar'))),
  reproduced: ['window.present does not resume history publication', 'preserved Signal conversation diverges from cleared launcher conversation', 'manual refresh and visible history batches are silently rejected by launcher', 'transport reauthentication does not trigger a snapshot'],
};
console.log(JSON.stringify(result, null, 2));

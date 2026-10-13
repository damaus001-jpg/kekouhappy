const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const base = path.resolve(__dirname, '../.tmp/signal-source/v8.18.0/Signal-Desktop-8.18.0');
const context = vm.createContext({ Buffer, console, setTimeout, clearTimeout, setInterval, clearInterval, TextEncoder });
const cache = new Map();
function load(relative) {
  const file = path.resolve(base, relative);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const localRequire = name => {
    if (name === 'electron') return {};
    if (name === 'react') return { useCallback: fn => fn, useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() };
    if (name.endsWith('/controlBridge.main.ts')) return {};
    if (name.endsWith('/windowController.main.ts')) return {};
    if (name.startsWith('node:')) return require(name);
    if (name.startsWith('.')) return load(path.relative(base, path.resolve(path.dirname(file), name)));
    throw new Error('Unexpected dependency: ' + name);
  };
  vm.runInContext('(function(require,exports){\n' + code + '\n})', context, { filename: file })(localRequire, exports);
  return exports;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(condition, label) {
  for (let index = 0; index < 150; index++) { if (condition()) return; await delay(2); }
  throw new Error('timed out: ' + label);
}
async function main() {
  const mainModule = load('app/maoyi/messageBridge.main.ts');
  const rendererModule = load('ts/maoyi/messageBridge.preload.ts');
  const translations = load('ts/maoyi/translationRuntime.preload.ts');
  const projectionModule = load('ts/maoyi/messageProjection.std.ts');
  let handler, commandListener;
  const commandHandlers = [], transportHandlers = [], sent = [], rendererCommands = [];
  let hostConversation;
  let acceptedBatches = 0;
  const control = {
    onCommand(callback) { commandHandlers.push(callback); return () => {}; },
    onTransportState(callback) { transportHandlers.push(callback); callback(true); return () => {}; },
    send(event) {
      sent.push(event);
      if (event.type === 'conversation.changed') hostConversation = event.conversationId;
      if (event.type === 'message.visibleBatch') {
        if (hostConversation !== event.conversationId) return false;
        acceptedBatches++;
      }
      if (event.type === 'translation.refresh.request') assert.equal(hostConversation, event.conversationId);
      return true;
    },
  };
  const window = new EventEmitter();
  window.visible = true;
  window.isVisible = () => window.visible;
  window.isDestroyed = () => false;
  window.webContents = new EventEmitter();
  window.webContents.isDestroyed = () => false;
  window.webContents.send = (_channel, command) => {
    rendererCommands.push(command);
    commandListener?.({}, command);
  };
  const renderer = rendererModule.createMaoyiRendererMessageBridge({
    invoke: (_channel, event) => Promise.resolve(handler({ sender: window.webContents }, event)),
    on: (_channel, callback) => { commandListener = callback; }, off() {},
  });
  const bridge = mainModule.startMaoyiMessageBridge(control, { canExposeWindows: () => true }, {
    handle: (_channel, callback) => { handler = callback; }, removeHandler() {},
  });
  bridge.attachMainWindow(window);
  const conversationId = '22222222-2222-4222-8222-222222222222';
  const messageId = '33333333-3333-4333-8333-333333333333';
  const projection = { conversationId, messageId, sourceText: 'Hello world', sourceHash: projectionModule.legacyMaoyiSourceHash('Hello world'), direction: 'incoming', timestamp: 1 };
  renderer.setSnapshotProvider(() => ({ conversationId, messages: [projection] }));
  await renderer.publishVisibleMessages(conversationId, [projection]);
  await waitFor(() => acceptedBatches >= 1, 'initial history publication');
  await delay(5);
  translations.applyMaoyiTranslationBatch([{ ...projection, translatedText: '已有译文' }]);
  translations.applyMaoyiTranslationRefreshStatus({ requestId: randomUUID(), conversationId, messageId, state: 'processing' });
  window.visible = false;
  window.emit('hide');
  commandHandlers.forEach(callback => callback({ type: 'window.hide' }));
  hostConversation = undefined;
  const before = acceptedBatches;
  window.visible = true;
  window.emit('show');
  commandHandlers.forEach(callback => callback({ type: 'window.present', requestId: randomUUID(), bounds: { x: 0, y: 0, width: 800, height: 600 } }));
  await waitFor(() => acceptedBatches > before, 'window.present resumes history without changing conversation');
  assert.equal(hostConversation, conversationId);
  assert.equal(translations.getMaoyiTranslation(projection), '已有译文');
  assert.equal(translations.getMaoyiTranslationRefreshPending(projection), false);
  hostConversation = undefined;
  await renderer.requestTranslationRefresh(projection);
  assert.equal(sent.at(-1).type, 'translation.refresh.request');
  assert.equal(sent.at(-2).type, 'conversation.changed');
  const failedRequest = sent.at(-1).requestId;
  commandHandlers.forEach(callback => callback({ type: 'translation.refresh.status', requestId: failedRequest,
    conversationId, messageId, state: 'idle', error: 'failed' }));
  assert.match(translations.useMaoyiTranslationRefreshError(projection), /失败.*重试/);
  assert.equal(translations.getMaoyiTranslationRefreshPending(projection), false);

  transportHandlers.forEach(callback => callback(false));
  hostConversation = undefined;
  const reconnectBatches = acceptedBatches;
  transportHandlers.forEach(callback => callback(true));
  await waitFor(() => acceptedBatches > reconnectBatches, 'reauthentication republishes stationary history');
  assert.equal(hostConversation, conversationId);

  const requestId = randomUUID();
  commandHandlers.forEach(callback => callback({ type: 'message.snapshot.request', requestId }));
  await waitFor(() => sent.some(event => event.type === 'message.visibleBatch' && event.requestId === requestId), 'periodic snapshot republishes identical history');
  bridge.stop();
  renderer.stop();
  translations.clearMaoyiTranslationRuntime();
  console.log('signal-translation-recovery: actual native bridge and preload recover window.present, missing host session, refresh busy state, reconnect, and identical history; translations survive hide');
}
main().catch(error => { console.error(error); process.exit(1); });

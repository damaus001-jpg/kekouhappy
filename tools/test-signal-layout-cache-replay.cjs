const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const extract = name => {
  const node = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, name);
  return node.getText(ast);
};
const client = {}, active = new Map([['signal:profile', { client, conversationId: 'contact-a' }]]);
const pending = new Map(), timers = new Map(), sent = [];
let sequence = 0, allowed = true, sendOK = true, enqueued = 0;
const ctx = {
  visibleSignalProfileId: 'profile', signalLayoutReplayTimers: [], activeSignalCacheConversations: active,
  signalAppId: id => 'signal:' + id,
  getSignalCacheControlContext: (_app, expected) => allowed && (!expected || expected === client) ? { client } : null,
  setTimeout: fn => { const id = ++sequence; timers.set(id, fn); return id; },
  clearTimeout: id => timers.delete(id), randomUUID: () => 'request-' + (++sequence),
  validateSignalMessageSnapshotRequest: value => value,
  setPendingSignalCacheRequest: (_app, value) => { pending.set(value.requestId, value); return true; },
  deletePendingSignalCacheRequest: (_app, id) => pending.delete(id),
  getPendingSignalCacheRequest: (_app, id) => pending.get(id),
  sendSignalControlMessage: (_app, value) => { sent.push(value); return sendOK; },
  observeSignalTranslationRefresh: () => ({}), isSignalTranslationRefreshTriggerCurrent: () => true,
  isSignalTranslationRefreshObservationSettled: () => true,
  isMarkedNonEnglishContact: async () => false,
  lookupTranslationCache: async () => [{ sourceHash: 'hash-hit', sourceText: 'Hello', translatedText: '你好' }],
  normalizeSignalCacheSourceText: value => value.trim(), isUsefulSignalCacheTranslation: () => true,
  appendSignalCacheResultWithinProtocolLimit: (batch, row) => batch.results.push(row),
  validateSignalCacheResultBatch: value => value, sendEmptySignalCacheResultBatch() {},
  enqueueSignalLiveTranslation: () => { enqueued++; return true; },
  appendSignalSourceOnlyAcceptanceStage() {}, releaseSignalCacheLookupSlot() {}
};
vm.createContext(ctx);
vm.runInContext(ts.transpileModule(extract('scheduleSignalLayoutCacheReplay') + '\n' + extract('respondToSignalVisibleMessageBatch'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText, ctx);
const fire = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); };
async function main() {
  ctx.scheduleSignalLayoutCacheReplay();
  ctx.scheduleSignalLayoutCacheReplay();
  assert.equal(timers.size, 4, 'continuous layout changes replace old retries');
  fire();
  assert.equal(sent.length, 4);
  assert.ok([...pending.values()].every(row => row.cacheOnly && row.conversationId === 'contact-a' && row.client === client));
  const request = [...pending.values()][0];
  const row = (hash, text, id) => ({ conversationId: 'contact-a', messageId: id, sourceHash: hash, sourceText: text });
  const batch = { requestId: request.requestId, conversationId: 'contact-a', messages: [row('hash-hit', 'Hello', 'one'), row('hash-miss', 'Goodbye', 'two')] };
  await ctx.respondToSignalVisibleMessageBatch('signal:profile', 'profile', request, batch);
  assert.equal(sent.at(-1).results.length, 1, 'cached translation is projected back to the native renderer');
  assert.equal(sent.at(-1).results[0].translatedText, '你好');
  assert.equal(enqueued, 0, 'layout request cache miss does not initiate a new translation');
  const ordinary = { ...request, requestId: 'ordinary', cacheOnly: false };
  pending.set('ordinary', ordinary);
  await ctx.respondToSignalVisibleMessageBatch('signal:profile', 'profile', ordinary, { ...batch, requestId: 'ordinary' });
  assert.equal(enqueued, 1, 'ordinary automatic translation remains enabled');
  for (const change of [
    () => active.set('signal:profile', { client, conversationId: 'contact-b' }),
    () => { ctx.visibleSignalProfileId = 'other-profile'; },
    () => { allowed = false; },
    () => active.set('signal:profile', { client: {}, conversationId: 'contact-a' })
  ]) {
    ctx.visibleSignalProfileId = 'profile'; allowed = true;
    active.set('signal:profile', { client, conversationId: 'contact-a' });
    ctx.scheduleSignalLayoutCacheReplay(); change();
    const before = sent.length; fire();
    assert.equal(sent.length, before, 'delayed replay rejected after contact/profile/visibility/transport change');
  }
  allowed = true; ctx.visibleSignalProfileId = 'profile';
  active.set('signal:profile', { client, conversationId: 'contact-a' }); sendOK = false;
  const before = pending.size; ctx.scheduleSignalLayoutCacheReplay(); fire();
  assert.equal(pending.size, before, 'failed transport sends remove their request markers');
  for (const event of ['resize', 'resized', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) {
    assert.ok(source.includes(`mainWindow.on('${event}', refreshSignalAfterLayoutChange)`));
  }
  assert.ok(source.includes("screen.on('display-metrics-changed', onDisplayMetricsChanged)"));
  console.log('Signal layout replay: cached result restoration, cache-only misses, normal translation, debounce, contact/account/lock/transport guards and layout event wiring passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

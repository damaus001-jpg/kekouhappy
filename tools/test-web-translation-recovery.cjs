const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
const ast = ts.createSourceFile('App.ts', app.slice(app.indexOf('>') + 1, app.indexOf('</script>')), ts.ScriptTarget.Latest, true);
function fn(...names) {
  return names.map(name => {
    const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
    assert.ok(node, name);
    return node.getText(ast);
  }).join('\n');
}
const recoveryExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/translation-recovery.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports: recoveryExports, setTimeout, clearTimeout });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(condition, label) {
  for (let index = 0; index < 200; index++) { if (condition()) return; await delay(2); }
  throw new Error('timed out: ' + label);
}
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function harness(platform) {
  const profile = { id: platform + '-account', name: platform, platform };
  const calls = [], cache = [], injections = [], cancellations = [];
  let translator = () => Promise.resolve('新译文');
  let executor = () => Promise.resolve(true);
  let sequence = 0;
  const code = `
    const translationQueue = [], queuedTranslationKeys = new Set(), runningTranslationKeys = new Set();
    const runningTranslationTasks = new Map(), runningTranslationProfiles = new Map(), translationQueueRetryTimers = new Map(), translationQueueRetryTasks = new Map();
    const translatingMessages = new Set(), translatedMessages = new Set(), messageTranslationAttempts = new Map();
    const failedMessageTranslationUntil = new Map(), webRuntimeGenerations = new Map(), webRuntimeControllers = new Map();
    const translationScansInFlight = new Map(), composerEventPollIntervals = new Map();
    let runningTranslationCount = 0, translationQueueTimer = null;
    let webMessageAttemptSequence = 0;
    const translationQueueGlobalConcurrency = 24, translationQueueInteractiveReservedConcurrency = 6;
    const translationQueueRealtimeReservedConcurrency = 6, translationQueueInteractiveProfileConcurrency = 2;
    const translationQueuePerProfileConcurrency = 1, translationQueueHistoryBackfillProfileConcurrency = 18;
    const translationQueueRetryDelays = [5, 15], translationQueuePriority = { 'manual-refresh': 10, 'visible-message': 40, 'history-backfill': 80 };
    ${fn('isTranslationTaskKnown', 'scheduleTranslationQueuePump', 'enqueueTranslationTask', 'finishRunningTranslationTask',
      'canRunTranslationTask', 'scheduleTranslationTaskRetry', 'pumpTranslationQueue', 'cancelTranslationTask',
      'cancelQueuedTranslationsForProfile', 'translationDedupeKeyBelongsToProfile',
      'replaceMessageTranslationTask', 'buildGuardedMessageTranslationScript', 'enqueueMessageTranslationTask', 'handleInjectedComposerEvent',
      'scanAndTranslateMessages', 'scheduleComposerEventPoll', 'resetWebTranslationRuntime')}
    globalThis.state = { runningTranslationTasks, translatingMessages, messageTranslationAttempts, failedMessageTranslationUntil,
      webRuntimeGenerations, webRuntimeControllers, translationScansInFlight, composerEventPollIntervals, translationQueue,
      get runningCount() { return runningTranslationCount; } };
  `;
  const context = {
    AbortController, console, setTimeout, clearTimeout, withTranslationDeadline: recoveryExports.withTranslationDeadline,
    profiles: { value: [profile] }, activeProfileId: { value: profile.id },
    conversationExportBusy: { value: false }, conversationExportProfileId: { value: '' },
    isSignalLegacyBubbleTranslationDisabled: () => false,
    normalizeCacheText: value => value.trim(), hashText: value => value, appForPlatform: value => value,
    hasChineseText: () => false, isUsefulMessageTranslation: () => true, diagnosticEvent() {}, setComposerStatus() {},
    createTranslationRequestId: () => 'request-' + (++sequence), deepSeekUserId: () => 'test',
    setCachedTranslation(_profile, _candidate, value) { cache.push(value); },
    buildWebBubbleRefreshStateScript: (_key, state) => JSON.stringify(state),
    buildMessageTranslationInjectScript(_key, value) { injections.push(value); return 'true'; },
    getRuntimeScriptExecutor: () => ({ execute: script => executor(script) }),
    clearTranslatedMessageMarks() {}, isTelegramPlatform: value => value === 'telegram',
    pollInjectedComposerEvents: () => Promise.resolve(), scanAndTranslateMessagesOnce: () => Promise.resolve(),
  };
  context.window = { setTimeout, chatTranslator: {
    translate(request) { calls.push(request); return translator(request); },
    cancelTranslation(requestId) { cancellations.push(requestId); return Promise.resolve(true); },
  } };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { profile, context, calls, cache, injections, cancellations,
    translate(fn) { translator = fn; }, execute(fn) { executor = fn; },
    cleanup() { context.cancelQueuedTranslationsForProfile(profile.id); for (const timer of context.state.composerEventPollIntervals.values()) clearTimeout(timer); },
  };
}

async function main() {
  await assert.rejects(recoveryExports.withTranslationDeadline(new Promise(() => {}), 5), /timed out/);
  const controller = new AbortController();
  const cancelled = recoveryExports.withTranslationDeadline(new Promise(() => {}), 1000, controller.signal);
  controller.abort();
  await assert.rejects(cancelled, /cancelled/);
  const guardHarness = harness('whatsapp');
  const page = { window: { __dfMessageTranslationAttempts: { key: 2 } } };
  assert.equal(vm.runInNewContext(guardHarness.context.buildGuardedMessageTranslationScript('key', 1, "(() => { window.result = 'old'; return true; })()"), page), false);
  assert.equal(page.window.result, undefined, 'late page-side injection is rejected before touching the DOM');
  assert.equal(vm.runInNewContext(guardHarness.context.buildGuardedMessageTranslationScript('key', 2, "(() => { window.result = 'new'; return true; })()"), page), true);
  assert.equal(page.window.result, 'new');
  for (const platform of ['whatsapp', 'telegram']) {
    const h = harness(platform), { context: c, profile } = h;
    const old = deferred();
    h.translate(() => h.calls.length === 1 ? old.promise : Promise.resolve('新译文'));
    const candidate = { key: 'bubble-1', text: 'Hello world' };
    assert.equal(c.enqueueMessageTranslationTask(profile, candidate, 'visible-message'), true);
    await waitFor(() => h.calls.length === 1, 'automatic request started');
    assert.equal(c.enqueueMessageTranslationTask(profile, candidate, 'manual-refresh'), true);
    await waitFor(() => h.injections.length === 1 && c.state.runningCount === 0, 'manual refresh takes over unresolved task');
    assert.equal(h.calls[1].reason, 'manual-refresh');
    assert.equal(h.cancellations.length, 1);
    old.resolve('旧译文');
    await delay(5);
    assert.deepEqual(h.cache, ['新译文']);
    assert.deepEqual(h.injections, ['新译文']);

    const longSource = 'Hello ' + '\\'.repeat(3200);
    await c.handleInjectedComposerEvent(profile.id, 'bubble-refresh', JSON.stringify({ key: 'long-bubble', text: longSource }));
    await waitFor(() => h.calls.length === 3, 'escaped long message refresh is accepted');
    await waitFor(() => c.state.runningCount === 0, 'long message completed');

    const oldReload = deferred();
    h.translate(() => oldReload.promise);
    c.enqueueMessageTranslationTask(profile, { key: 'reload-bubble', text: 'Before reload' }, 'visible-message');
    await waitFor(() => h.calls.length === 4, 'pre-reload task started');
    c.resetWebTranslationRuntime(profile.id);
    oldReload.resolve('过期译文');
    await waitFor(() => c.state.runningCount === 0, 'reload releases old task');
    assert.equal(h.cache.includes('过期译文'), false);
    assert.equal(c.state.translatingMessages.size, 0);
    h.cleanup();
  }
  const h = harness('whatsapp'), { context: c, profile } = h;
  h.translate(() => new Promise(() => {}));
  for (let index = 0; index < 18; index++) c.enqueueMessageTranslationTask(profile, { key: 'history-'+index, text: 'History '+index }, 'history-backfill');
  await waitFor(() => h.calls.length === 12, 'history capacity');
  c.enqueueMessageTranslationTask(profile, { key: 'new', text: 'New message' }, 'visible-message');
  c.enqueueMessageTranslationTask(profile, { key: 'manual', text: 'Manual message' }, 'manual-refresh');
  await waitFor(() => h.calls.length === 14, 'new message and manual refresh bypass history backlog');
  h.cleanup();
  await waitFor(() => c.state.runningCount === 0, 'all cancellation slots released');
  console.log('web-translation-recovery: deadline, cancellation, manual takeover, stale-result rejection, reload, long payload, and realtime capacity passed');
}
main().catch(error => { console.error(error); process.exit(1); });

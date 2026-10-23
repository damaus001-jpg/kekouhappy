const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
const script = source.slice(source.indexOf('>') + 1, source.indexOf('</script>'));
const ast = ts.createSourceFile('App.ts', script, ts.ScriptTarget.Latest, true);
function functions(...names) {
  return names.map(name => {
    const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
    assert.ok(node, name);
    return node.getText(ast);
  }).join('\n');
}
function harness(code, extra = {}) {
  const timers = new Map();
  let sequence = 0;
  const timer = callback => { timers.set(++sequence, callback); return sequence; };
  const context = { console, timers, setTimeout: timer, clearTimeout: id => timers.delete(id), ...extra };
  context.window = { setTimeout: timer, chatTranslator: {}, ...extra.window };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}
const flush = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
async function main() {
  const results = [];
  for (const platform of ['whatsapp', 'telegram']) {
    const profile = { id: platform + '-account', platform, name: platform };
    let scanCalls = 0;
    const scan = harness('const translationScansInFlight = new Map();\n' + functions('scanAndTranslateMessages'), {
      profiles: { value: [profile] },
      scanAndTranslateMessagesOnce() { scanCalls++; return new Promise(() => {}); },
    });
    const first = scan.scanAndTranslateMessages(profile.id);
    assert.equal(scan.scanAndTranslateMessages(profile.id), first);
    assert.equal(scan.scanAndTranslateMessages(profile.id), first);
    assert.equal(scanCalls, 1, 'a non-settling execution permanently coalesces all subsequent scans');

    let pollCalls = 0;
    const poll = harness(functions('scheduleComposerEventPoll'), {
      composerEventPollIntervals: new Map(), profiles: { value: [profile] },
      activeProfileId: { value: profile.id }, isTelegramPlatform: value => value === 'telegram',
      pollInjectedComposerEvents() { pollCalls++; return new Promise(() => {}); },
    });
    poll.scheduleComposerEventPoll(profile.id);
    const callback = poll.timers.values().next().value;
    poll.timers.clear();
    callback();
    await flush();
    poll.scheduleComposerEventPoll(profile.id);
    assert.equal(pollCalls, 1);
    assert.equal(poll.timers.size, 0, 'a non-settling poll never schedules its successor and restart is refused');

    const queueCode = `
      const translationQueue = [], queuedTranslationKeys = new Set(), runningTranslationKeys = new Set();
      const runningTranslationTasks = new Map(), runningTranslationProfiles = new Map();
      const translationQueueRetryTimers = new Map(), translatingMessages = new Set(), translatedMessages = new Set();
      let runningTranslationCount = 0, translationQueueTimer = null;
      const translationQueueGlobalConcurrency = 24, translationQueueInteractiveReservedConcurrency = 6;
      const translationQueueInteractiveProfileConcurrency = 2, translationQueuePerProfileConcurrency = 1;
      const translationQueueHistoryBackfillProfileConcurrency = 18, translationQueueRetryDelays = [5000, 30000];
      const translationQueuePriority = { 'manual-refresh': 10, 'visible-message': 20 };
      ${functions('isTranslationTaskKnown', 'scheduleTranslationQueuePump', 'enqueueTranslationTask',
        'finishRunningTranslationTask', 'canRunTranslationTask', 'scheduleTranslationTaskRetry',
        'pumpTranslationQueue', 'enqueueMessageTranslationTask')}
      globalThis.state = { translatingMessages, runningTranslationTasks };
    `;
    let executeCalls = 0;
    const queue = harness(queueCode, {
      profiles: { value: [profile] },
      isSignalLegacyBubbleTranslationDisabled: () => false,
      normalizeCacheText: value => value.trim(), hashText: () => 'source-hash',
      getRuntimeScriptExecutor: () => ({ execute() { executeCalls++; return new Promise(() => {}); } }),
      buildWebBubbleRefreshStateScript: () => 'processing',
    });
    const candidate = { key: 'message-key', text: 'Hello world' };
    assert.equal(queue.enqueueMessageTranslationTask(profile, candidate, 'manual-refresh'), true);
    queue.pumpTranslationQueue();
    await flush();
    assert.equal(executeCalls, 1);
    assert.equal(queue.state.runningTranslationTasks.size, 1);
    assert.equal(queue.enqueueMessageTranslationTask(profile, candidate, 'manual-refresh'), false);
    assert.equal(queue.enqueueMessageTranslationTask(profile, candidate, 'visible-message'), false);

    let enqueued = 0;
    let idleUpdates = 0;
    const input = harness(functions('handleInjectedComposerEvent'), {
      profiles: { value: [profile] }, normalizeCacheText: value => value.trim(),
      hasChineseText: () => false, enqueueMessageTranslationTask() { enqueued++; return true; },
      getRuntimeScriptExecutor: () => ({ execute() { idleUpdates++; return Promise.resolve(true); } }),
      setComposerStatus() {},
    });
    // Valid <=4000-character English projection; JSON escaping exceeds the event limit.
    const longSource = 'Hello ' + '\\'.repeat(3200);
    const payload = JSON.stringify({ key: candidate.key, text: longSource, direction: 'incoming', messagePart: 'body' });
    assert.ok(longSource.length < 4000 && payload.length > 6000);
    await input.handleInjectedComposerEvent(profile.id, 'bubble-refresh', payload);
    assert.equal(enqueued, 0);
    assert.equal(idleUpdates, 0, 'rejected refresh returns without clearing a button already marked pending');
    results.push({ platform, reproduced: ['scan remains blocked when script promise never settles',
      'event polling stops and refuses restart when a poll never settles',
      'pending manual task blocks both automatic and manual translation of the same message',
      'oversize escaped JSON refresh is silently dropped without resetting the pending button'] });
  }
  const packageFile = path.join(root, 'release/win-unpacked/resources/app.asar');
  const assets = asar.listPackage(packageFile).filter(name => /[\\/]dist[\\/]assets[\\/].*\.js$/.test(name));
  assert.ok(assets.length);
  const mainAssets = [];
  for (const name of assets) {
    const packaged = asar.extractFile(packageFile, name.replace(/^[/\\]/, ''));
    const local = path.join(root, name.replace(/^[/\\]/, ''));
    assert.ok(fs.existsSync(local) && packaged.equals(fs.readFileSync(local)), name + ' differs from dist');
    if (packaged.includes(Buffer.from('__dfBubbleRefreshPendingKeys'))) mainAssets.push(name);
  }
  assert.ok(mainAssets.length);
  console.log(JSON.stringify({ evidence: 'isolated current-source fault injection; packaged frontend assets match dist byte-for-byte', mainAssets, results }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });

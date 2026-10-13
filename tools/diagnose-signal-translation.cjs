// Offline diagnosis: execute the production queue through its existing harness.
// No account data, API credentials, or network requests are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const harnessPath = path.join(__dirname, 'test-signal-live-translation-queue.cjs');
const source = fs.readFileSync(harnessPath, 'utf8');
const prefix = source.slice(0, source.indexOf('async function mainTest()'));
const harnessModule = new Module(harnessPath, module);
harnessModule.filename = harnessPath;
harnessModule.paths = module.paths;
harnessModule._compile(`${prefix}\nmodule.exports = { createHarness, message, deferred, delay, waitFor };`, harnessPath);
const { createHarness, message, deferred, delay, waitFor } = harnessModule.exports;

async function main() {
  const pending = deferred();
  const blocked = createHarness({ translateWithDeepSeek: (_request, call) => call === 1 ? pending.promise : '你好' });
  const enqueue = (h, m) => h.queue.enqueueSignalLiveTranslation(h.appId, h.profileId, h.client, m);
  assert.equal(enqueue(blocked, message(blocked, 1)), true);
  await waitFor(() => blocked.translateCalls === 1, 'first API call');
  assert.equal(enqueue(blocked, message(blocked, 2)), true);
  await waitFor(() => blocked.translateCalls === 2 && blocked.saveCalls === 1, 'second message completes despite stalled first request');
  assert.equal(blocked.queue.signalLiveTranslationQueue.length, 0);
  assert.equal(blocked.translateRequests[0].abortSignal.aborted, false);
  console.log('VERIFIED: one unresolved translation no longer blocks the next message in the same Signal profile.');
  pending.resolve('你好');
  await waitFor(() => blocked.translateCalls === 2 && blocked.queue.runningCount === 0, 'queue recovery');
  console.log('VERIFIED: all slots are released when the stalled request finally settles.');

  const marked = createHarness({ isMarkedNonEnglishContact: () => true });
  assert.equal(enqueue(marked, message(marked)), true);
  await waitFor(() => marked.lookupCalls === 0 && marked.queue.signalLiveTranslationPendingKeys.size === 0, 'marked contact skip');
  assert.equal(marked.translateCalls, 0);
  console.log('REPRODUCED: a persisted non-English contact marker silently skips automatic translation.');

  const bounded = createHarness();
  assert.equal(enqueue(bounded, message(bounded, 1, 'a'.repeat(4001))), false);
  console.log('REPRODUCED: text above 4,000 characters is rejected before the API call.');
  blocked.queue.cancelSignalLiveTranslationsForApp(blocked.appId);
  marked.queue.cancelSignalLiveTranslationsForApp(marked.appId);
  bounded.queue.cancelSignalLiveTranslationsForApp(bounded.appId);
  console.log('Offline diagnosis passed. These reproduce code paths, not the reported customer incident.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

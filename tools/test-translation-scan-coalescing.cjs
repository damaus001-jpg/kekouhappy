const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const recovery = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/translation-recovery.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText, { exports: recovery, setTimeout, clearTimeout });
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/App.vue'), 'utf8');
const start = source.indexOf('const translationScansInFlight =');
const end = source.indexOf('async function scanAndTranslateMessagesOnce', start);
assert.ok(start >= 0 && end > start);
const compiled = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function gate() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function main() {
  const calls = [];
  const pending = [];
  const scan = new Function('scanAndTranslateMessagesOnce', 'withTranslationDeadline', `const webRuntimeControllers = new Map(); const profiles = { value: [{ id: 'account-a', platform: 'whatsapp' }, { id: 'account-b', platform: 'telegram' }] }; const conversationExportBusy = { value: false }, conversationExportProfileId = { value: '' }; ${compiled}; return scanAndTranslateMessages;`)(id => {
    calls.push(id);
    const next = gate();
    pending.push(next);
    return next.promise;
  }, recovery.withTranslationDeadline);
  const first = scan('account-a');
  assert.equal(scan('account-a'), first);
  const other = scan('account-b');
  assert.deepEqual(calls, ['account-a', 'account-b']);
  pending[0].resolve();
  pending[1].resolve();
  await Promise.all([first, other]);
  const failed = scan('account-a');
  const rejected = assert.doesNotReject(failed);
  assert.equal(scan('account-a'), failed);
  pending[2].reject(new Error('page navigation'));
  await rejected;
  const recovered = scan('account-a');
  pending[3].resolve();
  await recovered;
  assert.deepEqual(calls, ['account-a', 'account-b', 'account-a', 'account-a']);
  const deadlineCompiled = compiled.replace(/30_?000/g, '8');
  assert.notEqual(deadlineCompiled, compiled, 'the simulated scan deadline must be shortened');
  let timedCalls = 0;
  const timedScan = new Function('scanAndTranslateMessagesOnce', 'withTranslationDeadline', `const webRuntimeControllers = new Map(); const profiles = { value: [] }; const conversationExportBusy = { value: false }, conversationExportProfileId = { value: '' }; ${deadlineCompiled}; return scanAndTranslateMessages;`)(() => {
    timedCalls++;
    return new Promise(() => {});
  }, recovery.withTranslationDeadline);
  await timedScan('timeout-account');
  await timedScan('timeout-account');
  assert.equal(timedCalls, 2, 'a non-settling scan must release its coalescing slot after the deadline');
  const runtime = new AbortController();
  const controllers = new Map([['reload-account', runtime]]);
  let scanSignal;
  const reloadScan = new Function('scanAndTranslateMessagesOnce', 'withTranslationDeadline', 'webRuntimeControllers', `const profiles = { value: [] }; const conversationExportBusy = { value: false }, conversationExportProfileId = { value: '' }; ${compiled}; return scanAndTranslateMessages;`)((id, signal) => {
    scanSignal = signal;
    return new Promise(() => {});
  }, recovery.withTranslationDeadline, controllers);
  const oldScan = reloadScan('reload-account');
  runtime.abort();
  assert.equal(scanSignal.aborted, true, 'reload must abort the underlying scan before it can enqueue stale candidates');
  await oldScan;
  console.log('translation-scan-coalescing: overlapping scans share work, accounts remain independent, failures release the slot');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

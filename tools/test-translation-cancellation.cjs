const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(path.resolve(__dirname, '../electron/main.ts'), 'utf8');
const start = source.indexOf("  trustedHandle('translate', true,");
const end = source.indexOf("  trustedHandle('translation-customization:get'", start);
assert.ok(start > 0 && end > start);
const handlers = new Map();
const signals = [];
const sandbox = {
  AbortController, AbortSignal,
  trustedHandle(name, _requiresAuthorization, handler) { handlers.set(name, handler); },
  validateTranslateRequest: value => value,
  assertText(value) { assert.equal(typeof value, 'string'); },
  translateWithDeepSeek(_request, signal) {
    signals.push(signal);
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
  },
};
vm.runInNewContext(ts.transpileModule('const translationControllers = new Map(); const translationControllerSenders = new Set();\n' + source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText, sandbox);
async function main() {
  const first = new EventEmitter(), second = new EventEmitter();
  first.id = 1; second.id = 2;
  const request = { requestId: 'same-request', text: 'Hello', to: 'Chinese' };
  const one = handlers.get('translate')({ sender: first }, request);
  assert.equal(handlers.get('translate:cancel')({ sender: second }, request.requestId), false);
  assert.equal(signals[0].aborted, false);
  const two = handlers.get('translate')({ sender: second }, request);
  assert.equal(handlers.get('translate:cancel')({ sender: first }, request.requestId), true);
  await assert.rejects(one, /cancelled/);
  assert.equal(signals[1].aborted, false, 'another sender with the same request ID is not cancelled');
  second.emit('destroyed');
  await assert.rejects(two, /cancelled/);
  const three = handlers.get('translate')({ sender: first }, request);
  const four = handlers.get('translate')({ sender: first }, { ...request, requestId: 'another-request' });
  assert.equal(first.listenerCount('destroyed'), 1, 'one lifecycle listener serves all requests');
  first.emit('destroyed');
  await Promise.all([assert.rejects(three, /cancelled/), assert.rejects(four, /cancelled/)]);
  console.log('translation-cancellation: sender-scoped cancellation, ID reuse after settlement, and renderer destruction passed');
}
main().catch(error => { console.error(error); process.exit(1); });

// Execute the current shared API function with synthetic responses, without secrets or network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const mainSource = fs.readFileSync(path.join(__dirname, '../electron/main.ts'), 'utf8');
const start = mainSource.indexOf('function deepSeekTransportDiagnostic(');
const end = mainSource.indexOf('type SmartReplyGenerationOptions', start);
assert.ok(start >= 0 && end > start);
const production = ts.transpileModule(mainSource.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

function harness(fetchImpl, deadlineMs) {
  const logs = [];
  let calls = 0;
  const dependencies = {
    readConfig: async () => ({ deepseekModel: 'deepseek-v4-flash' }),
    clientLicenseManager: { getServiceSecret: () => 'synthetic-test-secret' },
    readDevelopmentServiceSecret: async () => '', randomBytes, randomUUID, createHash,
    defaultModel: 'deepseek-v4-flash', runtimeLoggingEnabled: false,
    translationDiagnosticsEnabled: false, recordTranslationDiagnostic: () => {},
    hashForLog: () => 'test-hash',
    protectTranslationSensitiveTokens: text => ({ text }),
    restoreTranslationSensitiveTokens: text => ({ ok: true, text }),
    loadTranslationPrompts: async () => ({ englishToChinese: 'Translate to Chinese.' }),
    loadCustomChineseToEnglishPrompt: async () => null,
    translationSourceDataProtocol: '', buildTranslationSourceDataEnvelope: text => text,
    appendTranslateRequestLog: async event => { logs.push(event); },
    registerApprovedComposerTranslation: () => {},
    visibleMessageDeepSeekDedupe: new Map(),
    fetch: async (...args) => { calls++; return fetchImpl(...args); },
    setTimeout, AbortSignal: deadlineMs ? { timeout: () => AbortSignal.timeout(deadlineMs), any: signals => AbortSignal.any(signals) } : AbortSignal
  };
  const translate = new Function(...Object.keys(dependencies), `${production}\nreturn translateWithDeepSeek;`)(...Object.values(dependencies));
  return { translate, logs, get calls() { return calls; } };
}
const request = { text: 'Hello there', to: 'Chinese', reason: 'visible-message', profileId: 'test-profile', sourceHash: 'test-hash' };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  for (const platform of ['signal', 'whatsapp']) {
    for (const status of [429, 500, 503]) {
      const h = harness(async () => ({ ok: false, status }));
      await assert.rejects(h.translate({ ...request, platform }), new RegExp(String(status)));
      assert.equal(h.calls, 1);
      console.log(`VERIFIED ${platform}: HTTP ${status} has no retry inside the shared API function; queue-level retries are separate.`);
    }
  }
  let resolveResponse;
  const delayedResponse = new Promise(resolve => { resolveResponse = resolve; });
  let signal;
  const h = harness(async (_url, options) => { signal = options.signal; return delayedResponse; });
  let completed = false;
  const first = h.translate({ ...request, platform: 'whatsapp' }).then(() => { completed = true; });
  const duplicate = h.translate({ ...request, platform: 'whatsapp' });
  await delay(100);
  assert.equal(completed, false);
  assert.ok(signal instanceof AbortSignal);
  assert.equal(h.calls, 1);
  resolveResponse({ ok: true, json: async () => ({ choices: [{ message: { content: '你好' } }] }) });
  await Promise.all([first, duplicate]);
  console.log('VERIFIED WhatsApp: pending requests deduplicate and carry an API deadline.');
  const stalled = harness(async (_url, options) => ({ ok: true, status: 200, json: () => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }) }), 30);
  const keepAlive = setInterval(() => {}, 100);
  try { await assert.rejects(stalled.translate(request), { name: 'TimeoutError' }); }
  finally { clearInterval(keepAlive); }
  assert.equal(stalled.calls, 1);
  const cancelled = new AbortController();
  cancelled.abort();
  const callerCancelled = harness(async () => { throw new Error('Unexpected fetch'); });
  await assert.rejects(callerCancelled.translate(request, cancelled.signal), /cancelled/);
  assert.equal(callerCancelled.calls, 0);
  console.log('VERIFIED: HTTP 200 stalled body times out without retry; caller cancellation remains effective.');
  const empty = harness(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '' }, finish_reason: 'content_filter' }] }) }));
  await assert.rejects(empty.translate(request), { name: 'EmptyTranslationResultError' });
  assert.ok(!empty.logs.some(log => log.status === 'success'));
  console.log('VERIFIED: an empty response is rejected and never recorded as API success.');
  console.log('Offline diagnosis passed. Customer incident root cause still requires runtime evidence.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

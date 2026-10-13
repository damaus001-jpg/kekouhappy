const { app, safeStorage, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, '.tmp/translation-diagnostics-client/logs/format-comparison.json');
const probeData = path.join(root, '.tmp/deepseek-format-probe');
fs.mkdirSync(probeData, { recursive: true });
fs.copyFileSync(path.join(root, '.tmp/translation-diagnostics-client/maoyi Developer Data/Local State'), path.join(probeData, 'Local State'));
app.setPath('userData', probeData);
app.setName('皮卡丘翻译器');
const keepAlive = setInterval(() => {}, 1000);
console.log('probe:starting');
app.whenReady().then(async () => {
  console.log('probe:ready');
  const key = safeStorage.decryptString(fs.readFileSync(path.join(root, '.tmp/translation-diagnostics-client/service-key.dpapi')));
  console.log('probe:key-loaded');
  const messages = [{ role: 'system', content: 'Translate the user message into Simplified Chinese. Return only the translation.' }, { role: 'user', content: 'Hello, how are you today?' }];
  const base = { model: 'deepseek-flash', messages, thinking: { type: 'disabled' } };
  const cases = process.argv.includes('--extended') ? [
    ['flash-chromium', { ...base, max_tokens: 128 }],
    ['flash-v1', { ...base, max_tokens: 128 }],
    ['flash-legacy', { ...base, model: 'deepseek-v4-flash', max_tokens: 128 }],
    ['pro-control', { ...base, model: 'deepseek-v4-pro', max_tokens: 128 }]
  ] : [
    ['flash-minimal', base],
    ['flash-user-temperature', { ...base, user_id: 'df-default', temperature: 0.2 }],
    ['flash-bounded', { ...base, max_tokens: 128 }],
    ['flash-stream', { ...base, stream: true, max_tokens: 128 }],
    ['pro-control', { ...base, model: 'deepseek-v4-pro' }]
  ];
  const results = [];
  for (const [name, body] of cases) {
    console.log(`probe:case:${name}`);
    const start = Date.now();
    const result = { name, requestFields: Object.keys(body), model: body.model };
    try {
      const requestFetch = name === 'flash-chromium' ? net.fetch : fetch;
      const url = name === 'flash-v1' ? 'https://api.deepseek.com/v1/chat/completions' : 'https://api.deepseek.com/chat/completions';
      const response = await requestFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      result.httpStatus = response.status;
      result.headersMs = Date.now() - start;
      if (body.stream) {
        let raw = '';
        for await (const chunk of response.body) {
          if (!result.firstChunkMs) result.firstChunkMs = Date.now() - start;
          raw += Buffer.from(chunk).toString('utf8');
        }
        let output = '';
        for (const line of raw.split('\n')) {
          if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
          try { output += JSON.parse(line.slice(6)).choices?.[0]?.delta?.content || ''; } catch {}
        }
        result.done = raw.includes('[DONE]');
        result.chineseResult = /[\u4e00-\u9fff]/.test(output);
        result.outputLength = output.length;
      } else {
        const data = await response.json();
        const output = data.choices?.[0]?.message?.content || '';
        result.responseModel = data.model;
        result.finishReason = data.choices?.[0]?.finish_reason;
        result.chineseResult = /[\u4e00-\u9fff]/.test(output);
        result.outputLength = output.length;
        result.usage = data.usage;
        result.errorCode = data.error?.code;
      }
    } catch (error) { result.errorName = error.name; result.causeCode = error.cause?.code; }
    result.elapsedMs = Date.now() - start;
    results.push(result);
    fs.writeFileSync(process.argv.includes('--extended') ? reportPath.replace('.json', '-extended.json') : reportPath, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
    console.log(JSON.stringify(result));
  }
}).catch(error => { console.error(JSON.stringify({ name: error.name, message: error.message })); process.exitCode = 1; }).finally(() => { clearInterval(keepAlive); app.quit(); });

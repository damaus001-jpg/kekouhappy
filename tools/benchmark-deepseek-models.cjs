const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
// A detached Windows GUI process can outlive the launching terminal pipe.
// Diagnostics remain available in the JSON report even if output closes.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', error => { if (error.code !== 'EPIPE') process.exitCode = 1; });
}
function log(value) {
  if (process.stdout.destroyed || !process.stdout.writable) return;
  try { process.stdout.write(`${value}\n`); }
  catch (error) { if (error.code !== 'EPIPE') throw error; }
}
const root = path.resolve(__dirname, '..');
const diagnostic = path.join(root, '.tmp/translation-diagnostics-client');
const probe = path.join(root, '.tmp/deepseek-speed-probe');
fs.mkdirSync(probe, { recursive: true });
fs.copyFileSync(path.join(diagnostic, 'maoyi Developer Data/Local State'), path.join(probe, 'Local State'));
app.setPath('userData', probe);
const report = { at: new Date().toISOString(), deadlineMs: 45000, results: [] };
const reportPath = path.join(diagnostic, 'logs', `model-speed-comparison-${process.pid}.json`);
const keepAlive = setInterval(() => {}, 1000);
app.whenReady().then(async () => {
  const key = safeStorage.decryptString(fs.readFileSync(path.join(diagnostic, 'service-key.dpapi')));
  const prompts = JSON.parse(fs.readFileSync(path.join(root, 'config/translation-prompts.default.json'), 'utf8'));
  const shared = await import(pathToFileURL(path.join(root, 'dist-electron/translation-english-style.js')).href);
  async function run(model, sample, text, direction, minimal = false) {
    const result = { model, sample, format: minimal ? 'minimal-control' : 'production', direction };
    const start = Date.now();
    try {
      const body = { model, user_id: 'df-default', messages: [
        { role: 'system', content: minimal ? 'Translate to Simplified Chinese. Return only the translation.' : `${prompts[direction]}\n\n${shared.translationSourceDataProtocol}` },
        { role: 'user', content: minimal ? text : shared.buildTranslationSourceDataEnvelope(text) }
      ], thinking: { type: 'disabled' }, temperature: 0.2 };
      const response = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
      result.httpStatus = response.status;
      result.headersMs = Date.now() - start;
      const data = await response.json();
      const output = data.choices?.[0]?.message?.content || '';
      result.success = response.ok && Boolean(output.trim()) && (direction !== 'englishToChinese' || /[\u4e00-\u9fff]/.test(output));
      result.responseModel = data.model;
      result.outputLength = output.length;
      result.finishReason = data.choices?.[0]?.finish_reason;
      result.usage = data.usage;
      result.errorCode = data.error?.code;
    } catch (error) { result.success = false; result.errorName = error.name; result.causeCode = error.cause?.code; }
    result.elapsedMs = Date.now() - start;
    report.results.push(result);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(JSON.stringify(result));
  }
  for (const [sample, text, direction] of [
    ['short-incoming', 'How was your day? I just got home from work.', 'englishToChinese'],
    ['short-reply', '今天过得怎么样？我刚下班回到家。', 'chineseToEnglish'],
    ['long-incoming', 'I had a busy afternoon, but everything went well. I stopped by the grocery store on my way home and picked up a few things for dinner. What have you been up to today?', 'englishToChinese']
  ]) await Promise.all(['deepseek-flash', 'deepseek-v4-pro'].map(model => run(model, sample, text, direction)));
  if (!report.results.some(r => r.model === 'deepseek-flash' && r.success)) {
    await run('deepseek-v4-flash', 'legacy-alias', 'Hello, how are you today?', 'englishToChinese', true);
  } else {
    await Promise.all(['deepseek-flash', 'deepseek-v4-pro'].flatMap(model => Array.from({ length: 4 }, (_, i) => run(model, `burst-${i}`, `I finished task ${i + 1} and will take a short break. How is your afternoon going?`, 'englishToChinese'))));
  }
  log(`Report saved: ${reportPath}`);
}).catch(error => { log(JSON.stringify({ errorName: error.name })); process.exitCode = 1; }).finally(() => { clearInterval(keepAlive); app.exit(process.exitCode || 0); });

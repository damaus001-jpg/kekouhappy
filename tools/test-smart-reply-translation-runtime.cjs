const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, '.tmp/smart-reply-translation-test'));
const source = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
function productionFunction(startName, endName) {
  const start = source.indexOf(`function ${startName}`);
  const end = source.indexOf(`function ${endName}`, start);
  if (start < 0 || end <= start) throw new Error('Missing production function');
  const compiled = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(`${compiled};return ${startName};`)();
}
const scan = productionFunction('buildMessageScanScript', 'buildSignalDomProbeScript');
const inject = productionFunction('buildMessageTranslationInjectScript', 'buildFingerprintScript');
const eligibility = productionFunction('candidateViewportRatio', 'historyBackfillBandRank');
const eligibilityStart = source.indexOf('function candidateViewportRatio');
const eligibilityEnd = source.indexOf('function historyBackfillBandRank', eligibilityStart);
const pick = new Function(ts.transpileModule(source.slice(eligibilityStart, eligibilityEnd), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + ';return isLatestVisibleMessageCandidate;')();
const runtime = ts.transpileModule(fs.readFileSync(path.join(root, 'src/smart-reply-runtime.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const smart = new Function('exports', runtime + ';return exports;')({});
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1000, height: 900, webPreferences: { sandbox: true } });
  await window.loadURL('data:text/html,<html><body></body></html>');
  const reports = [];
  for (const directions of [
    ['in', 'out', 'in', 'out', 'in'],
    ['in', ...Array(4).fill('out'), 'in', ...Array(4).fill('out'), 'in'],
    ['in', ...Array(7).fill('out'), 'in', ...Array(9).fill('out'), 'in', ...Array(2).fill('out')]
  ]) {
  const texts = directions.map((direction,index)=>`${direction === 'in' ? 'Other' : 'My'} message ${index}, how was your day?`);
  const rows = texts.map((text, index) => `<div class="${directions[index] === 'out' ? 'message-out' : 'message-in'}" data-id="${directions[index] === 'out' ? 'true' : 'false'}_sample_${index}"><div data-pre-plain-text="[10:00] ${directions[index] === 'out' ? 'You' : 'Alice'}: "><span class="selectable-text copyable-text">${text}</span></div></div>`).join('');
  const rowHeight = Math.min(115, Math.floor(700 / directions.length) - 12);
  const html = `<style>body{margin:0}header{height:60px}.message-in,.message-out{height:${rowHeight}px;padding:6px}.selectable-text{display:block;width:350px;min-height:24px}</style><main id="main"><header><span title="Alice" dir="auto">Alice</span></header>${rows}</main>`;
  await window.webContents.executeJavaScript(`document.body.innerHTML=${JSON.stringify(html)};window.__dfConversationSignature='sample-conversation';`);
  const before = await window.webContents.executeJavaScript(scan('whatsapp', { limit: 100 }));
  const ui = await window.webContents.executeJavaScript(smart.buildSmartReplyUiInstallScript('whatsapp'));
  const after = await window.webContents.executeJavaScript(scan('whatsapp', { limit: 100 }));
  const eligible = after.filter(candidate => pick('whatsapp', candidate));
  const report = {
    totalMessages: directions.length,
    scannedBefore: new Set(before.map(c=>c.text)).size, scannedAfter: new Set(after.map(c=>c.text)).size,
    candidateRows: after.length,
    incoming: new Set(after.filter(c => c.direction === 'incoming').map(c=>c.text)).size,
    outgoing: new Set(after.filter(c => c.direction === 'outgoing').map(c=>c.text)).size,
    nonEnglishMarkers: after.filter(c => c.nonEnglishContactMarker).length,
    smartReplyAnchors: ui.eligibleMessageKeys?.length || 0,
    realtimeEligible: new Set(eligible.map(c=>c.text)).size,
    previousViewportRuleEligible: new Set(after.filter(c=>c.scanBand==='visible'&&c.nearConversationEnd!==false&&eligibility(c)>=0.48).map(c=>c.text)).size,
    viewportRatios: after.map(c => eligibility(c)),
    allSourcesUnchanged: JSON.stringify(before.map(c=>c.text))===JSON.stringify(after.map(c=>c.text))
  };
  const batch = await window.webContents.executeJavaScript(scan('whatsapp'));
  const firstBatchTexts = new Set(batch.map(c=>c.text));
  report.firstRealtimeBatch = firstBatchTexts.size;
  for (const candidate of batch) {
    if (!(await window.webContents.executeJavaScript(inject(candidate.key, '这是本地测试译文', 'whatsapp', candidate.text, true)))) throw new Error('Batch translation injection failed');
  }
  const following = await window.webContents.executeJavaScript(scan('whatsapp'));
  report.followingRealtimeBatch = new Set(following.map(c=>c.text)).size;
  report.followingBatchIsNew = following.every(c=>!firstBatchTexts.has(c.text));
  for (const candidate of after) {
    const translated = await window.webContents.executeJavaScript(inject(candidate.key, '这是本地测试译文', 'whatsapp', candidate.text, true));
    if (!translated) throw new Error('Synthetic translation could not be injected');
  }
  await window.webContents.executeJavaScript(smart.buildSmartReplyUiInstallScript('whatsapp'));
  report.renderedTranslations = await window.webContents.executeJavaScript(`document.querySelectorAll('.df-chat-translation').length`);
  report.remainingUntranslated = (await window.webContents.executeJavaScript(scan('whatsapp', { limit: 100 }))).length;
  console.log(JSON.stringify(report));
  reports.push(report);
  const total = directions.length;
  if (!process.argv.includes('--baseline') && (report.realtimeEligible !== total || report.scannedAfter !== total || report.incoming !== 3 || report.outgoing !== total - 3 || report.smartReplyAnchors !== 3 || report.nonEnglishMarkers || !report.allSourcesUnchanged || report.renderedTranslations !== total || report.remainingUntranslated !== 0 || !report.followingBatchIsNew || (total > 12 && !report.followingRealtimeBatch))) process.exitCode = 1;
  }
  fs.writeFileSync(path.join(root, '.tmp', process.argv.includes('--baseline') ? 'smart-reply-translation-baseline.json' : 'smart-reply-translation-results.json'), JSON.stringify(reports, null, 2));
  window.destroy();
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => app.exit(process.exitCode || 0));

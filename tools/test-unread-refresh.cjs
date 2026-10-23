const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/App.vue'), 'utf8');
const start = source.indexOf('async function refreshUnreadCount(');
const end = source.indexOf('\nfunction handleWebviewDomReady(', start);
assert.ok(start >= 0 && end > start);
const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function harness() {
  const profile = {id:'tg', platform:'telegram-k'};
  const profiles = {value:[profile]};
  const webRuntimeGenerations = new Map([['tg', 1]]);
  const unreadScansInFlight = new Set();
  const counts = new Map([['tg', 4]]);
  const scans = [];
  const dependencies = {
    profiles, webRuntimeGenerations, unreadScansInFlight,
    getRuntimeScriptExecutor: () => ({execute:() => {const pending=deferred();scans.push(pending);return pending.promise;}}),
    buildUnreadScanScript: () => 'synthetic scan', appForPlatform: () => 'telegram',
    clearUnreadState: id => counts.delete(id), setUnreadCount: (id,count) => counts.set(id,count)
  };
  const refresh = new Function(...Object.keys(dependencies), `${code};return refreshUnreadCount;`)(...Object.values(dependencies));
  return {refresh, profiles, webRuntimeGenerations, unreadScansInFlight, counts, scans};
}
async function main() {
  const h=harness();
  let pending=h.refresh('tg');
  await h.refresh('tg');
  assert.equal(h.scans.length,1,'poll and title events must not create overlapping scans');
  h.scans[0].resolve({count:0,ready:false});await pending;
  assert.equal(h.counts.get('tg'),4,'an unavailable page must retain the existing badge');
  pending=h.refresh('tg');h.scans[1].resolve({count:0,ready:true});await pending;
  assert.equal(h.counts.get('tg'),0,'confirmed read state must clear the badge');
  pending=h.refresh('tg');h.webRuntimeGenerations.set('tg',2);h.scans[2].resolve({count:8,ready:true});await pending;
  assert.equal(h.counts.get('tg'),0,'a replaced webview must not publish stale unread');
  pending=h.refresh('tg');h.profiles.value=[];h.counts.delete('tg');h.scans[3].resolve({count:8});await pending;
  assert.equal(h.counts.has('tg'),false,'a removed account must not regain a stale badge');
  const recovering=harness();
  pending=recovering.refresh('tg');recovering.scans[0].reject(new Error('Navigating'));await pending;
  assert.equal(recovering.counts.get('tg'),4);
  assert.equal(recovering.unreadScansInFlight.size,0,'failed scans must release their slot');
  pending=recovering.refresh('tg');recovering.scans[1].resolve({count:2});await pending;
  assert.equal(recovering.counts.get('tg'),2,'normal polling must recover after navigation');
  const resumeStart=source.indexOf('function refreshTelegramUnreadCountsOnResume()');
  const resumeEnd=source.indexOf('\nfunction handleWebviewDomReady(',resumeStart);
  assert.ok(resumeStart>=0&&resumeEnd>resumeStart,'Telegram refresh-on-resume handler is defined');
  const resumeCode=ts.transpileModule(source.slice(resumeStart,resumeEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const resumed=[];
  const resumeHarness=new Function('document','profiles','appForPlatform','refreshUnreadCount',`${resumeCode};return refreshTelegramUnreadCountsOnResume;`)({visibilityState:'visible'},
    {value:[{id:'tg-a',platform:'telegram-a'},{id:'tg-k',platform:'telegram-k'},{id:'wa',platform:'whatsapp'},{id:'sg',platform:'signal'}]},
    platform=>platform.startsWith('telegram')?'telegram':platform,
    id=>resumed.push(id));
  resumeHarness();
  assert.deepEqual(resumed,['tg-a','tg-k'],'window resume refreshes every Telegram instance without switching to it');
  resumed.length=0;
  const hiddenResumeHarness=new Function('document','profiles','appForPlatform','refreshUnreadCount',`${resumeCode};return refreshTelegramUnreadCountsOnResume;`)({visibilityState:'hidden'},
    {value:[{id:'tg-a',platform:'telegram-a'}]},platform=>'telegram',id=>resumed.push(id));
  hiddenResumeHarness();
  assert.deepEqual(resumed,[],'hidden visibility events do not trigger redundant scans');
  assert.match(source,/window\.addEventListener\('focus',\s*refreshTelegramUnreadCountsOnResume\)/);
  assert.match(source,/document\.addEventListener\('visibilitychange',\s*refreshTelegramUnreadCountsOnResume\)/);
  console.log('unread-refresh: overlap, unavailable state, confirmed clear, reload, removal and navigation recovery passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

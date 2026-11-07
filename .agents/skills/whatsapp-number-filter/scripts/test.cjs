const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { page } = require('./page.cjs');

function fixture(values) {
  const numbers = Object.keys(values);
  const anchors = numbers.map(number => ({ textContent: number, scrollIntoView() {}, click() {}, __reactFiber$test: { memoizedProps: { canonicalPhone: '+'+number }, memoizedState: null } }));
  let expanded = 1;
  const node = {
    get textContent() { return numbers.slice(0,expanded).join('\n'); },
    getAttribute() { return 'bubble'; },
    scrollIntoView() {},
    querySelectorAll() { return anchors.slice(0,expanded); },
    querySelector(selector) { return selector.includes('caption-read-more') ? (expanded < numbers.length ? {click(){expanded++;}} : null) : { textContent: this.textContent }; }
  };
  const calls = [];
  const query = { getOrRun(phone) { calls.push(phone);const value=values[phone.slice(1)];return value instanceof Error ? Promise.reject(value) : Promise.resolve(value); } };
  function component(e){return e!=null&&e.wid?'usyncContactCached getOrRun mi-message-on-whatsapp':null;}
  const context = vm.createContext({ location:{origin:'https://web.whatsapp.com'}, navigator:{onLine:true}, window:{require(name){return name==='__debug'?{modulesMap:{'WAWebPhoneNumberWrapperMutatorComponent.react':{defaultExport:component}}}:{usyncContactCached:()=>query};}}, document:{querySelector(){return node;},querySelectorAll(){return [node];}}, setTimeout:(fn,ms)=>setTimeout(fn,ms===20000?ms:0),clearTimeout,Map,Set,Date,Promise });
  const run=(action,options={})=>vm.runInContext('('+page.toString()+')('+JSON.stringify(action)+','+JSON.stringify(options)+')',context);
  return { run, context, calls, node };
}

test('repeated Read more is exhausted before collecting and querying',async()=>{
  const f=fixture({'12025550101':{wid:{}},'12025550102':null,'12025550103':{wid:{}}});
  const collected=await f.run('collect',{bubbles:['bubble']});
  assert.equal(collected.totalEntries,3);assert.equal(collected.bubbles[0].fullyExpanded,true);assert.equal(f.calls.length,0);
  await f.run('start',{concurrency:2});await f.context.window.__codexWhatsappNumberFilter.job;
  const status=await f.run('status');assert.equal(status.checked,3);assert.equal(status.counts.registered,2);assert.equal(status.counts['not-registered'],1);
  await assert.rejects(()=>f.run('start'),/already started/);
});

test('rate limit remains unknown and stops dispatching new requests',async()=>{
  const f=fixture({'12025550101':{wid:{}},'12025550102':new Error('429 rate limit'),'12025550103':null});
  await f.run('collect',{bubbles:['bubble']});await f.run('start',{concurrency:1});await f.context.window.__codexWhatsappNumberFilter.job;
  const status=await f.run('status');assert.equal(status.checked,2);assert.equal(status.remaining,1);assert.equal(status.counts.unknown,1);assert.equal(f.calls.length,2);assert.match(status.stopReason,/429/);
});

test('export preserves duplicate entries and includes unqueried rows in denominator',async()=>{
  const f=fixture({'12025550101':{wid:{}}});await f.run('collect',{bubbles:['bubble']});
  const audit=f.context.window.__codexWhatsappNumberFilter;
  audit.bubbles[0].numbers=['12025550101','12025550101','12025550102'];audit.unique=['12025550101','12025550102'];
  audit.results={'12025550101':{status:'registered'}};
  await assert.rejects(()=>f.run('export'),/UI verification/);
  audit.uiCrossCheck=[{expected:'registered',agrees:true}];
  const report=await f.run('export');assert.equal(report.totalEntries,3);assert.equal(report.uniqueNumbers,2);assert.equal(report.counts.registered,2);assert.equal(report.counts.unknown,1);assert.equal(report.complete,false);assert.ok(Math.abs(report.registeredPercentage-200/3)<0.0001);
});

test('unrecognized current UI contract is rejected before any queries',async()=>{
  const f=fixture({'12025550101':{wid:{}}});await f.run('collect',{bubbles:['bubble']});
  f.context.window.require=()=>({modulesMap:{},usyncContactCached:()=>({getOrRun(){throw new Error('must not call');}})});
  await assert.rejects(()=>f.run('start'),/contract differs/);assert.equal(f.calls.length,0);
});

test('TXT import runs without chat bubbles and exports unknown separately',async()=>{
 const f=fixture({'12025550101':{wid:{}},'12025550102':null});
 await f.run('import',{numbers:['12025550101','12025550102']});await f.run('start',{concurrency:2});await f.context.window.__codexWhatsappNumberFilter.job;
 const report=await f.run('export');assert.equal(report.uniqueNumbers,2);assert.equal(report.counts.registered,1);assert.equal(report.counts['not-registered'],1);assert.equal(report.registeredPercentage,50);
});

test('initial account synchronization is distinguished from waiting for QR login',async()=>{
 const f=fixture({});f.context.document.querySelector=()=>null;f.context.document.body={innerText:'请不要关闭此窗口，你的消息正在下载中。'};
 const state=await f.run('connection');assert.equal(state.loggedIn,false);assert.equal(state.phase,'syncing');
});

const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/App.vue'),'utf8');
const ast=ts.createSourceFile('App.ts',source.slice(source.indexOf('>')+1,source.indexOf('</script>')),ts.ScriptTarget.Latest,true);
const names=['clearTranslationRuntimeCache','handleWebviewDomReady','handleWebviewRuntimeFailure'];
const declarations=names.map(name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(ast)).join('\n');
const cleanup=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='clearTranslationRuntimeCache').getText(ast);
const context={};
for(const match of cleanup.matchAll(/\b(\w+)\.(?:get|delete|keys|entries|values|has|set)\(/g))context[match[1]]=new Map();
let nextTimer=0,aborted=0;const timers=new Map(),ticks={removed:0,remaining:0};
const interval=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,delay});return id;};
const timeout=(callback,delay)=>interval(callback,delay);
Object.assign(context,{clearInterval:id=>timers.delete(id),clearTimeout:id=>timers.delete(id),profiles:{value:[{id:'remaining',platform:'opensms'}]},webComposerDiagnosticStatus:{value:{}},
  clearSmartReplyStateForProfile:()=>{},cancelQueuedTranslationsForProfile:()=>{},clearTranslatedMessageMarks:()=>{},rebuildTranslationHotCacheStats:()=>{},
  resetWebTranslationRuntime:()=>{throw Error('Removed webview must not restart its runtime');}});
const functions=new Function('context','with(context){'+ts.transpileModule(declarations,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+`;return {${names.join(',')}};}`)(context);
for(const profileId of ['removed','remaining']){
  const tick=()=>ticks[profileId]++;
  context.composerInstallIntervals.set(profileId,interval(tick,1500));
  context.translationIntervals.set(profileId,interval(tick,3500));
  context.translationIntervals.set('voice:'+profileId,interval(tick,15000));
  context.composerEventPollIntervals.set(profileId,timeout(tick,300));
  context.profileTranslationRefreshTimers.set(profileId,timeout(tick,80));
  context.webComposerProbeIntervals.set(profileId,interval(tick,1000));
  context.webRuntimeControllers.set(profileId,{abort:()=>aborted++});
}
functions.clearTranslationRuntimeCache('removed');
for(const name of ['composerInstallIntervals','translationIntervals','composerEventPollIntervals','profileTranslationRefreshTimers','webComposerProbeIntervals']){
  assert.equal(context[name].has('removed'),false,name+' must release the removed profile');
  assert.equal(context[name].has('remaining'),true,name+' must preserve the other profile');
}
assert.equal(context.translationIntervals.has('voice:removed'),false);
assert.equal(context.translationIntervals.has('voice:remaining'),true);
for(const timer of timers.values())timer.callback();
assert.equal(ticks.removed,0,'no removed-profile callback may keep running');
assert.equal(ticks.remaining,6,'the other profile keeps all its existing schedules');
assert.equal(aborted,1);
assert.equal(context.webRuntimeGenerations.get('removed'),1);
functions.clearTranslationRuntimeCache('removed');assert.equal(timers.size,6,'cleanup is safe to repeat');
const staleEvent={currentTarget:{executeJavaScript:()=>{throw Error('Removed page must not execute scripts');}}};
functions.handleWebviewDomReady(staleEvent,{id:'removed',platform:'opensms'});
functions.handleWebviewRuntimeFailure(staleEvent,{id:'removed',platform:'opensms'});
assert.equal(timers.size,6,'late page events cannot recreate removed-profile timers');
console.log('profile-runtime-cleanup: removed-profile timers/callbacks released, other profiles preserved, repeat cleanup and stale webview events passed');

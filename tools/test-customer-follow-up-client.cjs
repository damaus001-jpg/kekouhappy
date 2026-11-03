const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
let now=0,nextTimer=0,fail=false,blockNext=null;const timers=new Map(),saved=[];
const clock={now:()=>now};
const setTimer=(callback,delay)=>{const id=++nextTimer;timers.set(id,{at:now+delay,callback});return id;};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const advance=async ms=>{const until=now+ms;for(;;){const next=[...timers].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].callback();await settle();}now=until;await settle();};
const document={documentElement:{inert:false}};
const window={chatTranslator:{saveCustomer:async(target,record)=>{
  saved.push({target:structuredClone(target),record:structuredClone(record)});
  if(blockNext){const waiting=blockNext;blockNext=null;await waiting;}
  if(fail)throw Error('Fixture storage unavailable');
  return {...structuredClone(record),updatedAt:now+1};
}}};
const code=ts.transpileModule(fs.readFileSync(path.join(root,'src/customer-follow-up-client.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const client=new Function('exports','require','window','document','setTimeout','clearTimeout','Date',code+';return exports;')({},name=>{assert.equal(name,'vue');return require('vue');},window,document,setTimer,id=>timers.delete(id),clock);
const make=(id)=>client.customerState({platform:'whatsapp',profileId:'profile-a',contactId:id,contactTitle:id},{key:id,record:{values:{},entries:[],draft:{talked:'',next:'',editingId:''},updatedAt:0}});
const edit=(state,text)=>{state.record.values['备注']=text;client.changedCustomer(state);};
(async()=>{
 const a=make('a');
 for(let i=0;i<5;i++){edit(a,'typing-'+i);if(i<4)await advance(100);}
 assert.equal(saved.length,0);await advance(client.customerSaveDelayMs-1);assert.equal(saved.length,0);
 await advance(1);assert.equal(saved.length,1);assert.equal(saved[0].record.values['备注'],'typing-4');assert.equal(a.savedRevision,a.revision);
 const baseline=saved.length;
 for(let i=0;i<21;i++){edit(a,'continuous-'+i);await advance(100);}
 assert.ok(saved.length>baseline,'continuous typing reaches the maximum wait instead of postponing forever');
 await advance(client.customerSaveDelayMs);assert.equal(saved.at(-1).record.values['备注'],'continuous-20');
 let releaseBackground;blockNext=new Promise(resolve=>releaseBackground=resolve);
 edit(a,'background snapshot');await advance(client.customerSaveDelayMs);const backgroundCount=saved.length;
 edit(a,'typed during background save');await advance(100);releaseBackground();await settle();
 assert.equal(saved.length,backgroundCount,'typing during a background save still waits for its next batch');
 await advance(client.customerSaveDelayMs);assert.equal(saved.length,backgroundCount+1);assert.equal(saved.at(-1).record.values['备注'],'typed during background save');
 edit(a,'flush immediately');const beforeFlush=saved.length;await client.awaitCustomerSaved(a);assert.equal(saved.length,beforeFlush+1);
 await advance(3000);assert.equal(saved.length,beforeFlush+1,'explicit flush cancels the delayed duplicate save');
 let unblock;blockNext=new Promise(resolve=>unblock=resolve);
 edit(a,'in-flight old');const first=client.flushCustomer(a);await settle();const beforeSecond=saved.length;
 edit(a,'in-flight latest');assert.equal(client.flushCustomer(a),first,'overlapping flush callers share the same in-flight save');
 assert.equal(saved.length,beforeSecond);unblock();await first;
 assert.equal(saved.at(-1).record.values['备注'],'in-flight latest');assert.equal(a.savedRevision,a.revision);
 const b=make('b');edit(a,'A final');edit(b,'B final');await client.awaitAllCustomersSaved();
 assert.equal(saved.findLast(item=>item.target.contactId==='a').record.values['备注'],'A final');
 assert.equal(saved.findLast(item=>item.target.contactId==='b').record.values['备注'],'B final');
 fail=true;edit(a,'retain after failure');await client.flushCustomer(a);assert.match(a.error,/storage unavailable/);assert.ok(a.savedRevision<a.revision);
 await assert.rejects(client.awaitAllCustomersSaved(),/storage unavailable/);assert.equal(a.record.values['备注'],'retain after failure');
 fail=false;await client.awaitCustomerSaved(a);assert.equal(a.error,'');assert.equal(a.savedRevision,a.revision);
 edit(a,'pending before import');const beforeImport=saved.length;
 client.applyCustomerImport(a,{record:{values:{备注:'imported'},entries:[],draft:{talked:'',next:'',editingId:''},updatedAt:123}});
 await advance(3000);assert.equal(saved.length,beforeImport,'an old delayed draft cannot overwrite an import');assert.equal(a.record.values['备注'],'imported');
 client.installCustomerExitSaveHandler();edit(a,'exit draft');await window.__dfFlushCustomerWritesBeforeExit();
 assert.equal(saved.at(-1).record.values['备注'],'exit draft');assert.equal(document.documentElement.inert,true,'editing pauses while native exit continues');
 window.__dfResumeCustomerEditing();assert.equal(document.documentElement.inert,false);
 fail=true;edit(b,'exit failure draft');await assert.rejects(window.__dfFlushCustomerWritesBeforeExit(),/storage unavailable/);
 assert.equal(document.documentElement.inert,false,'a failed exit save restores editing');assert.equal(b.record.values['备注'],'exit failure draft');
 fail=false;await client.awaitAllCustomersSaved();assert.equal(timers.size,0);
 console.log('customer-follow-up-client: trailing save/max wait, immediate flush, in-flight edits, account binding, failures/retry, import and exit draft preservation passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

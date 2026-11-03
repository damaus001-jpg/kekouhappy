const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../electron/main.ts'),'utf8');
const tree=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const names=['flushMainWindowCustomerWrites','reportCustomerSaveExitFailure','prepareCustomerWritesForQuit','deferWindowCloseForCustomerWrites'];
const functions=names.map(name=>{const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node,name);return node.getText(tree);}).join('\n');
const hook=tree.statements.find(n=>ts.isIfStatement(n)&&n.getText(tree).startsWith("if (!backgroundWorkerMode) app.on('before-quit'"));assert.ok(hook);
const compiled=ts.transpileModule(functions+'\n'+hook.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
 const events=[],timers=new Map();let destroyed=false,handler,save=()=>Promise.resolve(),nextTimer=0;
 const context={Error,Promise,backgroundWorkerMode:false,customerQuitSaveReady:false,customerQuitSavePromise:null,customerWindowCloseReady:false,customerWindowClosePromise:null,
  signalShutdownBeforeQuitDone:false,signalShutdownBeforeQuitTimer:null,signalShutdownBeforeQuitPromise:null,gracefulQuitTimeoutMs:8000,runtimeLoggingEnabled:false,
  isTrustedMainUrl:url=>url==='app://fixture',setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
  dialog:{showMessageBox:async(_win,options)=>{events.push('error-dialog');assert.match(options.message,/取消退出/);}},
  stopAllSignalProfilesForQuit:async()=>{events.push('stop-signal');},cleanupPackagedRuntimeLogs:async()=>{events.push('cleanup-logs');},stopRemoteGuard:()=>events.push('stop-guard'),
  app:{on:(name,callback)=>{assert.equal(name,'before-quit');handler=callback;},quit:()=>{let prevented=false;handler({preventDefault:()=>{prevented=true;}});if(!prevented)events.push('quit');}},
  mainWindow:{isDestroyed:()=>destroyed,webContents:{isDestroyed:()=>destroyed,getURL:()=> 'app://fixture',executeJavaScript:code=>{
   if(code.includes('__dfResumeCustomerEditing')){events.push('resume-editing');return Promise.resolve();}
   assert.match(code,/__dfFlushCustomerWritesBeforeExit/);events.push('flush');return save();
  }},close:()=>{let prevented=false;context.deferWindowCloseForCustomerWrites({preventDefault:()=>{prevented=true;}});if(!prevented){destroyed=true;events.push('closed');}}}
 };
 vm.createContext(context);vm.runInContext(compiled,context);
 return {context,events,timers,setSave:fn=>save=fn,destroyed:()=>destroyed};
}
(async()=>{
 const f=fixture();f.setSave(()=>Promise.reject(Error('fixture disk unavailable')));
 f.context.app.quit();await f.context.customerQuitSavePromise;
 assert.deepEqual(f.events,['flush','resume-editing','error-dialog']);assert.equal(f.context.signalShutdownBeforeQuitPromise,null,'save failure leaves Signal and the rest of the client running');
 assert.equal(f.context.customerQuitSaveReady,false);assert.equal(f.timers.size,0);
 const pending=deferred();f.setSave(()=>pending.promise);f.context.app.quit();f.context.app.quit();
 assert.equal(f.events.filter(e=>e==='flush').length,2,'repeated quit requests share a single save');assert.equal(f.events.includes('stop-signal'),false);
 pending.resolve();await f.context.customerQuitSavePromise;await f.context.signalShutdownBeforeQuitPromise;
 assert.deepEqual(f.events.slice(-5),['flush','stop-signal','cleanup-logs','stop-guard','quit']);assert.equal(f.timers.size,0);
 const c=fixture();c.setSave(()=>Promise.reject(Error('fixture failed close save')));c.context.mainWindow.close();await c.context.customerWindowClosePromise;
 assert.equal(c.destroyed(),false);assert.deepEqual(c.events,['flush','resume-editing','error-dialog']);
 const saving=deferred();c.setSave(()=>saving.promise);c.context.mainWindow.close();c.context.mainWindow.close();
 assert.equal(c.events.filter(e=>e==='flush').length,2);saving.resolve();await c.context.customerWindowClosePromise;
 assert.equal(c.destroyed(),true);assert.equal(c.events.filter(e=>e==='closed').length,1);assert.equal(c.timers.size,0);
 const t=fixture(),hung=deferred();t.setSave(()=>hung.promise);t.context.mainWindow.close();
 const timeout=[...t.timers.values()].find(timer=>timer.delay===30000);assert.ok(timeout);timeout.fn();await t.context.customerWindowClosePromise;
 assert.equal(t.destroyed(),false);assert.deepEqual(t.events,['flush','resume-editing','error-dialog']);assert.equal(t.timers.size,0);hung.resolve();
 const startup=fixture();startup.context.mainWindow=null;assert.equal(startup.context.prepareCustomerWritesForQuit(),true,'early startup without a renderer can still exit');
 console.log('customer-save-exit: close/quit flush ordering, shared requests, failure/timeout draft protection, retry and startup exit passed');
})().catch(error=>{console.error(error);process.exitCode=1;});

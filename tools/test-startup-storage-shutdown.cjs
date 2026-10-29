const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../electron/main.ts'),'utf8'),tree=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const names=['initializeUserDataPath','stopAllSignalProfilesForQuit'];
const functions=names.map(name=>tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(tree)).join('\n');
const beforeQuit=tree.statements.find(n=>ts.isIfStatement(n)&&n.getText(tree).startsWith("if (!backgroundWorkerMode) app.on('before-quit'"));assert.ok(beforeQuit);
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
  let authorized=false,reads=0,killed=0,sockets=0,failSaved=true,choice=2,selection,applied='',saved='',quitHandler,quits=0,logs=0,fresh=false;
  const old='H:\\fffffffff\\maoyi Data',local='C:\\local\\maoyi Data';
  const context={Error,app:{isPackaged:true,on:(_event,handler)=>quitHandler=handler,quit:()=>quits++},appDisplayName:'Fixture',userDataOverride:'',defaultUserDataPath:'C:\\default',appDataFolderName:'maoyi Data',
    storageBootstrapPath:()=> 'bootstrap',readFile:async()=>{if(fresh)throw Object.assign(Error('no bootstrap on new PC'),{code:'ENOENT'});return JSON.stringify({dataPath:old});},
    mkdir:async target=>{if(target===old&&failSaved)throw Object.assign(Error('mapped drive unavailable'),{code:'ENOENT'});},
    applyUserDataPath:p=>applied=p,saveStorageBootstrap:async p=>saved=p,pathExists:async()=>!fresh,join:path.win32.join,
    dialog:{showMessageBox:async options=>{assert.ok(options.detail?.includes(old)||options.message.includes('未选择'));if(choice===0)failSaved=false;return {response:choice};},showOpenDialog:async()=>selection},
    clientLicenseManager:{isRuntimeAllowed:()=>authorized},signalProcesses:new Map(),signalControlClients:new Map(),signalControlSessions:new Map(),
    readConfig:async()=>{reads++;if(!authorized)throw Error('not authorized');return {profiles:[{platform:'signal',id:'a',signalDataDir:local}]};},
    signalInstancePath:id=>id,killSignalProcessesByDataDir:async()=>killed++,
    backgroundWorkerMode:false,signalShutdownBeforeQuitDone:false,signalShutdownBeforeQuitTimer:null,signalShutdownBeforeQuitPromise:null,gracefulQuitTimeoutMs:8000,
    setTimeout:()=>1,clearTimeout:()=>{},cleanupPackagedRuntimeLogs:async()=>{throw Error('fixture cleanup failure');},runtimeLoggingEnabled:true,console:{error:()=>logs++},stopRemoteGuard:()=>{}
  };
  vm.createContext(context);vm.runInContext(compile(functions),context);
  assert.equal(await context.initializeUserDataPath(),false,'unavailable mapped data can exit cleanly');assert.equal(applied,'');assert.equal(saved,'');
  choice=0;assert.equal(await context.initializeUserDataPath(),true);assert.equal(applied,old,'retry preserves the original data root');
  failSaved=true;choice=1;selection={canceled:true,filePaths:[]};applied='';assert.equal(await context.initializeUserDataPath(),false);assert.equal(saved,'','cancel cannot overwrite the saved data location');
  selection={canceled:false,filePaths:['C:\\local']};assert.equal(await context.initializeUserDataPath(),true);assert.equal(applied,local);assert.equal(saved,local,'only explicit new selection updates the data root');
  fresh=true;applied='';saved='';selection={canceled:true,filePaths:[]};assert.equal(await context.initializeUserDataPath(),false);assert.equal(saved,'','fresh C-only device can cancel without creating a data location');
  selection={canceled:false,filePaths:['C:\\local']};assert.equal(await context.initializeUserDataPath(),true);assert.equal(applied,local);assert.equal(saved,local,'fresh C-only device selects local data without any H drive');
  context.signalProcesses.set('a',{exitCode:null,killed:false,kill:()=>killed++});context.signalControlClients.set('a',{socket:{destroy:()=>sockets++}});
  await context.stopAllSignalProfilesForQuit();assert.equal(reads,0);assert.equal(killed,1);assert.equal(sockets,1,'tracked processes still stop without a license');
  context.clientLicenseManager=null;await context.stopAllSignalProfilesForQuit();assert.equal(reads,0,'early initialization failure can quit');
  context.clientLicenseManager={isRuntimeAllowed:()=>true};authorized=true;await context.stopAllSignalProfilesForQuit();assert.equal(reads,1);assert.equal(killed,2,'authorized cleanup still handles configured instances');
  vm.runInContext(compile(beforeQuit.getText(tree)),context);quitHandler({preventDefault:()=>{}});await context.signalShutdownBeforeQuitPromise;
  assert.equal(quits,1);assert.equal(logs,1);assert.equal(context.signalShutdownBeforeQuitDone,true,'cleanup errors cannot become unhandled startup failures');
  console.log('startup/shutdown: unavailable mapped root retry/selection/cancel, separate install/data roots, pre-license process cleanup, early-init exit and caught cleanup failures passed; disk and processes mocked');
})().catch(error=>{console.error(error);process.exitCode=1;});

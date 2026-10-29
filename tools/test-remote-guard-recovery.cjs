const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const main=fs.readFileSync(path.join(root,'electron/main.ts'),'utf8');
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8').split('<script setup lang="ts">')[1].split('</script>')[0];
function functions(source,names){const tree=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true);return names.map(name=>{const fn=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(fn,name);return fn.getText(tree);}).join('\n');}
function evaluate(source,context){vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);}
const ref=value=>({value});
(async()=>{
  const handlers=new Map();let pinEnabled=false,releaseCount=0,lockUiCount=0,authorizations=0;
  const backend={remoteGuardIncidentLatched:true,remoteGuardThreatActive:false,remoteGuardStatus:{incidentLatched:true,threatActive:false},
    assertClientRuntimeAllowed:()=>{authorizations++;throw Error('Client license not activated');},
    assertTrustedIpcSender:event=>{if(!event.trusted)throw Error('Untrusted renderer');},
    ipcMain:{handle:(channel,handler)=>handlers.set(channel,handler)},
    getLockScreenStatus:async()=>({enabled:pinEnabled}),engageWorkspaceVisibilityLock:async()=>{},
    unlockLockScreen:async pin=>({ok:pin==='12345678',status:{enabled:true}}),assertText:value=>value,
    releaseWorkspaceVisibilityLock:()=>releaseCount++,
    clearRemoteGuardIncident:()=>{backend.remoteGuardIncidentLatched=false;backend.remoteGuardStatus={incidentLatched:false,threatActive:false};}
  };
  vm.createContext(backend);
  evaluate(functions(main,['assertLockScreenRecoveryAllowed','trustedHandle','acknowledgeRemoteGuardIncident']),backend);
  for(const channel of ['status','engage','unlock']){
    const line=main.split('\n').find(l=>l.includes(`trustedHandle('lock-screen:${channel}',`));assert.ok(line);evaluate(line,backend);
  }
  const invoke=(channel,...args)=>handlers.get('lock-screen:'+channel)({trusted:true},...args);
  const renderer={Error,remoteGuardStatus:ref(backend.remoteGuardStatus),lockScreenStatus:ref(null),remoteGuardRecoveryPrompt:ref(false),remoteGuardMessage:ref(''),lockGuideVisible:ref(false),signedIn:ref(false),
    window:{chatTranslator:{getLockScreenStatus:()=>invoke('status'),acknowledgeRemoteGuardIncident:()=>backend.acknowledgeRemoteGuardIncident()}},
    showLockScreen:async()=>{await invoke('engage');lockUiCount++;},
    applyRemoteGuardStatus:status=>renderer.remoteGuardStatus.value=status,
    scheduleSignalWorkspaceSyncBurst:()=>{}
  };
  vm.createContext(renderer);evaluate(functions(app,['initializeLockScreen','beginRemoteGuardRecovery']),renderer);
  await renderer.beginRemoteGuardRecovery();
  assert.equal(renderer.remoteGuardStatus.value.incidentLatched,false,'clicking recover clears the overlay before license activation');
  assert.equal(renderer.signedIn.value,false,'recovery returns to the login page without signing in');assert.equal(releaseCount,1);assert.equal(authorizations,0);
  backend.remoteGuardIncidentLatched=true;backend.remoteGuardStatus={incidentLatched:true,threatActive:false};renderer.remoteGuardStatus.value=backend.remoteGuardStatus;renderer.lockScreenStatus.value=null;pinEnabled=true;
  await renderer.beginRemoteGuardRecovery();assert.equal(lockUiCount,1);assert.equal(renderer.remoteGuardRecoveryPrompt.value,true);assert.equal(backend.remoteGuardIncidentLatched,true,'PIN recovery does not clear an incident before verification');assert.equal((await backend.acknowledgeRemoteGuardIncident()).ok,false);
  assert.equal((await invoke('unlock','bad')).ok,false);assert.equal((await invoke('unlock','12345678')).ok,true);
  backend.remoteGuardThreatActive=true;assert.throws(()=>invoke('status'),/not activated/);backend.remoteGuardThreatActive=false;backend.remoteGuardIncidentLatched=false;assert.throws(()=>invoke('unlock','12345678'),/not activated/,'normal lock access retains runtime authorization');
  backend.remoteGuardIncidentLatched=true;assert.throws(()=>handlers.get('lock-screen:status')({trusted:false}),/Untrusted renderer/);
  renderer.remoteGuardStatus.value={incidentLatched:true,threatActive:false};renderer.lockScreenStatus.value=null;renderer.window.chatTranslator.getLockScreenStatus=async()=>{throw Error('Fixture read failure');};
  await renderer.beginRemoteGuardRecovery();assert.equal(renderer.remoteGuardRecoveryPrompt.value,false);assert.equal(renderer.remoteGuardMessage.value,'Fixture read failure','failed recovery remains visible and retryable');
  console.log('remote guard login recovery: pre-activation confirmation returns to login, PIN recovery retained, untrusted/active/ordinary access guarded, errors visible; all lock calls mocked');
})().catch(error=>{console.error(error);process.exitCode=1;});

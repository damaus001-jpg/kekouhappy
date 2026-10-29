const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../electron/main.ts'),'utf8');
const tree=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const names=['profileStorageError','assertProfileStorageAvailable','createProfileRecord'];
const code=names.map(name=>{const node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node,name);return node.getText(tree);}).join('\n');
let rootError,childError,isDirectory=true,reads=0,writes=0,sessions=0,config;
const root='H:\\fffffffff\\maoyi Data';
const context={Error,Object,Date,app:{getPath:()=>root},stat:async()=>{if(rootError)throw Object.assign(Error('fixture'),{code:rootError});return {isDirectory:()=>isDirectory};},
  mkdir:async()=>{if(childError)throw Object.assign(Error('fixture'),{code:childError});},
  readConfig:async()=>{reads++;return config;},randomId:()=> '49189949-ceb4-4d1c-a887-9979e150174d',platformDefaults:{signal:{label:'Signal'},whatsapp:{label:'WhatsApp'}},
  signalInstancePath:id=>path.win32.join(root,'SignalInstances','Signal-'+id),buildFingerprint:()=>({}),userAgentForPlatform:()=> 'fixture',activeRuntimeSecurity:null,
  configureSession:()=>sessions++,saveConfig:async()=>writes++,workspaceAppForPlatform:p=>p};
vm.createContext(context);vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
function reset(){config={profiles:[],profileTabOrder:[],lastActiveProfileIds:{}};reads=writes=sessions=0;rootError=childError=undefined;isDirectory=true;}
(async()=>{
  for(const failure of ['ENOENT','EACCES','EIO','ENODEV']){
    reset();rootError=failure;await assert.rejects(context.createProfileRecord('signal','A','G'),e=>e.message.includes(root)&&e.message.includes(failure));
    assert.equal(reads,0,'unavailable root cannot be interpreted as an empty configuration');assert.equal(writes,0);assert.equal(sessions,0);
  }
  reset();isDirectory=false;await assert.rejects(context.createProfileRecord('signal','A','G'),/ENOTDIR/);assert.equal(reads,0);
  for(const failure of ['ENOENT','ENOSPC','EPERM']){
    reset();childError=failure;await assert.rejects(context.createProfileRecord('signal','A','G'),e=>e.message.includes('SignalInstances')&&e.message.includes(failure));
    assert.equal(config.profiles.length,0);assert.equal(writes,0);assert.equal(sessions,0);
  }
  childError=undefined;const profile=await context.createProfileRecord('signal','A','G');assert.ok(profile.signalDataDir.startsWith(root));assert.equal(config.profiles.length,1);assert.equal(writes,1);assert.equal(sessions,1,'restoring the same directory permits retry without switching data roots');
  reset();await context.createProfileRecord('whatsapp','A','G');assert.equal(writes,1);
  console.log('profile storage: disconnected roots, invalid paths, permissions, disk full, unchanged config on failure, same-root recovery and normal creation passed; filesystem and sessions mocked');
})().catch(error=>{console.error(error);process.exitCode=1;});

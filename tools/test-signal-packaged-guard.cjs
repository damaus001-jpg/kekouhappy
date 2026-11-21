const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const [runtimeArgument,uiReportArgument]=process.argv.slice(2);
if(!runtimeArgument||!uiReportArgument)throw new Error('Usage: node tools/test-signal-packaged-guard.cjs <packaged-runtime> <isolated-ui-report>');
const runtime=path.resolve(runtimeArgument),uiReport=path.resolve(uiReportArgument);
const uiRoot=path.join(root,'.tmp','signal-source-ui')+path.sep;
if(!uiReport.startsWith(uiRoot))throw new Error('Only an isolated Signal UI fixture is accepted');
const fixture=JSON.parse(fs.readFileSync(uiReport,'utf8'));
assert.equal(fixture.result,'passed');assert.ok(path.resolve(fixture.userData).startsWith(uiRoot));
const testRoot=fs.mkdtempSync(path.join(root,'.tmp','signal-packaged-guard-'));
const localRoot=path.join(testRoot,'local','maoyi Data'),foreignRoot=path.join(testRoot,'foreign','maoyi Data');
for(const dir of [localRoot,foreignRoot])fs.cpSync(fixture.userData,dir,{recursive:true,errorOnExist:true,force:false});
const temp=path.join(testRoot,'os-temp'),appData=path.join(testRoot,'appdata');fs.mkdirSync(temp);fs.mkdirSync(appData);
const marker=path.join(localRoot,'account-preservation.fixture');fs.writeFileSync(marker,crypto.randomBytes(128));
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const protectedFiles=[marker,path.join(localRoot,'runtime-binding.dat'),path.join(localRoot,'SignalInstances','Signal-'+fixture.profileId,'df-instance-binding.dat')];
const database=path.join(localRoot,'SignalInstances','Signal-'+fixture.profileId,'sql','db.sqlite');if(fs.existsSync(database))protectedFiles.push(database);
const before=protectedFiles.map(digest);
const wait=async test=>{for(let attempt=0;attempt<300;attempt++){if(test())return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Guard condition timed out');};
async function launch(dataRoot,name,extra=[]){
 const diagnostic=path.join(testRoot,name+'.json');
 const child=spawn(path.join(runtime,'Signal.exe'),['--user-data-dir='+path.join(dataRoot,'SignalInstances','Signal-'+fixture.profileId),...extra],{cwd:runtime,windowsHide:true,stdio:'ignore',env:{...process.env,APPDATA:appData,TEMP:temp,TMP:temp,MAOYI_SIGNAL_GUARD_DIAGNOSTIC:diagnostic,MAOYI_SIGNAL_GUARD_TEST_AUTOCLOSE:'1'}});
 child.on('error',()=>{});
 await wait(()=>child.exitCode!==null);assert.equal(child.exitCode,0,name+' should be blocked before main');
 return JSON.parse(fs.readFileSync(diagnostic,'utf8'));
}
(async()=>{
 assert.equal((await launch(localRoot,'direct')).stage,'local-direct-blocked');
 assert.deepEqual(protectedFiles.map(digest),before,'direct launch preserves local account files');
 const pipe='\\\\.\\pipe\\signal-negative-credential-'+crypto.randomBytes(12).toString('hex');
 const server=net.createServer(socket=>socket.end('{}\n'));await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
 try{assert.equal((await launch(localRoot,'forged',['--df','--windowMode=embed','--appId=Signal-'+fixture.profileId,'--wsPort=12345','--dfLaunchPipe='+pipe])).stage,'local-direct-blocked');}
 finally{server.close();}
 assert.deepEqual(protectedFiles.map(digest),before,'forged credential preserves local account files');
 const bindingFile=path.join(foreignRoot,'runtime-binding.dat'),binding=JSON.parse(fs.readFileSync(bindingFile,'utf8'));
 binding.signature=Buffer.alloc(64,7).toString('base64url');fs.writeFileSync(bindingFile,JSON.stringify(binding));
 assert.equal((await launch(foreignRoot,'foreign')).stage,'foreign-initializing');
 await wait(()=>!fs.existsSync(foreignRoot));assert.deepEqual(protectedFiles.map(digest),before,'foreign simulation cannot alter local fixture');
 const report={checkedAt:new Date().toISOString(),runtime,uiReport,checks:{packagedSignalDirectLaunchBlocked:true,forgedCredentialBlocked:true,localBindingAndAccountDataPreserved:true,foreignSignatureSimulationResetOnlyForeignFixture:true},limitations:['Foreign clone is a same-machine invalid-signature simulation, not a second physical device or VM test.']};
 fs.writeFileSync(path.join(testRoot,'verification.json'),JSON.stringify(report,null,2)+'\n');
 console.log('signal-packaged-guard: direct/forged launch blocked, local account data preserved, simulated foreign fixture reset; report='+path.join(testRoot,'verification.json'));
})().catch(error=>{console.error(error);process.exitCode=1;});

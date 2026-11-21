const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 const child=require('node:child_process').spawn(require('electron'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,stdio:'inherit'});
 child.on('exit',code=>{process.exitCode=code??1;});child.on('error',error=>{console.error(error);process.exitCode=1;});
}else{
 process.noAsar=true;
 const electron=require('electron'),{app,safeStorage}=electron;
 const {extractLicenseManager}=require('./upgrade-bundle-extract.cjs');
 const source=path.resolve('D:/new huancun 001/maoyi Data');
 const reuseSnapshot=process.argv.find(value=>value.startsWith('--snapshot='))?.slice('--snapshot='.length);
 const testRoot=reuseSnapshot?fs.realpathSync(path.resolve(reuseSnapshot)):fs.mkdtempSync(path.join(root,'.tmp/upgrade-data-copy-'));
 if(!testRoot.startsWith(path.join(root,'.tmp','upgrade-data-copy-')))throw new Error('Snapshot must be a workspace upgrade-data-copy fixture');
 const dataRoot=path.join(testRoot,'business-data'),appData=path.join(testRoot,'app-data'),cryptoRoot=path.join(testRoot,'oscrypt');
 fs.mkdirSync(cryptoRoot,{recursive:true});
 const originalLocalState=path.join(process.env.APPDATA,'maoyi/Local State');
 fs.copyFileSync(originalLocalState,path.join(cryptoRoot,'Local State'));
 app.setPath('userData',cryptoRoot);
 const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
 const excluded=new Set(['cache','code cache','gpucache','dawncache','grshadercache','shadercache','crashpad','logs','temp']);
 const transient=/^(?:LOCK|lockfile|SingletonLock|SingletonCookie|SingletonSocket)$/i;
 function enumerate(directory,relative=''){
  const result=[];
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
   if(entry.isSymbolicLink())throw new Error('Refusing linked files in upgrade snapshot');
   const child=path.join(directory,entry.name),name=path.join(relative,entry.name);
   if(entry.isDirectory()){if(!excluded.has(entry.name.toLowerCase()))result.push(...enumerate(child,name));}
   else if(entry.isFile()&&!transient.test(entry.name))result.push({relative:name,size:fs.statSync(child).size});
  }return result;
 }
 const timeout=setTimeout(()=>{console.error('Upgrade data-copy verification timed out');app.exit(1);},600000);
 app.whenReady().then(async()=>{
  assert.ok(safeStorage.isEncryptionAvailable(),'Windows data decryption must be available');
  const files=enumerate(source),bytes=files.reduce((sum,file)=>sum+file.size,0);
  if(bytes>12*1024**3)throw new Error('Snapshot exceeds safe workspace size budget');
  console.log('Upgrade snapshot: '+files.length+' persistent files, '+bytes+' bytes; source is read-only');
  const hashes=new Map();
  for(let index=0;index<files.length;index++){
   const file=files[index],from=path.join(source,file.relative),to=path.join(dataRoot,file.relative);
   await fsp.mkdir(path.dirname(to),{recursive:true});
   let matched=false;
   for(let attempt=0;attempt<3;attempt++){
    const before=await fsp.readFile(reuseSnapshot?to:from);if(!reuseSnapshot)await fsp.writeFile(to,before);
    const after=await fsp.readFile(from);
    if(hash(before)===hash(after)){hashes.set(file.relative,hash(before));matched=true;break;}
   }
   if(!matched)throw new Error('A live persistent file kept changing; snapshot must be retried');
   if(index&&index%1000===0)console.log('Snapshot copied '+index+' / '+files.length);
  }
  const newResources=process.argv.find(value=>value.startsWith('--new-resources='))?.slice('--new-resources='.length);
  const versions=[{label:'installed-old',resources:path.resolve('D:/fanyiqi/maoyi/resources')},{label:'new-package',resources:path.resolve(newResources||'release/1.16.26-complete-upgrade/win-unpacked/resources')}];
  const publicSuite=JSON.parse(fs.readFileSync(path.join(versions[0].resources,'license-suite-public.json'),'utf8'));
  const originalGuard=path.join(process.env.APPDATA,'maoyi Security',publicSuite.suiteId,'authorization-guard.dat');
  if(fs.existsSync(originalGuard)){
   const target=path.join(appData,'maoyi Security',publicSuite.suiteId,'authorization-guard.dat');fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(originalGuard,target);
  }
  function managerFor(resources){
   const extracted=extractLicenseManager(path.join(resources,'app.asar'));
   const fakeApp={isPackaged:true,getPath:name=>name==='userData'?dataRoot:name==='appData'?appData:app.getPath(name)};
   const fakeElectron=new Proxy(electron,{get:(target,key)=>key==='app'?fakeApp:Reflect.get(target,key)});
   const fakeProcess=new Proxy(process,{get:(target,key)=>key==='resourcesPath'?resources:key==='env'?{...process.env,MAOYI_LICENSE_PUBLIC_SUITE_PATH:undefined}:Reflect.get(target,key)});
   const module={exports:{}};
   vm.runInNewContext(extracted.code,{module,exports:module.exports,require:name=>name==='electron'?fakeElectron:require(name),process:fakeProcess,Buffer,URL,console,setTimeout,clearTimeout},{timeout:10000});
   return {manager:new module.exports.ClientLicenseManager(),digest:hash(Buffer.from(extracted.code))};
  }
  const old=managerFor(versions[0].resources),oldStatus=await old.manager.initialize();
  assert.ok(['authorized','expired'].includes(oldStatus.state),'Existing copied authorization must decrypt and verify: '+oldStatus.state);
  const oldIdentity=hash(fs.readFileSync(path.join(dataRoot,'device-identity.dat')));
  const current=managerFor(versions[1].resources),newStatus=await current.manager.initialize();
  for(const field of ['state','authorized','runtimeAllowed','machineCode','username','usernameLocked','suiteId','keyId','expiresAt'])assert.equal(newStatus[field],oldStatus[field],'Upgrade must preserve authorization '+field);
  assert.equal(hash(fs.readFileSync(path.join(dataRoot,'device-identity.dat'))),oldIdentity,'Upgrade must preserve machine identity');
  let sessionFiles=0,businessFiles=0;
  for(const file of files){
   assert.equal(hash(fs.readFileSync(path.join(dataRoot,file.relative))),hashes.get(file.relative),'Copied persistent data must remain unchanged');
   if(/^(?:Partitions|SignalInstances|opensms-login)[\\/]/.test(file.relative))sessionFiles++;
   if(/^(?:assistant-library|customer-follow-up|security)[\\/]/.test(file.relative))businessFiles++;
  }
  const critical=['config.json','profiles.json','client-account.json','device-identity.dat','license.dat','runtime-binding.dat'];
  for(const name of critical)assert.equal(hash(fs.readFileSync(path.join(source,name))),hashes.get(name),'Real source critical data must remain unchanged');
  const report={checkedAt:new Date().toISOString(),suiteId:publicSuite.suiteId,oldState:oldStatus.state,newState:newStatus.state,persistentFiles:files.length,snapshotBytes:bytes,sessionFilesPreserved:sessionFiles,businessFilesPreserved:businessFiles,checks:{actualOldAndNewPackagedLicenseManagers:true,authorizationAndExpiryPreserved:true,machineCodePreserved:true,identityUnchanged:true,copiedPersistentFilesUnchanged:true,originalCriticalFilesUnchanged:true,browserAccountsNotLaunched:true},licenseReaderIdentical:old.digest===current.digest,scope:'Data-copy compatibility; does not test live platform login or the original installer registry.'};
  report.oldArchiveSha256=hash(fs.readFileSync(path.join(versions[0].resources,'app.asar')));
  report.newArchiveSha256=hash(fs.readFileSync(path.join(versions[1].resources,'app.asar')));
  fs.writeFileSync(path.join(testRoot,'verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));console.log('upgradeDataReport='+path.join(testRoot,'verification.json'));
  clearTimeout(timeout);app.exit(0);
 }).catch(error=>{console.error(error);clearTimeout(timeout);app.exit(1);});
}

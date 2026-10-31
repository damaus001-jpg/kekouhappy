const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {once}=require('node:events');
const {pathToFileURL}=require('node:url');

(async()=>{
  const root=path.resolve(__dirname,'..');
  const executable=path.resolve(process.argv[2]||path.join(root,'release/1.16.19-fixed/win-unpacked/maoyi.exe'));
  assert.ok(fs.existsSync(executable),'packaged client must exist');
  const storage=await import(pathToFileURL(path.join(root,'dist-electron/storage-migration.js')));
  const directory=fs.mkdtempSync(path.join(root,'.tmp','packaged-migration-'));
  const sourceRoot=path.join(directory,'source','maoyi Data'),targetParent=path.join(directory,'target');
  const bootstrapPath=path.join(directory,'maoyi Launcher','storage.json');
  fs.mkdirSync(sourceRoot,{recursive:true});fs.mkdirSync(targetParent,{recursive:true});fs.mkdirSync(path.dirname(bootstrapPath),{recursive:true});
  fs.writeFileSync(path.join(sourceRoot,'message-fixture.txt'),'packaged migration fixture');
  fs.writeFileSync(bootstrapPath,JSON.stringify({dataPath:sourceRoot}));
  const parent=spawn(process.execPath,['-e','process.stdin.resume()'],{stdio:['pipe','ignore','ignore'],windowsHide:true});
  await once(parent,'spawn');
  let worker;
  try{
    const prepared=await storage.createStorageMigrationPlan({sourceRoot,targetParent,bootstrapPath,parentProcessId:parent.pid,restartPackagedClient:false});
    await storage.reserveStorageMigration(prepared.planPath);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;delete env.MAOYI_USER_DATA_DIR;
    worker=spawn(executable,[`${storage.storageMigrationArgument}${prepared.planPath}`],{env,stdio:'ignore',windowsHide:false});
    const exited=once(worker,'exit');
    let windowHandle='0';
    const deadline=Date.now()+15000;
    while(Date.now()<deadline&&worker.exitCode===null){
      windowHandle=execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-Process -Id ${worker.pid} -ErrorAction SilentlyContinue).MainWindowHandle`],{windowsHide:true,encoding:'utf8'}).trim();
      if(windowHandle&&windowHandle!=='0')break;
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    assert.ok(windowHandle&&windowHandle!=='0','packaged worker must show a native window without a second launch or focus request');
    assert.equal(fs.existsSync(prepared.plan.targetRoot),false,'copy must wait for the fixture parent to exit');
    parent.stdin.end();
    const timer=setTimeout(()=>worker.kill(),20000);
    const [code]=await exited;clearTimeout(timer);
    assert.equal(code,0,'packaged worker must complete and exit normally');
    assert.equal(fs.readFileSync(path.join(prepared.plan.targetRoot,'message-fixture.txt'),'utf8'),'packaged migration fixture');
    assert.equal(JSON.parse(fs.readFileSync(bootstrapPath,'utf8')).dataPath,prepared.plan.targetRoot);
    assert.ok(fs.existsSync(path.join(sourceRoot,'message-fixture.txt')),'source backup must remain');
    console.log('packaged migration: native progress window visible before parent exit, verified copy, pointer switch, backup retention and normal exit passed; production data untouched');
  }finally{
    parent.stdin.end();
    if(worker&&worker.exitCode===null)worker.kill();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

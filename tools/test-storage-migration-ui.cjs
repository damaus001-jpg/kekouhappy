const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  // Match the UI worker's Windows startup mode; SW_HIDE suppresses the first show.
  const mainSource=fs.readFileSync(path.join(root,'electron/main.ts'),'utf8');
  const ts=require('typescript'),tree=ts.createSourceFile('main.ts',mainSource,ts.ScriptTarget.Latest,true);
  const launcher=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='spawnStorageMigrationWorker');
  assert.match(launcher.getText(tree),/windowsHide:\s*false/,'migration worker must allow its progress window to show');
  assert.match(fs.readFileSync(path.join(root,'electron/storage-migration-window.ts'),'utf8'),/spawn\(process.execPath,\[\],\{detached:true,stdio:'ignore',windowsHide:false\}\)/,'restarted client must also be visible');
  const child=require('node:child_process').spawn(require('electron'),[__filename],{cwd:root,env,windowsHide:false,stdio:'inherit'});
  child.on('error',e=>{console.error(e);process.exitCode=1;});child.on('exit',code=>process.exitCode=code??1);
}else{
  const {app,BrowserWindow,ipcMain}=require('electron');const net=require('node:net');
  const dir=fs.mkdtempSync(path.join(root,'.tmp','migration-ui-'));app.setPath('userData',dir);app.on('window-all-closed',()=>{});
  let server;const timeout=setTimeout(()=>app.exit(1),45000);
  app.whenReady().then(async()=>{
    const ui=await import('../dist-electron/storage-migration-window.js'),storage=await import('../dist-electron/storage-migration.js');
    const win=new BrowserWindow({show:false,width:680,height:560,webPreferences:{preload:path.join(root,'electron/storage-migration-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
    const exec=s=>win.webContents.executeJavaScript(s,true);
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(ui.migrationProgressDocument()));
    const progress=async value=>{await exec(`window.showMigrationProgress(${JSON.stringify({completedFiles:2,totalFiles:4,processedBytes:2048,totalBytes:4096,...value})})`);};
    await progress({phase:'scanning'});assert.equal(await exec(`document.querySelector('progress').hasAttribute('value')`),false);
    await progress({phase:'copying',estimatedRemainingSeconds:120});assert.equal(await exec(`document.querySelector('progress').value`),35);assert.match(await exec(`document.querySelector('#estimate').textContent`),/2 分钟/);
    await progress({phase:'verifying'});assert.equal(await exec(`document.querySelector('progress').value`),84.5);assert.match(await exec(`document.querySelector('#phase').textContent`),/校验/);
    await progress({phase:'completed',completedFiles:4,processedBytes:4096});assert.equal(await exec(`document.querySelector('progress').value`),100);assert.equal(await exec(`document.querySelector('#percent').textContent`),'100%');
    await exec(`window.showMigrationFailure('<img src=x onerror=alert(1)> 原数据保留')`);assert.equal(await exec(`document.querySelector('#error img')===null`),true);assert.equal(await exec(`document.querySelector('#reopen').hidden`),false);assert.equal(await exec(`document.querySelector('progress').value`),0);
    let reopened=0;ipcMain.on('storage-migration:reopen',event=>{assert.equal(event.sender,win.webContents);reopened++;});
    await exec(`document.querySelector('#reopen').click()`);await new Promise(r=>setTimeout(r,50));assert.equal(reopened,1,'sandbox preload exposes only the terminal reopen action');
    assert.equal(await exec(`document.documentElement.scrollWidth<=innerWidth`),true);
    const sourceRoot=path.join(dir,'source','maoyi Data'),targetParent=path.join(dir,'target'),bootstrapPath=path.join(dir,'maoyi Launcher','storage.json');
    fs.mkdirSync(sourceRoot,{recursive:true});fs.mkdirSync(targetParent,{recursive:true});fs.mkdirSync(path.dirname(bootstrapPath),{recursive:true});fs.writeFileSync(bootstrapPath,JSON.stringify({dataPath:sourceRoot}));
    assert.equal(await ui.showActiveStorageMigration(bootstrapPath),false);
    const plan=await storage.createStorageMigrationPlan({sourceRoot,targetParent,bootstrapPath});await storage.reserveStorageMigration(plan.planPath);
    let focused=0;server=net.createServer(socket=>{socket.once('data',data=>{assert.equal(data.toString(),'show');focused++;socket.end('ok');});});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(storage.storageMigrationFocusPipe(bootstrapPath),resolve);});
    assert.equal(await ui.showActiveStorageMigration(bootstrapPath),true);assert.equal(focused,1,'opening again focuses the migration window without opening source data');
    await storage.releaseStorageMigration(plan.planPath);assert.equal(await storage.activeStorageMigration(bootstrapPath),null);fs.unlinkSync(plan.planPath);
    await new Promise(resolve=>server.close(resolve));server=null;
    // Exercise the real window lifecycle, including navigation guards and the
    // worker wait. Testing only the HTML in a separate window misses startup hangs.
    const parentEnv={...process.env,ELECTRON_RUN_AS_NODE:'1'};
    const parent=require('node:child_process').spawn(process.execPath,['-e','process.stdin.resume()'],{env:parentEnv,stdio:['pipe','ignore','ignore'],windowsHide:true});
    await new Promise((resolve,reject)=>{parent.once('spawn',resolve);parent.once('error',reject);});
    const lifecyclePlan=await storage.createStorageMigrationPlan({sourceRoot,targetParent,bootstrapPath,parentProcessId:parent.pid});
    fs.writeFileSync(path.join(sourceRoot,'message-fixture.txt'),'isolated migration fixture');
    const lifecycle=ui.runStorageMigrationWithWindow(lifecyclePlan.planPath);
    let migrationWindow;
    try{
      const deadline=Date.now()+8000;
      while(Date.now()<deadline){
        migrationWindow=BrowserWindow.getAllWindows().find(candidate=>candidate!==win&&candidate.isVisible());
        if(migrationWindow)break;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      assert.ok(migrationWindow,`real migration window must be visible before the parent exits: ${JSON.stringify(BrowserWindow.getAllWindows().filter(candidate=>candidate!==win).map(candidate=>({loading:candidate.webContents.isLoading(),visible:candidate.isVisible()})))}`);
      assert.equal(fs.existsSync(lifecyclePlan.plan.stagingRoot),false,'copy must wait for the parent exit');
      assert.match(await migrationWindow.webContents.executeJavaScript(`document.querySelector('#phase').textContent`),/等待/);
      migrationWindow.minimize();
      assert.equal(await ui.showActiveStorageMigration(bootstrapPath),true);
      assert.equal(migrationWindow.isMinimized(),false,'refocus restores the real migration window');
    }finally{parent.stdin.end();}
    await lifecycle;
    assert.equal(fs.readFileSync(path.join(lifecyclePlan.plan.targetRoot,'message-fixture.txt'),'utf8'),'isolated migration fixture');
    assert.equal(await migrationWindow.webContents.executeJavaScript(`document.querySelector('#percent').textContent`),'100%');
    console.log('migration UI: visible real worker window before parent exit, copy completion, minimize/refocus, stages, percentages, ETA, failure, safe text and preload reopen passed; all data isolated in .tmp');
    win.destroy();clearTimeout(timeout);app.exit(0);
  }).catch(error=>{console.error(error);if(server)server.close();clearTimeout(timeout);app.exit(1);});
}

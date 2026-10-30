const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  const child=require('node:child_process').spawn(require('electron'),[__filename],{cwd:root,env,windowsHide:true,stdio:'inherit'});
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
    console.log('migration UI: hidden sandbox window, stages, percentages, stage ETA, completion/failure, safe text, preload reopen and named-pipe refocus passed; all data isolated in .tmp');
    win.destroy();clearTimeout(timeout);app.exit(0);
  }).catch(error=>{console.error(error);if(server)server.close();clearTimeout(timeout);app.exit(1);});
}

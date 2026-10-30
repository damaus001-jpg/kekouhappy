import {app,BrowserWindow,dialog,ipcMain} from 'electron';
import {createConnection,createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {activeStorageMigration,reserveStorageMigration,releaseStorageMigration,runStorageMigrationWorker,storageMigrationFocusPipe,type StorageMigrationPlan,type StorageMigrationProgress} from './storage-migration.js';

export function migrationProgressDocument(){return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"><title>数据目录迁移</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172338;font:14px 'Microsoft YaHei',sans-serif}main{padding:28px}h1{font-size:22px;margin:0 0 12px}p{line-height:1.7}#warning{color:#6a4d13;background:#fff4ce;padding:12px;border-radius:8px}progress{width:100%;height:22px;accent-color:#2674cf}#phase{font-size:17px;margin-top:22px}#details,#estimate{color:#526276}#paths{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:#526276}#error{color:#a52121;white-space:pre-wrap}button{background:#2674cf;color:white;border:0;border-radius:6px;padding:10px 18px;cursor:pointer}small{display:block;color:#526276;line-height:1.7;margin-top:16px}</style></head><body><main>
<h1>正在迁移数据，请耐心等待</h1><p id="warning">数据较多或磁盘较慢时，迁移可能需要较长时间。请勿关闭电脑或断开磁盘。您可以最小化此窗口继续使用电脑。</p>
<p id="phase" role="status" aria-live="polite">正在准备迁移…</p><progress id="bar" max="100"></progress><span id="percent"></span><p id="details">正在统计文件和数据量</p><p id="estimate">预计时间正在计算</p><p id="paths"></p><p id="error" role="alert"></p><button id="reopen" hidden>返回并打开客户端</button><small id="note">迁移期间关闭此窗口会最小化，再次打开翻译器会返回此窗口。迁移成功后自动打开新位置；原目录保留为备份。</small>
</main><script>
const labels={waiting:'等待客户端和聊天窗口关闭',scanning:'正在统计并读取原数据',copying:'正在复制数据',verifying:'正在校验复制结果',switching:'正在切换数据目录',completed:'迁移完成',failed:'迁移未完成'};
const bytes=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GB':n>=1048576?(n/1048576).toFixed(1)+' MB':(n/1024).toFixed(1)+' KB';
window.showMigrationProgress=(v)=>{document.getElementById('phase').textContent=labels[v.phase];const bar=document.getElementById('bar');
if(v.phase==='scanning'||v.phase==='waiting'){bar.removeAttribute('value');document.getElementById('percent').textContent='';}else{const f=v.totalBytes?v.processedBytes/v.totalBytes:(v.totalFiles?v.completedFiles/v.totalFiles:1);bar.value=v.phase==='completed'?100:v.phase==='switching'?99:v.phase==='verifying'?70+Math.min(1,f)*29:Math.min(1,f)*70;document.getElementById('percent').textContent=Math.floor(bar.value)+'%';}
document.getElementById('details').textContent=v.phase==='scanning'?'已读取 '+v.completedFiles+' 个文件，'+bytes(v.processedBytes):'文件 '+v.completedFiles+' / '+v.totalFiles+' · '+bytes(v.processedBytes)+' / '+bytes(v.totalBytes);
document.getElementById('estimate').textContent=v.phase==='completed'?'即将自动打开客户端':v.estimatedRemainingSeconds!==undefined?'当前阶段预计剩余 '+(v.estimatedRemainingSeconds<60?'不足 1 分钟':Math.ceil(v.estimatedRemainingSeconds/60)+' 分钟')+'，实际时间取决于磁盘速度':'预计时间正在计算；复制完成后还需要校验';};
window.showMigrationFailure=message=>{document.getElementById('phase').textContent='迁移未完成，原数据已保留';document.getElementById('error').textContent=message;document.getElementById('bar').value=0;document.getElementById('percent').textContent='已停止';document.getElementById('estimate').textContent='可以返回客户端后查看数据位置，或关闭此窗口稍后再试';document.getElementById('reopen').hidden=false;};
document.getElementById('reopen').onclick=()=>window.migrationProgress.reopen();
</script></body></html>`;}

export async function showActiveStorageMigration(bootstrapPath:string){
  if(!await activeStorageMigration(bootstrapPath))return false;
  const focused=await new Promise<boolean>(resolve=>{
    const socket=createConnection(storageMigrationFocusPipe(bootstrapPath));let done=false;
    const finish=(ok:boolean)=>{if(done)return;done=true;socket.destroy();resolve(ok);};
    socket.setTimeout(1500,()=>finish(false));socket.on('error',()=>finish(false));socket.on('connect',()=>socket.write('show'));socket.on('data',()=>finish(true));socket.on('close',()=>finish(false));
  });
  if(!focused)await dialog.showMessageBox({type:'info',title:'数据正在迁移',message:'正在准备或进行数据迁移，请等待进度窗口。',detail:'迁移期间暂不能打开工作区。完成后客户端会自动打开，请勿关闭电脑或断开磁盘。',buttons:['继续等待']});
  return true;
}

export async function runStorageMigrationWithWindow(planPath:string){
  await reserveStorageMigration(planPath,true);
  const plan=JSON.parse(await readFile(planPath,'utf8')) as StorageMigrationPlan;
  let terminal=false,reopening=false;
  const win=new BrowserWindow({width:680,height:560,minWidth:560,minHeight:500,title:'数据目录迁移',show:false,autoHideMenuBar:true,backgroundColor:'#f5f7fb',webPreferences:{preload:join(dirname(fileURLToPath(import.meta.url)),'../electron/storage-migration-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  const focus=()=>{if(win.isDestroyed())return;if(win.isMinimized())win.restore();win.show();win.focus();};
  win.setMenuBarVisibility(false);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
  win.on('close',event=>{if(!terminal){event.preventDefault();win.minimize();}});
  win.on('closed',()=>{if(terminal&&!reopening)app.exit(0);});
  const server=createServer(socket=>{socket.setTimeout(1500,()=>socket.destroy());socket.once('data',data=>{if(data.toString()==='show'){focus();socket.end('ok');}else socket.destroy();});socket.on('error',()=>{});});
  const reopen=()=>{
    if(reopening)return;reopening=true;
    if(!plan.restartPackagedClient){app.exit(0);return;}
    const child=spawn(process.execPath,[],{detached:true,stdio:'ignore',windowsHide:true});
    child.once('error',()=>{reopening=false;void win.webContents.executeJavaScript(`window.showMigrationFailure(${JSON.stringify('自动打开失败，请关闭此窗口后手动打开翻译器。')})`);});
    child.once('spawn',()=>{child.unref();server.close();app.exit(0);});
  };
  const onReopen=(event:Electron.IpcMainEvent)=>{if(terminal&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame)reopen();};
  ipcMain.on('storage-migration:reopen',onReopen);
  try{
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(storageMigrationFocusPipe(plan.bootstrapPath),()=>{server.removeListener('error',reject);server.on('error',()=>{});resolve();});});
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(migrationProgressDocument()));
    await win.webContents.executeJavaScript(`document.getElementById('paths').textContent=${JSON.stringify(`原目录：${plan.sourceRoot}\n新目录：${plan.targetRoot}`)}`);
    focus();
    await runStorageMigrationWorker(planPath,{restart:false,onProgress:(progress:StorageMigrationProgress)=>{if(!win.isDestroyed())void win.webContents.executeJavaScript(`window.showMigrationProgress(${JSON.stringify(progress)})`).catch(()=>{});}});
    terminal=true;
    server.close();
    setTimeout(reopen,1500);
  }catch(error){
    await releaseStorageMigration(planPath).catch(()=>{});
    terminal=true;
    server.close();
    if(!win.isDestroyed()){await win.webContents.executeJavaScript(`window.showMigrationFailure(${JSON.stringify(error instanceof Error?error.message:'迁移失败，请保留原数据后重试')})`).catch(()=>{});focus();}
    else throw error;
  }finally{
    if(win.isDestroyed())ipcMain.removeListener('storage-migration:reopen',onReopen);
  }
}

const {app,BrowserWindow,WebContentsView,ipcMain,dialog,shell,session,screen,protocol,safeStorage,clipboard}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {parseTxt,exportTxt}=require('./data.cjs');
const {page}=require('./page.cjs');
const {allowWhatsAppStorage}=require('./permissions.cjs');
const {launchEnvironment,connectLauncher}=require('./launcher-bridge.cjs');
const {BusinessAccess}=require('./business-access.cjs');
const initialLaunch=launchEnvironment();

app.setName('Whatsapp号码筛选');
protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
app.setAppUserModelId('com.pikachu.whatsappnumberfilter');
app.setPath('userData',process.env.WNF_USER_DATA_DIR||path.join(app.getPath('appData'),'WhatsappNumberFilter'));
const single=app.requestSingleInstanceLock(initialLaunch||{});
if(!single)app.quit();
let window,view,timer,busy=false,polling=false,imported=null,lastExport=null,booted=false;
let bridge=null,access=null,grant=null;
const uiUrl='app://number-filter/index.html';
const waUserAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/'+process.versions.chrome+' Safari/537.36';
let state={version:app.getVersion(),theme:'blackGold',maximized:false,authorization:null,authorizationRequired:false,loggedIn:false,online:true,ready:false,running:false,checked:0,total:0,registered:0,notRegistered:0,unknown:0,imported:null,message:'请先在左侧扫码登录 WhatsApp。',error:'',exportFolder:''};
const backgrounds={blackGold:'#08090d',pink:'#160711',murongPurple:'#171218',clearWaterBlue:'#eaf8ff'};
const publish=patch=>{state={...state,...patch,authorization:access?.status()||null};if(window&&!window.isDestroyed())window.webContents.send('filter:state',state);};
function applyTheme(theme){if(!Object.hasOwn(backgrounds,theme))return;window?.setBackgroundColor(backgrounds[theme]);publish({theme});}
function focusWindow(){if(!window||window.isDestroyed())return false;if(window.isMinimized())window.restore();window.show();window.focus();return window.isVisible()&&!window.isMinimized();}
async function attachLauncher(info){
 const connection=await connectLauncher(info,message=>{if(message.type==='theme')applyTheme(message.theme);if(message.type==='focus'){const visible=focusWindow();bridge?.socket.write(JSON.stringify({type:'focus-applied',requestId:message.requestId,visible})+'\n');}});
 const identity=JSON.parse(fs.readFileSync(path.join(__dirname,'filter-license-public.json'),'utf8'));
 if(identity.suiteId!==connection.grant.suiteId||identity.keyId!==connection.grant.keyId||(grant&&grant.hardwareHash!==connection.grant.hardwareHash)){connection.socket.write('{"type":"error"}\n');connection.socket.destroy();throw new Error('筛选器与皮卡丘的套装或本机身份不一致');}
 bridge?.socket.destroy();bridge=connection;grant=connection.grant;applyTheme(grant.theme);return identity;
}
const isWhatsApp=url=>{try{return new URL(url).origin==='https://web.whatsapp.com';}catch{return false;}};
const execute=(action,options={})=>view.webContents.executeJavaScript('('+page.toString()+')('+JSON.stringify(action)+','+JSON.stringify(options)+')',true);
function bounds(){if(!window||!view)return;const [width,height]=window.getContentSize();view.setBounds({x:0,y:64,width:Math.max(300,width-392),height:Math.max(100,height-64)});}
const statusPatch=r=>({running:r.running,checked:r.checked,total:r.uniqueNumbers,registered:r.counts.registered,notRegistered:r.counts['not-registered'],unknown:r.counts.unknown,elapsedSeconds:r.elapsedSeconds,remainingSeconds:r.estimatedRemainingSeconds,stopReason:r.stopReason});
async function poll(){
  if(polling||!view||view.webContents.isDestroyed()||!isWhatsApp(view.webContents.getURL()))return;
  polling=true;
  try{
    const connection=await execute('connection');publish({...connection,...(!booted?{message:connection.loggedIn?(imported?'TXT 已导入，点击开始筛选。':'已登录，请导入号码 TXT。'):connection.phase==='syncing'?'手机已关联，正在同步消息，请保持窗口开启。':connection.phase==='loading'?'正在加载 WhatsApp…':'请在左侧扫码登录 WhatsApp。'}:{})});
    if(booted){
      const result=await execute('status');
      publish({...statusPatch(result),message:result.running?'正在筛选号码…':result.stopReason?'筛选已停止，未完成的号码可导出为未确认。':result.checked===result.uniqueNumbers?'筛选完成，可以导出 TXT。':'号码已准备好，点击开始筛选。'});
    }
  }catch(error){
    if(state.running){booted=false;publish({running:false,error:'WhatsApp 页面已重新加载，当前任务已中断。请重新导入后筛选。'});}
  }finally{polling=false;}
}
const handlers={
  async 'window-control'(action){
    if(!window||window.isDestroyed())return;
    if(action==='minimize')window.minimize();
    else if(action==='toggle-maximize'){if(window.isMaximized())window.unmaximize();else window.maximize();}
    else if(action==='close'){window.close();return;}
    else throw new Error('窗口操作无效');
    publish({maximized:window.isMaximized()});
  },
  async import(){
    if(state.running)throw new Error('请先停止当前筛选。');
    const chosen=await dialog.showOpenDialog(window,{title:'导入号码 TXT',filters:[{name:'号码文本文件',extensions:['txt']}],properties:['openFile']});
    if(chosen.canceled)return null;
    const file=chosen.filePaths[0];if(fs.statSync(file).size>20*1024*1024)throw new Error('TXT 文件超过 20 MB，请拆分后导入。');
    const parsed=parseTxt(fs.readFileSync(file));if(!parsed.numbers.length)throw new Error('没有有效号码。请按每行一个号码，包含国家区号填写。');
    imported={...parsed,fileName:path.basename(file)};booted=false;lastExport=null;
    const {numbers,...info}=imported;
    publish({imported:info,total:numbers.length,checked:0,registered:0,notRegistered:0,unknown:0,elapsedSeconds:0,remainingSeconds:null,exportFolder:'',error:'',message:'TXT 已导入，登录后点击开始筛选。'});return info;
  },
  async start(){
    if(!imported)throw new Error('请先导入 TXT 号码文件。');
    if(state.running)return;
    const connection=await execute('connection');if(!connection.loggedIn)throw new Error('请先在左侧扫码登录 WhatsApp。');if(!connection.online)throw new Error('当前网络已断开，请联网后再筛选。');
    if(booted)throw new Error('这批号码已执行。需要重新筛选时，请再次导入 TXT。');
    await execute('import',{numbers:imported.numbers});
    const result=await execute('start',{concurrency:6});booted=true;
    publish({...statusPatch(result),error:'',message:'正在筛选号码…'});
  },
  async stop(){if(!booted)return;await execute('stop');publish({message:'正在停止，等待在途查询结束…'});},
  async export(){
    if(!booted)throw new Error('请先执行筛选。');if(state.running)throw new Error('请先等待筛选完成，或停止筛选。');
    access.consumeExport();publish({});
    const report=await execute('export');
    const chosen=await dialog.showOpenDialog(window,{title:'选择 TXT 结果保存位置',properties:['openDirectory','createDirectory']});if(chosen.canceled)return null;
    lastExport=exportTxt(report,chosen.filePaths[0],imported);publish({exportFolder:lastExport.folder,error:'',message:'TXT 结果已导出。'});return lastExport;
  },
  async 'show-export'(){if(lastExport)await shell.openPath(lastExport.folder);},
  async 'authorization-dialog'(open){if(typeof open!=='boolean')throw new Error('授权窗口状态无效');view?.setVisible(!open);if(!open)publish({authorizationRequired:false});return access.status();},
  async 'copy-machine-code'(){clipboard.writeText(access.status().machineCode);},
  async activate(code){const result=access.activate(code);publish({authorizationRequired:false,error:''});return result;},
  async refresh(){if(state.running)throw new Error('筛选进行中，请先停止再刷新。');booted=false;view.webContents.reload();publish({ready:false,loggedIn:false,error:'',message:'正在重新加载 WhatsApp…'});}
};
app.whenReady().then(async()=>{
  if(!single)return;
  let identity;
  if(!app.isPackaged&&process.env.WNF_SMOKE==='1'){
    identity=JSON.parse(fs.readFileSync(path.join(__dirname,'filter-license-public.json'),'utf8'));
    grant={suiteId:identity.suiteId,keyId:identity.keyId,hardwareHash:'1'.repeat(64),theme:'blackGold'};
  }else{
    if(!initialLaunch){dialog.showErrorBox('请从皮卡丘打开','请在皮卡丘主页应用中心，右键 WhatsApp，选择“WhatsApp 号码筛选”。');app.quit();return;}
    identity=await attachLauncher(initialLaunch);
  }
  if(!safeStorage.isEncryptionAvailable())throw new Error('本机授权保护暂不可用，请稍后重试');
  const licenseName='whatsapp-filter-'+grant.hardwareHash.slice(0,16)+'.dat';
  const guardRoot=!app.isPackaged&&process.env.WNF_SMOKE==='1'?path.join(app.getPath('userData'),'test-guard'):path.join(app.getPath('appData'),'maoyi Security',identity.suiteId);
  access=new BusinessAccess({identity,hardwareHash:grant.hardwareHash,files:[path.join(guardRoot,licenseName),path.join(app.getPath('userData'),licenseName)],protect:text=>safeStorage.encryptString(text),unprotect:buffer=>safeStorage.decryptString(buffer)});
  state.theme=grant.theme;
  app.userAgentFallback=waUserAgent;
  session.defaultSession.setUserAgent(waUserAgent);
  const uiFiles={'index.html':'text/html; charset=utf-8','styles.css':'text/css; charset=utf-8','compact.css':'text/css; charset=utf-8','themes.css':'text/css; charset=utf-8','brand.png':'image/png','renderer.js':'text/javascript; charset=utf-8'};
  protocol.handle('app',request=>{
    try{
      const url=new URL(request.url),name=decodeURIComponent(url.pathname.slice(1));
      if(url.hostname!=='number-filter'||request.method!=='GET'||!Object.hasOwn(uiFiles,name))return new Response('Not found',{status:404});
      return new Response(fs.readFileSync(path.join(__dirname,name)),{headers:{'content-type':uiFiles[name],'content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"}});
    }catch{return new Response('Not found',{status:404});}
  });
  const area=screen.getPrimaryDisplay().workAreaSize;
  const shouldShow=process.env.WNF_STARTUP_CHECK!=='1'&&(app.isPackaged||process.env.WNF_SMOKE!=='1');
  window=new BrowserWindow({show:false,titleBarStyle:'hidden',titleBarOverlay:false,width:Math.min(1280,area.width),height:Math.min(850,area.height),minWidth:Math.min(980,area.width),minHeight:Math.min(600,area.height),center:true,title:'皮卡丘 · WhatsApp 号码筛选',icon:path.join(__dirname,'icon.ico'),autoHideMenuBar:true,backgroundColor:backgrounds[state.theme],webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.once('ready-to-show',()=>{if(shouldShow)focusWindow();});
  window.removeMenu();
  window.on('maximize',()=>publish({maximized:true}));window.on('unmaximize',()=>publish({maximized:false}));
  for(const [action,handler]of Object.entries(handlers))ipcMain.handle('filter:'+action,async (event,...args)=>{
    if(event.sender!==window.webContents||event.senderFrame!==event.sender.mainFrame||event.senderFrame?.url!==uiUrl)throw new Error('Unsupported caller');
    if(action==='window-control')return handler(...args);
    if(busy)throw new Error('上一个操作尚未结束，请稍候。');busy=true;
    try{return await handler(...args);}catch(error){const message=String(error?.message||error).replace(/\d{7,}/g,'[号码]').slice(0,400);publish({error:message,...(error.code==='authorization-required'?{authorizationRequired:true}:{})});throw new Error(message);}finally{busy=false;}
  });
  const waSession=session.fromPartition('persist:whatsapp-number-filter');
  waSession.setUserAgent(waUserAgent);
  waSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(allowWhatsAppStorage(permission,details.requestingUrl||contents.getURL())));
  waSession.setPermissionCheckHandler((_wc,permission,origin,details)=>allowWhatsAppStorage(permission,details.requestingUrl||origin));
  view=new WebContentsView({webPreferences:{session:waSession,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false,spellcheck:false}});
  window.contentView.addChildView(view);bounds();window.on('resize',bounds);
  view.webContents.setUserAgent(waUserAgent);
  view.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  view.webContents.on('will-navigate',(event,url)=>{if(!isWhatsApp(url))event.preventDefault();});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(url!==uiUrl)event.preventDefault();});
  view.webContents.on('did-start-navigation',(_event,_url,isInPlace,isMainFrame)=>{if(!isMainFrame||isInPlace)return;const interrupted=state.running;booted=false;publish({running:false,loggedIn:false,ready:false,error:interrupted?'页面已重新加载，当前筛选已中断。请重新导入后筛选。':'',message:'正在加载 WhatsApp…'});});
  view.webContents.on('did-fail-load',(_event,code,description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)publish({error:'WhatsApp 加载失败：'+description});});
  window.webContents.on('did-finish-load',()=>publish({}));
  await window.loadURL(uiUrl);
  const visible=shouldShow?focusWindow():false;
  bridge?.socket.write(JSON.stringify({type:'ready',visible})+'\n');
  if(process.env.WNF_SMOKE==='1'){
    const fixture=path.join(__dirname,'smoke-fixture.html');
    if(!fs.existsSync(fixture))throw new Error('Smoke fixture missing');
    // Offline smoke runs use an HTTPS origin through an isolated session protocol.
    waSession.protocol.handle('https',request=>{
      if(new URL(request.url).pathname==='/wnf-smoke-worker.js'){
        const agent=request.headers.get('user-agent')||'';
        if(/Electron|[^\x20-\x7e]/.test(agent)||!agent.includes('Chrome/'))return new Response('invalid background user agent',{status:400});
        return new Response('self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));',{headers:{'content-type':'application/javascript','service-worker-allowed':'/'}});
      }
      return new Response(fs.readFileSync(fixture),{headers:{'content-type':'text/html'}});
    });
  }
  void view.webContents.loadURL('https://web.whatsapp.com/login/').catch(error=>publish({error:'WhatsApp 加载失败：'+error.message}));
  timer=setInterval(poll,1000);
  app.on('second-instance',async(_event,_args,_cwd,additionalData)=>{try{await attachLauncher(additionalData);const visible=focusWindow();bridge.socket.write(JSON.stringify({type:'ready',visible})+'\n');}catch{}});
  if(!app.isPackaged&&process.env.WNF_SMOKE==='1')process.on('wnf-test-theme',applyTheme);
  window.on('closed',()=>{clearInterval(timer);bridge?.socket.destroy();if(!view.webContents.isDestroyed())view.webContents.close();window=null;});
}).catch(error=>{dialog.showErrorBox('Whatsapp号码筛选启动失败',String(error.message||error));app.quit();});
app.on('window-all-closed',()=>app.quit());

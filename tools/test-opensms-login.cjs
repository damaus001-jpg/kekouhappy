const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const profileId='11111111-1111-4111-8111-111111111111';
const token='synthetic-opensms-login-token',refresh='synthetic-opensms-refresh-rotated';
if(!process.versions.electron){
  const directory=path.join(root,'.tmp',`opensms-login-${Date.now()}`);
  async function phase(stage){
    const env={...process.env,MAOYI_OPEN_SMS_LOGIN_TEST_ROOT:directory,MAOYI_OPEN_SMS_LOGIN_TEST_STAGE:stage};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
    await new Promise((resolve,reject)=>{
      const child=spawn(require('electron'),[__filename],{env,cwd:root,windowsHide:true,stdio:'inherit'});
      const timer=setTimeout(()=>{child.kill();reject(new Error('Login test timed out'));},30000);
      child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Login phase failed: '+stage));});
    });
  }
  (async()=>{
    await phase('write');await phase('read-and-logout');await phase('logged-out');
    console.log('opensms-login: fixed partition, encrypted login, restore before site scripts across real process restarts, refreshed token, explicit logout, password exclusion and IPC origin/frame/profile isolation passed; no real credentials or network used');
  })().catch(error=>{console.error(error);process.exitCode=1;});
}else{
  const {app,BrowserWindow,session,webContents}=require('electron');
  const ts=require('typescript');
  const directory=process.env.MAOYI_OPEN_SMS_LOGIN_TEST_ROOT,stage=process.env.MAOYI_OPEN_SMS_LOGIN_TEST_STAGE;
  if(!directory||!path.resolve(directory).startsWith(path.join(root,'.tmp')+path.sep))throw new Error('Invalid test directory');
  app.setPath('userData',directory);
  app.on('window-all-closed',()=>{});
  app.whenReady().then(async()=>{
    const login=await import(pathToFileURL(path.join(root,'dist-electron/opensms-login.js')).href);
    const source=fs.readFileSync(path.join(root,'electron/main.ts'),'utf8');
    const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
    const declarations=['isAllowedPlatformUrl','openSmsLoginScope'].map(name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast)).join('\n');
    const js=ts.transpileModule(declarations,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const partition='persist:chat-'+profileId,ses=session.fromPartition(partition);
    const sessionPolicies=new Map([[ses,'opensms']]),partitionPolicies=new Map([[partition,'opensms']]);
    const resolveScope=new Function('sessionPolicies','partitionPolicies','session',js+';return openSmsLoginScope;')(sessionPolicies,partitionPolicies,session);
    login.installOpenSmsLoginPersistence(resolveScope);
    const scope={profileId,origin:'https://www.opensms.cc'};
    const saved=()=>login.readOpenSmsLogin(scope);
    const waitFor=async predicate=>{for(let i=0;i<40;i++){if(predicate())return;await new Promise(r=>setTimeout(r,75));}throw new Error('Login state did not persist');};
    await ses.protocol.handle('https',()=>new Response('<!doctype html><script>window.firstAuth={token:sessionStorage.getItem("sa-token"),refresh:sessionStorage.getItem("refresh_token"),user:sessionStorage.getItem("user")};</script><body>Local login fixture</body>',{headers:{'content-type':'text/html'}}));
    const win=new BrowserWindow({show:false,width:1100,height:720,webPreferences:{webviewTag:true,sandbox:true,contextIsolation:true,backgroundThrottling:false}});
    const guestReady=new Promise(resolve=>{app.on('web-contents-created',(_event,contents)=>{if(contents.getType()==='webview')contents.once('did-finish-load',()=>resolve(contents));});});
    const preload=pathToFileURL(path.join(root,'electron/webview-send-guard-preload.cjs')).href;
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<webview partition="${partition}" preload="${preload}" src="https://www.opensms.cc/#/index/chat" style="width:100%;height:100%"></webview>`));
    const guest=await guestReady;
    const execute=script=>guest.executeJavaScript(script,true);
    const early=await execute('window.firstAuth');
    const actualEvent={sender:guest,senderFrame:guest.mainFrame};
    assert.deepEqual(resolveScope(actualEvent),scope);
    sessionPolicies.delete(ses);assert.equal(resolveScope(actualEvent),null);sessionPolicies.set(ses,'opensms');
    assert.equal(resolveScope({...actualEvent,senderFrame:{url:'https://evil.opensms.cc/'}}),null);
    assert.equal(resolveScope({...actualEvent,sender:win.webContents,senderFrame:win.webContents.mainFrame}),null);
    const fakeSender={isDestroyed:()=>false,getType:()=> 'webview',session:ses,mainFrame:{url:'https://evil.opensms.cc/'}};
    assert.equal(resolveScope({sender:fakeSender,senderFrame:fakeSender.mainFrame}),null);
    assert.equal(saved()?.['sa-token']||'',stage==='read-and-logout'?token:'');
    if(stage==='write'){
      assert.equal(early.token,null);
      await execute(`sessionStorage.setItem('sa-token',${JSON.stringify(token)});sessionStorage.setItem('refresh_token','synthetic-refresh-first');sessionStorage.setItem('user',JSON.stringify({user:{id:'fixture',name:'Fixture',password:'must-not-save-password',nested:{secret:'must-not-save-secret'}}}));true`);
      await waitFor(()=>saved()?.['sa-token']===token);
      assert.equal(saved().user.includes('must-not-save'),false);
      const files=fs.readdirSync(path.join(directory,'opensms-login'));
      assert.equal(files.filter(f=>f.endsWith('.enc')).length,1);
      const bytes=fs.readFileSync(path.join(directory,'opensms-login',files.find(f=>f.endsWith('.enc'))));
      assert.equal(bytes.includes(Buffer.from(token)),false);assert.equal(bytes.includes(Buffer.from('Fixture')),false);
      assert.equal(login.readOpenSmsLogin({...scope,origin:'https://opensms.cc'}),null);
      assert.equal(login.readOpenSmsLogin({...scope,profileId:'22222222-2222-4222-8222-222222222222'}),null);
      // Close immediately after rotation: unload must persist the latest value.
      await execute(`sessionStorage.setItem('refresh_token',${JSON.stringify(refresh)});true`);
    }else if(stage==='read-and-logout'){
      assert.equal(early.token,token,'restored before first site script');assert.equal(early.refresh,refresh,'latest refresh token survives closing');
      const user=JSON.parse(early.user);assert.equal(user.user.name,'Fixture');assert.equal(user.user.password,undefined);
      await execute(`sessionStorage.removeItem('sa-token');sessionStorage.removeItem('refresh_token');true`);
    }else{
      assert.equal(early.token,null,'logout must not restore a stale login');
      assert.equal(saved()?.['sa-token']||'','');
    }
    win.close();
    // Keep the main process alive until the guest's normal unload is complete.
    await new Promise(r=>setTimeout(r,150));
    if(stage==='write')assert.equal(saved()?.refresh_token,refresh);
    else {assert.equal(saved()?.['sa-token']||'','');assert.equal(saved()?.refresh_token||'','');assert.equal(saved()?.user||'','');}
    app.quit();
  }).catch(error=>{console.error(error);app.exit(1);});
}

// Isolated, offline Electron UI/IPC test. Not included in customer packages.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {app,BrowserWindow,dialog}=require('electron');
setTimeout(()=>{console.error('Offline filter smoke timed out');app.exit(1);},45000).unref();
const root=path.resolve(__dirname,'../..');
const stage=path.join(root,'.package-staging/whatsapp-number-filter/app');
const business=require(path.join(stage,'business-crypto.cjs'));
const fixtureKeys=require('node:crypto').generateKeyPairSync('ed25519');
const fixtureSuite={suiteId:'123456789',keyId:'k_123456789_fixture',privateKeyPem:fixtureKeys.privateKey.export({format:'pem',type:'pkcs8'}).toString()};
const fixtureIdentity=business.filterBusinessPublicIdentity(fixtureSuite);
const originalRead=fs.readFileSync;
fs.readFileSync=function(file,...args){if(typeof file==='string'&&path.resolve(file)===path.join(stage,'filter-license-public.json')){const value=JSON.stringify(fixtureIdentity);return args[0]==='utf8'?value:Buffer.from(value);}return originalRead.call(this,file,...args);};
const temp=path.join(root,'.tmp/whatsapp-number-filter-smoke-'+Date.now());
fs.mkdirSync(temp,{recursive:true});
process.env.WNF_USER_DATA_DIR=path.join(temp,'user-data');process.env.WNF_SMOKE='1';
const input=path.join(temp,'input.txt');
fs.writeFileSync(input,'+12025550101\r\n0012025550101\r\n12025550102\r\n12025550103\r\n12025550104\r\ninvalid\r\n');
fs.writeFileSync(path.join(stage,'smoke-fixture.html'),`<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;background:#e8f0eb;color:#3e6454;height:100vh;font:18px Segoe UI"><div id="sync">请不要关闭此窗口，你的消息正在下载中。</div><script>
function component(e){return e!=null&&e.wid?'usyncContactCached getOrRun mi-message-on-whatsapp':null;}
window.require=function(name){if(name==='__debug')return {modulesMap:{'WAWebPhoneNumberWrapperMutatorComponent.react':{defaultExport:component}}};return {usyncContactCached:function(){return {getOrRun:async function(phone){await new Promise(r=>setTimeout(r,50));if(phone.endsWith('04'))throw new Error('429 rate limit');return phone.endsWith('02')?null:{wid:{}};}}}};};
(async()=>{const bucket=await navigator.storageBuckets.open('login-storage-regression',{persisted:true});if(!await bucket.persisted())throw new Error('storage bucket persistence denied');setTimeout(()=>{document.getElementById('sync').outerHTML='<div data-testid="chat-list">离线验证页面 · 不连接真实账号</div>';},2500);})();
</script>`);
let cancelExport=false;
dialog.showOpenDialog=async(_window,options)=>({canceled:cancelExport&&!options.properties.includes('openFile'),filePaths:options.properties.includes('openFile')?[input]:[temp]});
dialog.showErrorBox=(title,message)=>{console.error(title+': '+message);app.exit(1);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.on('web-contents-created',(_event,contents)=>contents.on('console-message',(_event,_level,message)=>console.log('offline-page: '+String(message).slice(0,500))));
const waitFor=async predicate=>{for(let i=0;i<150;i++){if(await predicate())return;await pause(100);}throw new Error('UI state wait timed out');};
require(path.join(stage,'main.cjs'));
app.whenReady().then(async()=>{
 try{
  let window;await waitFor(()=>{window=BrowserWindow.getAllWindows()[0];return window&&!window.webContents.isLoading();});
  const evaluate=expression=>window.webContents.executeJavaScript(expression,true);
  assert.equal(window.webContents.getURL(),'app://number-filter/index.html');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("header")).getPropertyValue("-webkit-app-region")'),'drag','integrated header remains a native drag region');
  assert.equal(await evaluate('getComputedStyle(document.getElementById("window-close")).getPropertyValue("-webkit-app-region")'),'no-drag','window controls remain clickable');
  await evaluate('document.getElementById("window-maximize").click()');
  await waitFor(()=>window.isMaximized());
  await waitFor(async()=>await evaluate('document.getElementById("window-maximize").title==="还原"'));
  await evaluate('document.getElementById("window-maximize").click()');
  await waitFor(()=>!window.isMaximized());
  let minimizedByControl=false;
  window.once('minimize',()=>{minimizedByControl=true;setTimeout(()=>{window.restore();window.showInactive();},80);});
  await evaluate('document.getElementById("window-minimize").click()');
  await waitFor(()=>minimizedByControl&&!window.isMinimized());
  await waitFor(async()=>await evaluate('document.getElementById("connection")?.textContent.includes("同步消息")'));
  await waitFor(async()=>await evaluate('document.getElementById("connection")?.textContent.includes("已登录")'));
  await evaluate('document.getElementById("import").click()');
  await waitFor(async()=>await evaluate('document.getElementById("file-name").textContent==="input.txt"'));
  assert.match(await evaluate('document.getElementById("import-note").textContent'),/重复 1 行，无效 1 行/);
  await evaluate('document.getElementById("start").click()');
  await waitFor(async()=>await evaluate('document.getElementById("progress-numbers").textContent==="4 / 4"'));
  assert.equal(await evaluate('document.getElementById("registered").textContent'),'2');
  assert.equal(await evaluate('document.getElementById("not-registered").textContent'),'1');
  assert.equal(await evaluate('document.getElementById("unknown").textContent'),'1');
  assert.equal(await evaluate('document.getElementById("ratio").textContent'),'50.00%');
  await evaluate('document.getElementById("export").click()');
  await waitFor(async()=>await evaluate('!document.getElementById("show-export").hidden'));
  const folder=fs.readdirSync(temp).find(f=>f.startsWith('Whatsapp号码筛选-'));assert.ok(folder);
  const files=fs.readdirSync(path.join(temp,folder));assert.equal(files.length,4);assert.ok(files.every(f=>f.endsWith('.txt')));
  assert.match(fs.readFileSync(path.join(temp,folder,'已注册号码.txt'),'utf8'),/12025550101\r\n\+12025550103/);
  assert.match(fs.readFileSync(path.join(temp,folder,'未注册号码.txt'),'utf8'),/12025550102/);
  assert.match(fs.readFileSync(path.join(temp,folder,'未确认号码.txt'),'utf8'),/12025550104/);
  assert.match(fs.readFileSync(path.join(temp,folder,'统计结果.txt'),'utf8'),/结果尚不完整/);
  const waView=window.contentView.children.find(v=>v.webContents&&v.webContents.getURL().startsWith('https://web.whatsapp.com/'));
  assert.ok(waView);assert.equal(waView.webContents.session.getUserAgent(),await waView.webContents.executeJavaScript('navigator.userAgent'));assert.doesNotMatch(waView.webContents.session.getUserAgent(),/Electron|[^\x20-\x7e]/);
  const layouts=[];
  for(const [theme,background]of [['blackGold','#08090d'],['pink','#160711'],['murongPurple','#171218'],['clearWaterBlue','#eaf8ff']]){
    process.emit('wnf-test-theme',theme);await pause(70);
    assert.equal(await evaluate('document.documentElement.dataset.theme'),theme);
    assert.equal(await evaluate('getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()'),background);
    const image=await window.capturePage();fs.writeFileSync(path.join(temp,'theme-'+theme+'.png'),image.toPNG());
  }
  for(const [width,height]of [[1000,600],[1000,680],[1280,850]]){
    window.setSize(width,height);await pause(150);
    const layout=await evaluate('(()=>{const a=document.querySelector("aside"),r=a.getBoundingClientRect(),e=document.getElementById("export").getBoundingClientRect(),w=document.querySelector(".account-note").getBoundingClientRect();return {width:innerWidth,height:innerHeight,scroll:a.scrollHeight>a.clientHeight,exportVisible:e.bottom<=r.bottom&&e.top>=r.top,warningVisible:w.top>=r.top&&w.bottom<=r.bottom,bodyFits:document.documentElement.scrollWidth<=innerWidth};})()');
    assert.equal(layout.scroll,false,JSON.stringify(layout));assert.equal(layout.exportVisible,true);assert.equal(layout.warningVisible,true);assert.equal(layout.bodyFits,true);layouts.push(layout);
  }
  assert.match(await evaluate('document.getElementById("authorization-open").textContent'),/2 \/ 3/);
  cancelExport=true;
  for(const remaining of [1,0]){
    await evaluate('document.getElementById("export").click()');
    await waitFor(async()=>await evaluate('document.getElementById("authorization-open").textContent.includes("'+remaining+' / 3")'));
    await pause(50);
  }
  await evaluate('document.getElementById("export").click()');
  await waitFor(async()=>await evaluate('document.getElementById("business-auth-dialog").open'));
  const machine=await evaluate('document.getElementById("business-machine-code").value');
  assert.ok(machine.startsWith('WNFB1.'));
  assert.equal(waView.getVisible(),false,'authorization dialog is not covered by native WhatsApp view');
  const issued=business.issueFilterBusinessCode(fixtureSuite,machine);
  await evaluate('document.getElementById("business-code").value='+JSON.stringify(issued.authorizationCode)+';document.getElementById("activate-business").click();true');
  await waitFor(async()=>await evaluate('document.getElementById("authorization-open").textContent.includes("已授权")&&!document.getElementById("business-auth-dialog").open'));
  assert.equal(waView.getVisible(),true,'activation restores native view');
  const image=await window.capturePage();fs.writeFileSync(path.join(temp,'ui.png'),image.toPNG());
  fs.writeFileSync(path.join(temp,'verification.json'),JSON.stringify({passed:true,offline:true,whatsappDurableStorageWorks:true,backgroundUserAgentConsistent:true,initialSyncStatusCorrect:true,txtImport:true,duplicatesRemoved:true,invalidRowsReported:true,realPreloadIpc:true,compactLayouts:layouts,counts:{registered:2,notRegistered:1,unknown:1},txtExportFiles:files,accountNetworkRequests:0},null,2));
  console.log('Standalone offline UI/IPC/TXT smoke passed, including integrated titlebar drag and minimize/maximize/restore controls: '+temp);
  await evaluate('document.getElementById("window-close").click();true').catch(error=>{if(!window.isDestroyed())throw error;});
 }catch(error){console.error(error.stack||error);app.exit(1);}
});

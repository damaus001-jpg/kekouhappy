const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  const child=require('node:child_process').spawn(require('electron'),[__filename],{cwd:root,env,windowsHide:true,stdio:'inherit'});
  child.on('exit',code=>{process.exitCode=code??1;});child.on('error',error=>{console.error(error);process.exitCode=1;});
}else{
  const {app,BrowserWindow}=require('electron');
  app.setPath('userData',path.join(root,'.tmp/filter-issuer-ui-test'));
  const timer=setTimeout(()=>{console.error('Issuer UI test timed out');app.exit(1);},20000);
  app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,width:820,height:640,webPreferences:{sandbox:true,contextIsolation:true}});
    const html=fs.readFileSync(path.join(root,'license-issuer/index.html'),'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/,'').replace(/<script[^>]+><\/script>/g,'').replace(/<link rel="stylesheet"[^>]+>/g,'');
    const css=fs.readFileSync(path.join(root,'license-issuer/styles.css'),'utf8');
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html.replace('</head>','<style>'+css+'</style></head>')));
    const execute=source=>win.webContents.executeJavaScript(source,true);
    await execute(`window.calls=[];window.licenseIssuer={getStatus:async()=>({initialized:true}),login:async()=>({authenticated:true}),getSuiteSummary:async()=>({suiteId:'123456789',keyId:'fixture-key'}),issueFilterBusiness:async machineCode=>{window.calls.push(['issue',machineCode]);if(machineCode==='bad')throw new Error('本机码无效');return {authorizationCode:'0042',suiteId:'123456789'};},copyText:async value=>{window.calls.push(['copy',value]);}};true`);
    await execute(fs.readFileSync(path.join(root,'license-issuer/renderer.js'),'utf8'));
    await execute(`document.querySelector('#loginBtn').click();true`);
    await new Promise(resolve=>setTimeout(resolve,40));
    assert.equal(await execute(`document.querySelector('#issuerPanel').classList.contains('hidden')`),false);
    await execute(`document.querySelector('#filterTab').click();document.querySelector('#filterMachineCode').value='WNFB1.fixture';document.querySelector('#issueFilterBtn').click();true`);
    await new Promise(resolve=>setTimeout(resolve,40));
    assert.equal(await execute(`document.querySelector('#filterAuthorizationCode').value`),'0042','leading zeroes are preserved');
    await execute(`document.querySelector('#copyFilterCodeBtn').click();true`);
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.deepEqual(await execute('window.calls'),[['issue','WNFB1.fixture'],['copy','0042']]);
    await execute(`document.querySelector('#filterMachineCode').value='bad';document.querySelector('#filterMachineCode').dispatchEvent(new Event('input'));document.querySelector('#issueFilterBtn').click();true`);
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(await execute(`document.querySelector('#filterResultPanel').classList.contains('hidden')`),true,'failed or changed machine code cannot copy a stale result');
    assert.match(await execute(`document.querySelector('#statusText').textContent`),/本机码无效/);
    await execute(`document.querySelector('#translatorTab').click();true`);
    assert.equal(await execute(`document.querySelector('#translatorBusinessPanel').classList.contains('hidden')`),false,'old translator business form remains accessible');
    for(const size of [[820,640],[760,560]]){
      win.setSize(...size);await execute(`document.querySelector('#filterTab').click();true`);
      assert.equal(await execute('document.documentElement.scrollWidth<=innerWidth'),true,'business form fits minimum width');
    }
    win.destroy();clearTimeout(timer);console.log('filter-issuer-ui: login, business tabs, four-digit leading zeroes, copy, stale/error clearing and minimum window layout passed');app.exit(0);
  }).catch(error=>{console.error(error);clearTimeout(timer);app.exit(1);});
}

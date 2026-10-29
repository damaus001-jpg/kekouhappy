const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  const child=require('node:child_process').spawn(require('electron'),[__filename],{cwd:root,env,windowsHide:true,stdio:'inherit'});
  child.on('error',e=>{console.error(e);process.exitCode=1;});child.on('exit',code=>process.exitCode=code??1);
}else{
  const {app,BrowserWindow}=require('electron');
  const dir=fs.mkdtempSync(path.join(root,'.tmp','remote-ui-'));app.setPath('userData',dir);app.on('window-all-closed',()=>{});
  let server;const timeout=setTimeout(()=>app.exit(1),60000);
  app.whenReady().then(async()=>{
    const findings=[
      {code:'known',severity:'confirmed',trusted:true,connection:{id:'known',kind:'vnc',sourceAddress:'10.0.0.9',localPort:5900,trustKey:'saved'}},
      {code:'pending',severity:'confirmed',connection:{id:'pending',kind:'rdp',sourceAddress:'192.0.2.8',localPort:3390,remotePort:54000,sessionId:2,sessionName:'rdp-tcp#1',userName:'operator',processId:123,trustKey:'pending-key'}},
      {code:'unknown',severity:'confirmed',connection:{id:'unknown',kind:'rdp',sourceAddress:''}}
    ];
    fs.writeFileSync(path.join(dir,'fixture.html'),`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="fixture"></div><script type="module">
      import {createApp,h,ref} from 'vue';import Connections from '/src/components/RemoteGuardConnections.vue';
      const busy=ref(false);window.setBusy=v=>busy.value=v;
      createApp({setup(){return()=>h(Connections,{findings:${JSON.stringify(findings)},sources:[{key:'saved',kind:'vnc',sourceAddress:'10.0.0.9',servicePort:5900}],busy:busy.value,manage:true,onTrust:id=>window.selected=id,onForget:key=>window.forgotten=key});}}).mount('#fixture');
    </script></body></html>`);
    const {createServer}=await import('vite');server=await createServer({root,server:{host:'127.0.0.1',port:0}});await server.listen();
    const win=new BrowserWindow({show:false,width:720,height:900,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
    await win.loadURL(`http://127.0.0.1:${server.httpServer.address().port}/`+path.relative(root,path.join(dir,'fixture.html')).replaceAll('\\','/'));
    const exec=s=>win.webContents.executeJavaScript(s,true);
    for(let i=0;i<150&&!await exec(`document.querySelectorAll('article').length===3`);i++)await new Promise(r=>setTimeout(r,30));
    const details=await exec(`document.querySelector('article').textContent`);
    for(const value of ['192.0.2.8','3390','54000','operator','rdp-tcp#1','123'])assert.ok(details.includes(value),value);
    assert.equal(await exec(`document.querySelectorAll('article')[1].querySelector('button').disabled`),true,'unknown source cannot be remembered');
    assert.equal(await exec(`document.querySelector('article.trusted button')===null`),true);
    await exec(`document.querySelector('article button').click()`);assert.equal(await exec(`window.selected`),'pending');
    await exec(`document.querySelector('.remote-trusted-source button').click()`);assert.equal(await exec(`window.forgotten`),'saved');
    await exec(`window.setBusy(true)`);assert.equal(await exec(`[...document.querySelectorAll('button')].every(b=>b.disabled)`),true);
    assert.equal(await exec(`document.documentElement.scrollWidth<=innerWidth`),true,'compact panel fits available width');
    console.log('remote guard UI: actual connection details, pending-first ordering, trust/revoke IDs, unavailable-source and busy protection, compact layout passed; no host scan or Windows lock invoked');
    win.destroy();await server.close();clearTimeout(timeout);app.exit(0);
  }).catch(async e=>{console.error(e);if(server)await server.close();clearTimeout(timeout);app.exit(1);});
}

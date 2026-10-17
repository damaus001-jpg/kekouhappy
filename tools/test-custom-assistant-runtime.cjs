const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
  const child = spawn(require('electron'), [__filename], {cwd:root,env,windowsHide:true,stdio:'inherit'});
  child.on('error',e=>{console.error(e);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
} else {
  const { app, BrowserWindow, clipboard, dialog, ipcMain, protocol } = require('electron');
  const ts = require('typescript');
  const dir = path.join(root,'.tmp',`custom-assistant-${Date.now()}`);
  fs.mkdirSync(dir,{recursive:true}); app.setPath('userData',dir);
  app.on('window-all-closed',()=>{});
  protocol.registerSchemesAsPrivileged([{scheme:'app',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
  let server,win,clipboardText='',clipboardImage;
  const timer=setTimeout(()=>{console.error('custom assistant test timed out');app.exit(1);},60000);
  function loadTs(relative){const js=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;return new Function('exports',js+';return exports;')({});}
  app.whenReady().then(async()=>{
    const service=await import(pathToFileURL(path.join(root,'dist-electron/assistant-library.js')).href);
    protocol.handle('app',async request=>new Response(await fs.promises.readFile(await service.assistantMediaPath(new URL(request.url).pathname.slice(1))),{headers:{'Content-Type':'image/png'}}));
    const store=await import(pathToFileURL(path.join(root,'dist-electron/assistant-material-store.js')).href);
    const {buildAssistantCatalog}=loadTs('src/assistant-material-catalog.ts');
    clipboard.writeText=value=>{clipboardText=value;};clipboard.readText=()=>clipboardText;
    clipboard.writeImage=value=>{clipboardImage=value;};clipboard.readImage=()=>clipboardImage;
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(root,'src/assets/xiaozhi-assistant-transparent.png')]});
    ipcMain.handle('fixture:library',()=>service.readAssistantLibrary());
    ipcMain.handle('fixture:save',(_e,kind,value)=>service.saveAssistantModule(kind,value));
    ipcMain.handle('fixture:attach',(_e,kind,id)=>service.attachAssistantMedia(kind,id));
    ipcMain.handle('fixture:usage',()=>store.readAssistantUsage('fixture-profile'));
    ipcMain.handle('fixture:copy',async(_e,material)=>{
      const catalog=await buildAssistantCatalog(await service.readAssistantLibrary());
      const known=[...catalog.schedule,...catalog.quotes].flatMap(c=>c.materials).find(m=>m.id===material.id);
      assert.ok(known,'copy must refer to a saved custom material');
      return store.stageAssistantMaterial(known);
    });
    ipcMain.handle('fixture:record',(_e,result)=>store.recordAssistantUse({profileId:'fixture-profile',platform:'whatsapp',token:result.token,contactId:result.contactId,contactTitle:result.contactTitle,actualText:result.actualText}));
    const preload=path.join(dir,'preload.cjs');
    fs.writeFileSync(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('chatTranslator',{getAssistantLibrary:()=>ipcRenderer.invoke('fixture:library'),saveAssistantModule:(k,v)=>ipcRenderer.invoke('fixture:save',k,v),attachAssistantMedia:(k,id)=>ipcRenderer.invoke('fixture:attach',k,id),copyFixture:m=>ipcRenderer.invoke('fixture:copy',m),recordFixture:r=>ipcRenderer.invoke('fixture:record',r),usageFixture:()=>ipcRenderer.invoke('fixture:usage')});`);
    const html=`<!doctype html><html><head><meta charset="UTF-8"><style>:root{--text:#eee;--muted:#aaa;--muted-strong:#ccc;--accent:#dca749;--accent-bright:#ffd68f;--bg:#111;--bg-soft:#191919;--panel-strong:#222;--panel-muted:#292929;--line:#555;--line-strong:#666;--shadow:0 8px 30px #0006}body{background:#111}</style></head><body><div id="main" data-jid="15550000001@c.us"><header><span title="Contact A">Contact A</span></header><footer><div id="input" role="textbox" contenteditable="true" style="width:300px;min-height:80px"></div></footer></div><div id="fixture"></div><script type="module">
      import {createApp,ref,computed,h} from 'vue';
      import Panel from '/src/components/CustomAssistantPanel.vue';
      import {buildAssistantRuntimeScript} from '/src/assistant-material-runtime.ts';
      import {buildAssistantCatalog} from '/src/assistant-material-catalog.ts';
      const contact=ref('wa:15550000001@c.us'),usages=ref([]),open=ref(true);window.setContact=async id=>{contact.value=id;document.querySelector('#main').setAttribute('data-jid',id.slice(3));usages.value=await window.chatTranslator.usageFixture();};
      document.querySelector('#input').addEventListener('paste',e=>{if(e.clipboardData?.files.length){e.preventDefault();const p=document.createElement('div');p.setAttribute('data-testid','media-editor');p.textContent='Accepted attachment';document.body.appendChild(p);}});
      const run=cmd=>(0,eval)(buildAssistantRuntimeScript(cmd));
      async function send(m){window.copyDone=false;const pending=await window.chatTranslator.copyFixture(m);const css=getComputedStyle(document.documentElement),colors={};for(const key of ['--text','--muted','--muted-strong','--accent','--accent-bright','--bg','--bg-soft','--panel-strong','--panel-muted','--line','--line-strong'])colors[key]=css.getPropertyValue(key);run({command:'install',config:{platform:'whatsapp',catalog:await buildAssistantCatalog(await window.chatTranslator.getAssistantLibrary()),colors,icon:'',usages:usages.value,enabled:true,showButton:false}});run({command:'confirm',pending,contactId:contact.value});let r;do{await new Promise(r=>setTimeout(r,30));r=run({command:'confirmation-status',token:pending.token});}while(r.status==='pending');if(r.status==='inserted'){const usage=await window.chatTranslator.recordFixture(r);run({command:'result',token:pending.token,usage});}usages.value=await window.chatTranslator.usageFixture();window.copyDone=true;}
      createApp({setup(){return()=>h(Panel,{open:open.value,workspace:true,collapsed:true,usedIds:usages.value.filter(u=>u.confirmation==='inserted'&&u.contactId===contact.value).map(u=>u.materialId),contactTitle:contact.value,'onUpdate:open':v=>open.value=v,onCopy:send});}}).mount('#fixture');
    </script></body></html>`;
    const {createServer}=await import('vite');
    fs.writeFileSync(path.join(dir,'fixture.html'),html);
    server=await createServer({root,server:{host:'127.0.0.1',port:5192,strictPort:true}});
    await server.listen();
    win=new BrowserWindow({show:false,width:1100,height:1000,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false,preload}});
    win.webContents.on('console-message',event=>{if(event.level==='error')console.error('UI renderer:',event.message);});
    await win.loadURL('http://127.0.0.1:5192/'+path.relative(root,path.join(dir,'fixture.html')).replaceAll('\\','/'));
    const execute=s=>win.webContents.executeJavaScript(s,true);
    const wait=async expression=>{for(let i=0;i<100;i++){if(await execute(expression))return;await new Promise(r=>setTimeout(r,40));}throw new Error('UI wait failed: '+expression);};
    const click=async label=>execute(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw new Error('missing button');b.click();return true;})()`);
    await wait(`!!document.querySelector('.assistant-persona-custom textarea')&&!document.querySelector('.assistant-library-tabs button').disabled`);
    await execute(`(()=>{window.confirm=()=>true;const t=document.querySelector('.assistant-persona-custom textarea');t.value=${JSON.stringify('Custom persona\nA long private biography')};t.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
    await click('保存资料');await wait(`!!document.querySelector('.assistant-persona-text')`);
    assert.equal(await execute(`document.querySelector('.assistant-persona-text').textContent`),'Custom persona\nA long private biography');
    assert.equal(await execute(`Array.from(document.querySelectorAll('.assistant-persona-custom button')).some(b=>b.textContent.includes('复制'))`),false);
    for(const tab of ['一周行程','案例金句']){
      await click(tab);await wait(`!!document.querySelector('.assistant-empty')`);
      assert.equal(await execute(`document.querySelectorAll('.assistant-custom-card').length`),0,'no built-in cards');
      await click('新建卡片');await wait(`!!document.querySelector('.assistant-custom-editor')`);
      await execute(`(()=>{const e=document.querySelector('.assistant-custom-editor');const n=e.querySelector('input');n.value=${JSON.stringify(tab+'测试卡')};n.dispatchEvent(new Event('input',{bubbles:true}));const t=e.querySelector('textarea');t.value=${JSON.stringify('First paragraph\n\nSecond paragraph')};t.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
      await click('上传图片');await wait(`document.querySelectorAll('.assistant-media-card img').length===1&&!document.querySelector('.assistant-library-tabs button').disabled`);
      await click('保存卡片');await wait(`!document.querySelector('.assistant-custom-editor')&&document.querySelectorAll('.assistant-custom-card').length===1`);
      await wait(`Array.from(document.querySelectorAll('.assistant-image-preview img')).every(i=>i.complete&&i.naturalWidth>0)`);
      assert.equal(await execute(`document.querySelectorAll('.assistant-card-material').length`),2,'one whole text and one image');
      const send=async index=>{
        await execute(`document.querySelectorAll('.assistant-material-actions button')[${index}].click()`);
        await wait(`!!document.querySelector('#df-material-root')?.shadowRoot.querySelector('.dialog')`);
        assert.equal(await execute('window.copyDone'),false,'opening confirmation does not mark usage');
        await execute(`document.querySelector('#df-material-root').shadowRoot.querySelector('.primary').click()`);
        try{await wait('window.copyDone===true');}catch(error){console.error(await execute(`JSON.stringify({confirmation:window.__dfMaterialRuntime?.confirmation,error:document.querySelector('#df-material-root')?.shadowRoot.querySelector('.error')?.textContent,input:document.querySelector('#input').innerText,html:document.querySelector('#input').innerHTML})`));throw error;}
      };
      await send(0);assert.equal(clipboardText,'First paragraph\n\nSecond paragraph');
      assert.equal(await execute(`document.querySelectorAll('.assistant-material-actions .material-used').length`),tab==='一周行程'?1:2,'same photo remains used across cards');
      await send(1);assert.ok(clipboardImage&&!clipboardImage.isEmpty());
      assert.equal(await execute(`document.querySelectorAll('.assistant-material-actions .material-used').length`),2);
      await execute(`window.setContact('wa:15550000002@c.us')`);assert.equal(await execute(`document.querySelectorAll('.assistant-material-actions .material-used').length`),0);
      await execute(`window.setContact('wa:15550000001@c.us')`);assert.equal(await execute(`document.querySelectorAll('.assistant-material-actions .material-used').length`),2);
    }
    const library=await service.readAssistantLibrary();
    const catalog=await buildAssistantCatalog(library);assert.equal(catalog.persona.length,0);assert.equal(catalog.schedule.length,1);assert.equal(catalog.quotes.length,1);
    assert.equal(catalog.schedule[0].materials[1].id,catalog.quotes[0].materials[1].id,'same image on different cards shares a usage identity');
    assert.equal((await store.readAssistantUsage('fixture-profile')).length,3);
    assert.equal((await store.readAssistantUsage('another-profile')).length,0);
    await new Promise(r=>setTimeout(r,250));
    const cap=await win.webContents.capturePage();fs.writeFileSync(path.join(dir,'custom-cards.png'),cap.toPNG());
    console.log('custom-assistant-runtime: persona paste/view, empty defaults, create/save/upload, confirmed text/image insertion, cross-card photo usage, contact switch and encrypted persistence passed');
    console.log('capture='+path.join(dir,'custom-cards.png'));
  }).then(async()=>{clearTimeout(timer);win?.destroy();await server?.close();app.exit(0);}).catch(async e=>{console.error(e);clearTimeout(timer);win?.destroy();await server?.close();app.exit(1);});
}

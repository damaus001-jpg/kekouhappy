const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
if(!process.versions.electron){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;const child=require('node:child_process').spawn(require('electron'),[__filename,...process.argv.slice(2)],{env,windowsHide:true,stdio:'inherit'});child.on('exit',code=>process.exitCode=code??1);}else{
 const {app,BrowserWindow}=require('electron');const root=path.resolve(__dirname,'..');app.setPath('userData',fs.mkdtempSync(path.join(root,'.tmp','telegram-space-recovery-')));
 app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{sandbox:true,contextIsolation:true}});
  const execute=s=>win.webContents.executeJavaScript(s,true);
  const source=fs.readFileSync(path.join(root,'electron/webview-send-guard-preload.cjs'),'utf8').replaceAll('location.hostname',"'web.telegram.org'");
  const rows=[];
  async function fixture({narrow=false,rootClass='new-message-wrapper',notification=''}={}){
   win.setSize(narrow?560:1100,800);await win.loadURL('data:text/html,<!doctype html><html><body></body></html>');
   await execute(`document.body.innerHTML='<style>aside{width:250px}@media(max-width:700px){aside{display:none}}[contenteditable]{min-height:60px;width:280px}</style><aside>Contacts</aside><main class="chat active" data-peer-id="101"><div class="${rootClass}"><div class="input-message-input" contenteditable="true" role="textbox">中文草稿</div></div></main>';window.guardMessages=[];window.editor=document.querySelector('[contenteditable]');window.guard=new Function('require',${JSON.stringify(source+';return {handleTranslationSpace,resetTranslationSpace,handleKeydown};')})(()=>({ipcRenderer:{sendToHost:(_channel,payload)=>guardMessages.push(payload)}}));editor.focus();${notification};true;`);
  }
  const count=()=>execute("guardMessages.filter(m=>m.action==='translate').length");
  async function space(){win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});win.webContents.sendInputEvent({type:'char',keyCode:' '});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await new Promise(r=>setTimeout(r,25));}
  await fixture();await space();assert.equal(await count(),0);await space();rows.push({name:'wide-layout-double-space',passed:await count()===1});
  for(const [name,data,type]of [['null-data',null,'insertText'],['nbsp-data','\u00a0','insertText'],['replacement-input',null,'insertReplacementText']]){
   const notification=`editor.addEventListener('input',e=>{if(e.isTrusted)queueMicrotask(()=>editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:${JSON.stringify(type)},data:${JSON.stringify(data)}})));});`;
   await fixture({narrow:true,notification});assert.equal(await execute("getComputedStyle(document.querySelector('aside')).display"),'none');await space();await space();await space();rows.push({name:'narrow-rich-editor-'+name,passed:await count()===1});
  }
  await fixture({narrow:true,rootClass:'chat-input'});await space();await space();rows.push({name:'responsive-composer-wrapper',passed:await count()===1});
  await fixture({narrow:true});await execute("guard.resetTranslationSpace({type:'compositionstart',target:editor});guard.resetTranslationSpace({type:'compositionend',target:document});true;");await space();await space();rows.push({name:'retargeted-ime-end-recovers',passed:await count()===1});
  await fixture({narrow:true});await space();await execute("document.querySelector('.chat').dataset.peerId='202';true;");await space();const premature=await count();await space();rows.push({name:'contact-switch-needs-two-fresh-spaces',passed:premature===0&&await count()===1});
  await fixture({narrow:true});await space();await space();await execute("document.querySelector('.chat').dataset.peerId='202';editor.textContent='中文草稿';editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText'}));true;");await space();await space();rows.push({name:'same-draft-new-contact-is-not-deduplicated',passed:await count()===2});
  await fixture({narrow:true});await execute("editor.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));true;");await space();await space();const during=await count();await execute("editor.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));true;");await space();const first=await count();await space();rows.push({name:'ime-spaces-never-count-as-translation-spaces',passed:during===0&&first===0&&await count()===1});
  await fixture({narrow:true});await execute("guard.resetTranslationSpace({type:'compositionstart',target:editor});document.querySelector('.chat').dataset.peerId='202';editor.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));true;");await space();await space();rows.push({name:'new-contact-ime-remains-protected',passed:await count()===0});
  await fixture({narrow:true});await execute("guard.handleKeydown({isTrusted:true,type:'keydown',key:'Enter',code:'Enter',isComposing:true,keyCode:229,target:editor,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});document.querySelector('.chat').dataset.peerId='202';editor.textContent='新联系人中文草稿';true;");await new Promise(r=>setTimeout(r,160));rows.push({name:'deferred-ime-enter-never-translates-new-contact',passed:await count()===0});
  rows.forEach(r=>console.log((r.passed?'PASS ':'FAIL ')+r.name));win.destroy();if(!process.argv.includes('--baseline'))assert.ok(rows.every(r=>r.passed),'Telegram space recovery regressions failed');
 }).catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>app.exit(process.exitCode||0));
}

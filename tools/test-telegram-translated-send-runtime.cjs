const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const ts=require('typescript');
const root=path.resolve(__dirname,'..');app.setPath('userData',path.join(root,'.tmp','telegram-translated-send-test'));
app.whenReady().then(async()=>{
  const shared=await import('../dist-electron/shared.js');
  const appSource=fs.readFileSync(path.join(root,'src/App.vue'),'utf8').split('<script setup lang="ts">')[1].split('</script>')[0];
  const parsed=ts.createSourceFile('App.ts',appSource,ts.ScriptTarget.ES2022,true);
  const names=['buildComposerPlainTextReaderSource','isMediaCaptionComposerFromDom','buildMediaCaptionComposerSource','buildDirectSendHttpUrlSource','buildComposerScript','buildInjectedComposerScript'];
  const selected=parsed.statements.filter(s=>ts.isFunctionDeclaration(s)&&names.includes(s.name?.text));assert.equal(selected.length,names.length);
  const code=ts.transpileModule(selected.map(s=>s.getText(parsed)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const helpers=new Function('activeTheme','readComposerPlainTextFromDom','isDirectSendHttpUrl','readTelegramConversationIdFromDom',code+';return {buildComposerScript,buildInjectedComposerScript};')({value:'blackGold'},shared.readComposerPlainTextFromDom,shared.isDirectSendHttpUrl,shared.readTelegramConversationIdFromDom);
  const win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{sandbox:true,contextIsolation:true}});
  await win.loadURL('data:text/html,<html><body></body></html>');
  const execute=s=>win.webContents.executeJavaScript(s,true);const results=[];
  const fixture=async(button,listener)=>execute(`document.body.innerHTML=${JSON.stringify('<div class="chat-input-main" style="position:fixed;bottom:20px;width:650px"><div class="input-message-container"><div id="input" class="input-message-input" contenteditable="true" style="width:550px;min-height:60px">Hello from translation</div></div>'+button+'</div>')};window.testSends=0;document.getElementById('input').focus();${listener};true`);
  await fixture('<div class="btn-send-container"><div class="btn-send"><svg></svg></div></div>',"document.querySelector('.btn-send').onclick=()=>{window.testSends++;document.getElementById('input').textContent='';}");
  const icon=await execute(helpers.buildComposerScript('send','Hello from translation',true));
  results.push({name:'telegram-icon-only-send-button',passed:icon.ok===true&&await execute('window.testSends')===1,result:icon.reason||icon.method});
  await fixture('',"document.getElementById('input').onkeydown=event=>{if(event.keyCode===13&&event.which===13){window.testSends++;event.target.textContent='';}}");
  const fallback=await execute(helpers.buildComposerScript('send','Hello from translation',true));
  results.push({name:'telegram-keycode-enter-fallback',passed:fallback.ok===true&&await execute('window.testSends')===1,result:fallback.reason||fallback.method});
  await fixture('<div class="btn-send"><svg></svg></div>',"document.querySelector('.btn-send').onclick=()=>{window.testSends++;document.getElementById('input').textContent='';}");
  const mismatch=await execute(helpers.buildComposerScript('send','Different text',true));
  results.push({name:'mismatching-draft-remains-blocked',passed:mismatch.ok===false&&mismatch.reason==='send-text-mismatch'&&await execute('window.testSends')===0});
  // The real Telegram composer guard is installed unchanged except for the
  // hostname in this isolated DOM fixture. No network, API, or real contact.
  await fixture('<div class="btn-send"><svg></svg></div>','');
  const install=helpers.buildInjectedComposerScript('install').replaceAll('location.hostname',"'web.telegram.org'");
  await execute(install);
  const sequence=await execute(`(()=>{const input=document.getElementById('input');input.dataset.dfTranslatedReady='Hello from translation';input.dataset.dfTranslatorReadyRequestId='proof-1';window.__dfTranslatorQueue=[];
    for(const type of ['keydown','keypress','keyup'])input.dispatchEvent(new KeyboardEvent(type,{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
    return window.__dfTranslatorQueue.filter(e=>e.action==='send').length;})()`);
  results.push({name:'one-enter-one-send-request',passed:sequence===1,requests:sequence});
  const shadow=await execute(`(()=>{window.__dfTranslatorQueue=[];const root=document.createElement('div');root.id='df-material-root';const shadow=root.attachShadow({mode:'open'});const editor=document.createElement('textarea');editor.value='Material editor';shadow.appendChild(editor);document.body.appendChild(root);editor.focus();editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,composed:true,cancelable:true}));return window.__dfTranslatorQueue.filter(e=>e.action==='send'||e.action==='translate').length;})()`);
  results.push({name:'material-dialog-enter-does-not-send-chat',passed:shadow===0,requests:shadow});
  fs.writeFileSync(path.join(root,'.tmp','telegram-translated-send-results.json'),JSON.stringify(results,null,2));
  results.forEach(r=>console.log(`${r.passed?'PASS':'FAIL'} ${r.name}${r.requests!==undefined?' requests='+r.requests:''}`));
  win.destroy();app.exit(process.argv.includes('--baseline')?0:results.every(r=>r.passed)?0:1);
}).catch(e=>{console.error(e);app.exit(1);});

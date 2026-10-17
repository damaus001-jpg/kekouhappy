const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  const child=spawn(require('electron'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,stdio:'inherit'});
  const timer=setTimeout(()=>{child.kill();process.exitCode=1;},60000);
  child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1;});
  child.on('exit',code=>{clearTimeout(timer);process.exitCode=code??1;});
}else{
  const {app,BrowserWindow}=require('electron');
  const ts=require('typescript');
  const {pathToFileURL}=require('node:url');
  const baseline=process.argv.includes('--baseline');
  app.setPath('userData',path.join(root,'.tmp/signal-send-target-test'));
  app.whenReady().then(async()=>{
    const shared=await import(pathToFileURL(path.join(root,'dist-electron/shared.js')).href);
    const source=baseline?spawnSync('git',['show','HEAD:src/App.vue'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout:fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
    const ast=ts.createSourceFile('App.ts',source.slice(source.indexOf('>')+1,source.indexOf('</script>')),ts.ScriptTarget.Latest,true);
    const names=['buildComposerPlainTextReaderSource','buildMediaCaptionComposerSource','isMediaCaptionComposerFromDom','buildDirectSendHttpUrlSource','buildComposerScript','buildInjectedComposerScript'];
    const code=names.map(name=>{const item=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(item,name);return item.getText(ast);}).join('\n');
    const factory=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const helpers=new Function('activeTheme','readComposerPlainTextFromDom','isDirectSendHttpUrl','readTelegramConversationIdFromDom',factory+';return {buildComposerScript,buildInjectedComposerScript};')({value:'blackGold'},shared.readComposerPlainTextFromDom,shared.isDirectSendHttpUrl,shared.readTelegramConversationIdFromDom);
    const win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
    await win.loadURL('data:text/html,<!doctype html><html><body></body></html>');
    const execute=script=>win.webContents.executeJavaScript(script,true);
    const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
    const send=(signature='signal:'+a,text='Hello from translation',action='send')=>execute(helpers.buildComposerScript(action,text,true,false,'default','',{platform:'signal',conversationSignature:signature}));
    async function fixture(mode='button'){
      const html=`<style>body{margin:0}button{min-width:100px;min-height:30px}.CompositionArea{position:fixed;bottom:20px;left:300px;width:650px}.module-composition-input__input{width:550px;min-height:60px}</style><aside><button id="contact">Send this report tomorrow</button></aside><div class="CompositionArea" data-df-signal-conversation-id="${a}"><div id="input" class="module-composition-input__input" contenteditable="true" role="textbox" aria-label="Message">Hello from translation</div><div class="CompositionArea__button-cell">${mode==='fallback'?'':'<button id="send" aria-label="Send message">Send</button>'}</div></div>`;
      await execute(`(()=>{document.body.innerHTML=${JSON.stringify(html)};window.test={contactClicks:0,sendClicks:0,nativeSends:0,enterAttempts:0,flagDuring:null,flagAfter:null};window.__dfTranslatorProgrammaticSend=false;
        const currentRoot=document.querySelector('.CompositionArea'),input=document.querySelector('#input');
        document.querySelector('#contact').onclick=()=>{window.test.contactClicks++;currentRoot.setAttribute('data-df-signal-conversation-id',${JSON.stringify(b)});input.textContent='';};
        if(document.querySelector('#send'))document.querySelector('#send').onclick=()=>{window.test.sendClicks++;window.test.flagDuring=window.__dfTranslatorProgrammaticSend;if(${JSON.stringify(mode)}==='switch'){currentRoot.setAttribute('data-df-signal-conversation-id',${JSON.stringify(b)});input.textContent='Other contact draft';window.__dfSignalComposerReady={text:'Other contact draft',requestId:'other-proof',conversationSignature:'signal:'+${JSON.stringify(b)}};}else{window.test.nativeSends++;input.textContent='';}setTimeout(()=>window.test.flagAfter=window.__dfTranslatorProgrammaticSend,0);};
        input.onkeydown=event=>{if(event.key==='Enter'){window.test.enterAttempts++;window.test.nativeSends++;input.textContent='';}};return true;})()`);
    }
    const state=()=>execute(`({...window.test,current:document.querySelector('.CompositionArea').getAttribute('data-df-signal-conversation-id'),draft:document.querySelector('#input').textContent,ready:window.__dfSignalComposerReady?.text})`);
    await fixture();
    let result=await send(),snapshot=await state();
    if(baseline){
      assert.equal(snapshot.contactClicks,1);assert.equal(snapshot.current,b);assert.equal(snapshot.nativeSends,0);assert.equal(result.ok,true);
      console.log('REPRODUCED baseline: approved send clicked a sidebar contact containing Send; changed conversation and falsely reported success.');win.destroy();return;
    }
    assert.equal(result.ok,true);assert.equal(snapshot.contactClicks,0);assert.equal(snapshot.current,a);assert.equal(snapshot.nativeSends,1);
    assert.equal(snapshot.flagDuring,true);assert.equal(snapshot.flagAfter,false,'the privileged-send flag must not remain enabled while awaiting UI confirmation');
    await fixture();await execute(`(()=>{const root=document.querySelector('.CompositionArea');root.style.visibility='hidden';setTimeout(()=>root.style.visibility='visible',180);return true;})()`);
    result=await send();snapshot=await state();assert.equal(result.ok,true,'a brief Signal layout hide during maximize/restore should settle before sending');assert.equal(snapshot.nativeSends,1);assert.equal(snapshot.contactClicks,0);
    await fixture();await execute(`(()=>{const root=document.querySelector('.CompositionArea'),input=document.querySelector('#input');input.removeAttribute('contenteditable');input.removeAttribute('role');root.setAttribute('contenteditable','true');return true;})()`);
    result=await send();snapshot=await state();assert.equal(result.ok,true,'a unique named composer remains bound when Signal moves editable attributes to its wrapper');assert.equal(snapshot.nativeSends,1);assert.equal(snapshot.contactClicks,0);
    await fixture('fallback');result=await send();snapshot=await state();
    assert.equal(result.ok,true);assert.equal(result.method,'enter');assert.equal(snapshot.nativeSends,1);assert.equal(snapshot.contactClicks,0);assert.equal(snapshot.current,a);
    await fixture();result=await send('signal:'+b);snapshot=await state();assert.equal(result.ok,false);assert.equal(snapshot.contactClicks+snapshot.sendClicks+snapshot.nativeSends,0);assert.equal(snapshot.draft,'Hello from translation');
    await fixture();result=await send('');assert.equal(result.ok,false,'missing target identity must fail closed');
    await fixture();result=await send('signal:'+a,'Different draft');snapshot=await state();assert.equal(result.reason,'send-text-mismatch');assert.equal(snapshot.nativeSends,0);
    await fixture();await execute(`(()=>{const composer=document.querySelector('#input'),focus=composer.focus.bind(composer);composer.focus=()=>{focus();document.querySelector('.CompositionArea').setAttribute('data-df-signal-conversation-id',${JSON.stringify(b)});};return true;})()`);
    result=await send();snapshot=await state();assert.equal(result.ok,false);assert.equal(snapshot.sendClicks,0,'a synchronous focus-triggered conversation change must stop before clicking');assert.equal(snapshot.enterAttempts,0);
    await fixture('switch');result=await send();snapshot=await state();assert.equal(result.ok,false);assert.equal(result.reason,'signal-conversation-changed');assert.equal(snapshot.enterAttempts,0,'conversation changes after a click must not trigger an Enter retry');
    const cleanup=await execute(helpers.buildInjectedComposerScript('state',{draft:'',translated:'',reviewStatus:'hidden',reviewText:'',expectedConversationSignature:'signal:'+a}));
    assert.equal(cleanup,false);snapshot=await state();assert.equal(snapshot.draft,'Other contact draft');assert.equal(snapshot.ready,'Other contact draft','stale completion must not clear the new conversation approval');
    await fixture();await execute(`const hidden=document.createElement('div');hidden.className='CompositionArea';hidden.setAttribute('data-df-signal-conversation-id',${JSON.stringify(b)});hidden.style.display='none';hidden.innerHTML='<div contenteditable="true" role="textbox">Hello from translation</div>';document.body.appendChild(hidden);true;`);
    result=await send();assert.equal(result.ok,true,'a hidden previous conversation must not replace the active root');
    await fixture();await execute(`const duplicate=document.querySelector('.CompositionArea').cloneNode(true);document.body.appendChild(duplicate);true;`);
    result=await send();assert.equal(result.ok,false,'ambiguous visible conversation roots must fail closed');
    await fixture();await execute(`const cell=document.querySelector('.CompositionArea__button-cell');cell.insertAdjacentHTML('afterbegin','<button id="picker" aria-haspopup="dialog" aria-label="Send an emoji">Emoji</button><div data-fun-overlay role="dialog"><button id="sticker" aria-label="Send sticker">Sticker</button></div>');document.querySelector('#picker').onclick=()=>window.test.contactClicks++;document.querySelector('#sticker').onclick=()=>window.test.contactClicks++;true;`);
    result=await send();snapshot=await state();assert.equal(result.ok,true);assert.equal(snapshot.contactClicks,0);assert.equal(snapshot.nativeSends,1);
    await fixture();await execute("document.querySelector('#input').textContent='1234567890123456';true;");
    result=await send('signal:'+a,'1234567890123456','sendExact');snapshot=await state();assert.equal(result.ok,true);assert.equal(snapshot.current,a);assert.equal(snapshot.contactClicks,0,'the separately authorized exact-send path must keep the same target binding');
    win.destroy();console.log('signal-send-target-runtime: sidebar misclick regression, native button/Enter, target/text mismatch, focus and completion races, stale cleanup, hidden/ambiguous roots, popup exclusion and exact-send targeting passed');
  }).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>app.exit(process.exitCode||0));
}

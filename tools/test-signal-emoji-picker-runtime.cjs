const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  const child = spawn(require('electron'), [__filename, ...process.argv.slice(2)], {cwd:root, env, windowsHide:true, stdio:'inherit'});
  const timeout = setTimeout(() => {child.kill();process.exitCode=1;}, 60000);
  child.on('error', error => {clearTimeout(timeout);console.error(error);process.exitCode=1;});
  child.on('exit', code => {clearTimeout(timeout);process.exitCode=code ?? 1;});
} else {
  const {app, BrowserWindow} = require('electron');
  const ts = require('typescript');
  const {pathToFileURL} = require('node:url');
  const baseline = process.argv.includes('--baseline');
  app.setPath('userData', path.join(root, '.tmp/signal-emoji-picker-test'));
  const source = baseline
    ? spawnSync('git', ['show','HEAD:src/App.vue'], {cwd:root,encoding:'utf8',windowsHide:true}).stdout
    : fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  const codeStart = source.indexOf('function buildEnterTranslateScript()');
  const codeEnd = source.indexOf('\nfunction ',codeStart+10);
  assert.ok(codeStart>=0 && codeEnd>codeStart);
  const recovery = new Function('exports', ts.transpileModule(fs.readFileSync(path.join(root,'src/signal-emoji-picker-runtime.ts'),'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText + ';return exports;')({});
  app.whenReady().then(async()=>{
    const shared=await import(pathToFileURL(path.join(root,'dist-electron/shared.js')).href);
    const build=new Function('buildComposerPlainTextReaderSource','buildDirectSendHttpUrlSource','buildSignalEmojiPickerScript',
      ts.transpileModule(source.slice(codeStart,codeEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return buildEnterTranslateScript;'
    )(()=>`const readComposerPlainText=(${shared.readComposerPlainTextFromDom.toString()});`,()=>`const isDirectSendHttpUrl=(${shared.isDirectSendHttpUrl.toString()});`,recovery.buildSignalEmojiPickerScript);
    const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
    const execute=code=>win.webContents.executeJavaScript(code,true);
    await win.loadURL('data:text/html,<!doctype html><html><body></body></html>');
    await execute(`
      document.head.insertAdjacentHTML('beforeend','<style>body{margin:0}.CompositionArea{position:absolute;bottom:20px;left:20px;width:700px}.module-composition-input__input{width:600px;min-height:45px;border:1px solid}button,input{min-width:80px;min-height:30px}.FunPopover{position:absolute;top:100px;left:20px;width:300px;height:240px;background:#ddd}</style>');
      document.body.innerHTML='<main id="outside" style="width:900px;height:100px">Outside</main><footer class="CompositionArea" data-df-signal-conversation-id="11111111-1111-4111-8111-111111111111"><div class="module-composition-input__input" contenteditable="true" role="textbox" aria-label="Message"></div><button id="trigger" aria-haspopup="dialog" aria-controls="picker-dialog" aria-expanded="false">Emoji</button><button class="CompositionArea__send-button" aria-label="Send message">Send</button></footer>';
      window.__test={nativeSends:0,searchEnters:0,emojiEnters:0,toggles:0};
      window.__draft=document.querySelector('[contenteditable]');
      window.__closePicker=()=>{document.querySelector('.FunPopover')?.remove();document.querySelector('#trigger').setAttribute('aria-expanded','false');window.__draft.focus();};
      window.__openPicker=()=>{
        window.__closePicker();
        document.querySelector('#trigger').setAttribute('aria-expanded','true');
        document.body.insertAdjacentHTML('beforeend','<div class="FunPopover" data-fun-overlay id="picker"><div class="FunPopover__Dialog" role="dialog" id="picker-dialog"><input id="search" type="search" aria-label="Search emojis"><button id="emoji" aria-label="Send a smile">🙂</button><div data-fun-overlay id="skin-tone">Skin tones</div></div></div>');
        document.querySelector('#search').focus();
      };
      document.querySelector('#trigger').onclick=()=>{window.__test.toggles++;if(document.querySelector('.FunPopover'))window.__closePicker();else window.__openPicker();};
      document.addEventListener('keydown',event=>{
        if(event.target?.id==='search'&&event.key==='Enter')window.__test.searchEnters++;
        if(event.target?.id==='emoji'&&event.key==='Enter'){window.__test.emojiEnters++;window.__closePicker();}
        if(event.target===window.__draft&&event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing&&!event.defaultPrevented)window.__test.nativeSends++;
      });
      window.__key=(element,key='Enter',options={})=>element.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
      window.__reset=(text='你好🙂',review=false)=>{
        window.__closePicker();window.__draft.textContent=text;window.__draft.focus();
        for(const key of Object.keys(window.__draft.dataset))delete window.__draft.dataset[key];
        window.__dfComposerReviewEnabled=review;window.__dfTranslatorQueue=[];
        delete window.__dfSignalComposerReady;delete window.__dfTranslatorLastSendAt;
        window.__test={nativeSends:0,searchEnters:0,emojiEnters:0,toggles:0};window.__openPicker();
      };
      true;
    `);
    await execute(build());
    const tick=()=>new Promise(resolve=>setTimeout(resolve,35));
    const state=()=>execute(`({ ...window.__test,open:Boolean(document.querySelector('.FunPopover')),draft:window.__draft.textContent,actions:(window.__dfTranslatorQueue||[]).map(item=>item.action),ready:window.__draft.dataset.dfTranslatedReady })`);
    await execute(`window.__reset();window.__key(document.querySelector('#search'));true;`);
    let result=await state();
    if(baseline){
      assert.equal(result.searchEnters,0,'baseline should reproduce a picker Enter swallowed by the composer guard');
      assert.ok(result.actions.includes('translate'),'baseline incorrectly translates the underlying draft');
      console.log('REPRODUCED baseline: emoji-search Enter swallowed; underlying Chinese draft translated instead.');
      win.destroy();return;
    }
    assert.equal(result.searchEnters,1,'search Enter belongs to the native picker');
    assert.equal(result.draft,'你好🙂');assert.ok(!result.actions.includes('translate'));
    await execute(`window.__draft.dataset.dfTranslatedReady='Approved draft';document.querySelector('#search').dispatchEvent(new InputEvent('input',{bubbles:true,data:'smile'}));document.querySelector('#search').dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertParagraph'}));true;`);
    assert.equal((await state()).ready,'Approved draft','search editing must not invalidate an approved chat draft');
    await execute(`document.querySelector('#emoji').focus();window.__key(document.querySelector('#emoji'));true;`);
    await tick();result=await state();assert.equal(result.emojiEnters,1);assert.equal(result.open,false);assert.equal(result.nativeSends,0);
    await execute(`window.__reset('🙂');document.querySelector('#emoji').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));true;`);
    await tick();result=await state();assert.equal(result.open,true);assert.equal(result.toggles,0,'interacting inside the picker must not close it');
    await execute(`document.querySelector('#skin-tone').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));true;`);
    await tick();assert.equal((await state()).open,true,'nested fun overlays must remain usable');
    for(const zoom of [0.8,1,1.25]) {
      win.webContents.setZoomFactor(zoom);
      await execute(`window.__reset('🙂');window.__draft.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));true;`);
      await tick();result=await state();assert.equal(result.open,false,`composer outside-click closes picker at zoom ${zoom}`);assert.equal(result.nativeSends,0);assert.equal(result.toggles,1);
    }
    await execute(`window.__reset('🙂');document.querySelector('#outside').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));window.__closePicker();true;`);
    await tick();result=await state();assert.equal(result.open,false);assert.equal(result.toggles,0,'normal native dismissal must not be toggled back open');
    await execute(`window.__reset('🙂');window.__draft.focus();window.__key(window.__draft);true;`);
    await tick();result=await state();assert.equal(result.open,false);assert.equal(result.nativeSends,1,'emoji-only Enter still follows native sending once');
    await execute(`window.__reset('你好🙂');window.__draft.style.pointerEvents='none';window.__draft.focus();window.__key(window.__draft);true;`);
    await tick();result=await state();assert.equal(result.open,false);assert.equal(result.nativeSends,0);assert.equal(result.actions.filter(a=>a==='translate').length,1,'Chinese text must still enter translation once');
    await execute(`window.__draft.style.pointerEvents='';true;`);
    await execute(`window.__reset('Approved 🙂');document.querySelector('#trigger').setAttribute('aria-label','Send an emoji');window.__draft.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));true;`);
    await tick();result=await state();assert.equal(result.open,false);assert.equal(result.toggles,1,'localized picker trigger labels must not be treated as text-send buttons');
    await execute(`window.__reset('1234567890123456');window.__draft.focus();window.__key(window.__draft);true;`);
    await tick();result=await state();assert.equal(result.open,false);assert.equal(result.nativeSends,0);assert.ok(result.actions.includes('sensitive-prepare'),'closing a picker must not bypass sensitive-send review');
    await execute(`window.__reset('Approved 🙂');window.__draft.dataset.dfTranslatedReady='Approved 🙂';window.__draft.dataset.dfTranslatorReadyRequestId='test-approved';window.__draft.focus();window.__key(window.__draft);true;`);
    await tick();result=await state();assert.equal(result.open,false);assert.equal(result.nativeSends,0);assert.equal(result.actions.filter(a=>a==='send').length,1,'approved text keeps the authorized-send path');
    for(const options of [{shiftKey:true},{isComposing:true,keyCode:229}]){
      await execute(`window.__reset('🙂');window.__draft.focus();window.__key(window.__draft,'Enter',${JSON.stringify(options)});true;`);
      await tick();result=await state();assert.equal(result.open,true);assert.equal(result.nativeSends,0);
    }
    await execute(`window.__reset('🙂');window.__key(document.querySelector('#search'),'Escape');true;`);
    await tick();assert.equal((await state()).open,false);
    await execute(`window.__reset('🙂');document.querySelector('#outside').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.querySelector('.CompositionArea').setAttribute('data-df-signal-conversation-id','22222222-2222-4222-8222-222222222222');true;`);
    await tick();assert.equal((await state()).toggles,0,'deferred close must not act after a conversation switch');
    await execute(recovery.buildSignalEmojiPickerScript());
    await execute(build());
    await execute(`window.__reset('🙂');window.__draft.focus();window.__key(window.__draft);true;`);
    await tick();result=await state();assert.equal(result.nativeSends,1);assert.equal(result.toggles,1,'repeated installation must not duplicate native clicks');
    win.destroy();
    console.log('signal-emoji-picker-runtime: picker keyboard/input scope, outside close, native close, zoom, Enter, IME, Shift, sensitive and approved-send guards, conversation switch and reinjection passed');
  }).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>app.exit(process.exitCode||0));
}

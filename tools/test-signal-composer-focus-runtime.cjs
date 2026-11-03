const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 const child=spawn(require('electron'),[__filename,...process.argv.slice(2)],{cwd:root,env,windowsHide:true,stdio:'inherit'});
 const timeout=setTimeout(()=>{child.kill();process.exitCode=1;},60000);
 child.on('error',e=>{clearTimeout(timeout);console.error(e);process.exitCode=1;});child.on('exit',code=>{clearTimeout(timeout);process.exitCode=code??1;});
}else{
 const {app,BrowserWindow}=require('electron'),ts=require('typescript'),{pathToFileURL}=require('node:url');
 const baseline=process.argv.includes('--baseline');
 app.setPath('userData',fs.mkdtempSync(path.join(root,'.tmp','signal-focus-')));
 app.whenReady().then(async()=>{
  const shared=await import(pathToFileURL(path.join(root,'dist-electron/shared.js')).href);
  const source=baseline?spawnSync('git',['show','HEAD:src/App.vue'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout:fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
  const ast=ts.createSourceFile('App.ts',source.slice(source.indexOf('>')+1,source.indexOf('</script>')),ts.ScriptTarget.Latest,true);
  const names=['buildComposerPlainTextReaderSource','buildMediaCaptionComposerSource','isMediaCaptionComposerFromDom','buildDirectSendHttpUrlSource','buildInjectedComposerScript','buildEnterTranslateScript'];
  const declarations=names.map(name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node,name);return node.getText(ast);}).join('\n');
  const factory=ts.transpileModule(declarations,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const recovery=new Function('exports',ts.transpileModule(fs.readFileSync(path.join(root,'src/signal-emoji-picker-runtime.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText+';return exports;')({});
  const helpers=new Function('activeTheme','readComposerPlainTextFromDom','isDirectSendHttpUrl','readTelegramConversationIdFromDom','buildSignalEmojiPickerScript',factory+';return {buildInjectedComposerScript,buildEnterTranslateScript};')({value:'blackGold'},shared.readComposerPlainTextFromDom,shared.isDirectSendHttpUrl,shared.readTelegramConversationIdFromDom,recovery.buildSignalEmojiPickerScript);
  const build=helpers.buildInjectedComposerScript;
  const win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
  const execute=code=>win.webContents.executeJavaScript(code,true);
  async function fixture(text){
   await win.loadURL('data:text/html,<!doctype html><html><body></body></html>');
   await execute(`document.head.innerHTML='<style>body{margin:0;font:16px monospace}.CompositionArea{position:absolute;bottom:30px;left:200px;width:700px}.CompositionArea__row{display:flex}.module-composition-input__input{width:580px}.module-composition-input__input__scroller{padding:16px 10px 45px;border:1px solid #777}.ql-editor{min-height:30px;outline:none;white-space:pre-wrap}.ql-editor p{margin:0}button{min-height:30px}</style>';document.body.innerHTML='<button id="outside">Another contact</button><div class="CompositionArea" data-df-signal-conversation-id="11111111-1111-4111-8111-111111111111"><div class="CompositionArea__row"><div class="module-composition-input__input" data-testid="CompositionInput" data-enabled="true"><div class="module-composition-input__input__scroller"><div class="module-composition-input__quill ql-container"><div id="editor" class="ql-editor" contenteditable="true" role="textbox" aria-multiline="true"><p></p></div></div></div></div><div class="CompositionArea__button-cell"><button id="send" aria-label="Send message">Send</button><button id="emoji" aria-haspopup="dialog" aria-label="Send an emoji">Emoji</button></div></div></div>';
    window.editor=document.querySelector('#editor');editor.firstChild.textContent=${JSON.stringify(text)};window.nativeEvents={down:0,click:0,send:0,emoji:0};
    const scroller=document.querySelector('.module-composition-input__input__scroller');scroller.addEventListener('mousedown',()=>nativeEvents.down++);scroller.addEventListener('click',()=>{nativeEvents.click++;editor.focus();});
    document.querySelector('#send').onclick=()=>nativeEvents.send++;document.querySelector('#emoji').onclick=()=>nativeEvents.emoji++;
    window.resetCaret=()=>{editor.focus();const range=document.createRange();range.selectNodeContents(editor);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);};window.resetCaret();true;`);
   await execute(build('install'));
   await execute(helpers.buildEnterTranslateScript());
  }
  const gesture=async(selector,position='middle')=>execute(`(()=>{const target=document.querySelector(${JSON.stringify(selector)}),rect=target.getBoundingClientRect(),editorRect=editor.getBoundingClientRect();const x=${position==='right'?'editorRect.right-3':'rect.left+rect.width/2'},y=rect.top+rect.height/2;const result={};for(const type of ['pointerdown','mousedown','pointerup','mouseup','click']){const event=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});target.dispatchEvent(event);result[type]=event.defaultPrevented;}return {...result,native:{...nativeEvents},active:document.activeElement===editor};})()`);
  async function checkNativeClipboard(){
   const signalRoot=path.join(root,'.tmp/signal-source/v8.18.0/Signal-Desktop-8.18.0');
   const quillPath=require.resolve('@signalapp/quill-cjs',{paths:[signalRoot]});
   const {rolldown}=await import('rolldown');const bundle=await rolldown({input:quillPath,platform:'browser'});
   const generated=await bundle.generate({format:'iife',name:'FixtureQuill'});await bundle.close();
   const clipboardSource=fs.readFileSync(path.join(signalRoot,'ts/quill/signal-clipboard/index.dom.ts'),'utf8');
   const clipboardTree=ts.createSourceFile('clipboard.ts',clipboardSource,ts.ScriptTarget.Latest,true);
   const clipboardMethod=clipboardTree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='SignalClipboard').members.find(n=>n.name?.getText(clipboardTree)==='onCapturePaste').getText(clipboardTree);
   const nativePaste=ts.transpileModule('class NativeClipboardFixture {'+clipboardMethod+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
   await fixture('');await execute(generated.output.find(item=>item.type==='chunk').code);
   await execute(`(()=>{const Quill=FixtureQuill.default?.default||FixtureQuill.default||FixtureQuill;const Delta=Quill.import('delta');const insertEmojiOps=ops=>ops;${nativePaste};const container=document.querySelector('.module-composition-input__quill');container.innerHTML='';window.quill=new Quill(container,{modules:{toolbar:false,clipboard:{disableDefaultListeners:true}}});window.editor=quill.root;editor.id='editor';quill.setText('please send the address');quill.setSelection(7,0);editor.classList.add('ql-editor--loaded');const clipboard=Object.assign(new NativeClipboardFixture(),{quill,options:{isDisabled:false}});editor.addEventListener('paste',event=>clipboard.onCapturePaste(event));return true;})()`);
   await execute(build('install'));
   await execute(helpers.buildEnterTranslateScript());
   const caretPoint=await execute(`(()=>{const text=editor.firstChild.firstChild,range=document.createRange();range.setStart(text,18);range.setEnd(text,19);const rect=range.getBoundingClientRect();return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};})()`);
   win.webContents.sendInputEvent({type:'mouseDown',...caretPoint,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...caretPoint,button:'left',clickCount:1});
   await new Promise(resolve=>setTimeout(resolve,30));
   const selected=await execute('quill.getSelection()?.index');
   if(baseline)assert.equal(selected,7,'a swallowed real mouse click leaves Quill at the old insertion point');
   else assert.ok(selected>=18&&selected<=19,'a real mouse click immediately places the Quill caret at the clicked text: '+selected);
   const paste=async text=>{await execute(`(()=>{const data=new DataTransfer();data.setData('text/plain',${JSON.stringify(text)});editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));return true;})()`);await new Promise(resolve=>setTimeout(resolve,30));};
   await paste('PASTE_ONE');assert.equal(await execute('quill.getText().includes("PASTE_ONE")'),true,'native paste updates the current editor without a contact switch');
   assert.equal(await execute('editor.textContent.includes("PASTE_ONE")'),true,'native editor DOM displays the paste immediately');
   await execute(`quill.setSelection(quill.getLength()-1,0);true;`);await paste('PASTE_TWO');
   assert.equal(await execute('editor.textContent.match(/PASTE_TWO/g)?.length'),1,'paste is handled once');
   console.log('native Signal Quill/clipboard check: both editor model and DOM update without switching contacts; delayed rendering was not reproduced in this isolated case.');
  }
  await fixture('please send the address');let result=await gesture('.ql-editor p');
  if(baseline){
   assert.equal(result.mousedown,true);assert.equal(result.click,true);assert.equal(result.native.down,0);assert.equal(result.native.click,0);
   console.log('REPRODUCED existing Signal guard: clicking draft text containing "send" cancels mouse-down and click before the native editor receives them.');
   await fixture('ordinary draft');result=await gesture('.ql-editor','right');assert.equal(result.mousedown,true);assert.equal(result.native.down,0);
   console.log('REPRODUCED existing Signal guard: the editor\'s rightmost 8 px is classified as the send-button zone and cancels native caret placement.');
   await fixture('ordinary draft');result=await gesture('.module-composition-input__input__scroller');assert.equal(result.click,false);assert.equal(result.native.click,1);
   await fixture('US A');result=await gesture('.ql-editor p');assert.equal(result.mousedown,false);assert.equal(result.click,false,'US A itself is not a blocked keyword');
   result=await gesture('.ql-editor','right');assert.equal(result.mousedown,true);assert.equal(result.click,true);assert.equal(result.native.click,1,'the edge click is blocked regardless of the US A text');
   console.log('REPRODUCED US A: old code allows the input middle but blocks the right edge; the word itself is not a click-blocking keyword.');
   console.log('Control case: the ordinary middle of the input still reaches native editing. These tests verify swallowed clicks; they do not establish the cause of delayed paste rendering.');
   if(process.argv.includes('--with-native-quill'))await checkNativeClipboard();
   win.destroy();return;
  }
  for(const text of ['please send the address','ordinary draft','sender ID','US A','USA','未翻译的中文']){
   for(const [selector,position] of [['.ql-editor p','middle'],['.ql-editor','right'],['.module-composition-input__input__scroller','middle']]){
    await fixture(text);result=await gesture(selector,position);assert.equal(result.mousedown,false,text+' '+selector+' mousedown');assert.equal(result.click,false,text+' '+selector+' click');assert.equal(result.native.down,1);assert.equal(result.native.click,1,'native editor click must run synchronously');
   }
  }
  await fixture('ordinary draft');result=await gesture('#send');assert.equal(result.click,true);assert.equal(result.native.send,0,'the actual send button remains guarded');
  result=await gesture('#emoji');assert.equal(result.click,false);assert.equal(result.native.emoji,1,'an emoji picker trigger must keep its native click');
  await fixture('please send the address');await execute(build('install'));result=await gesture('.ql-editor p');assert.equal(result.native.click,1,'reinstallation keeps direct editor clicks usable');
  await fixture('US A');const enter=await execute(`(()=>{window.__dfComposerReviewEnabled=true;window.__dfTranslatorQueue=[];const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});editor.dispatchEvent(event);return {blocked:event.defaultPrevented,actions:window.__dfTranslatorQueue.map(item=>item.action)};})()`);
  assert.equal(enter.blocked,true);assert.ok(enter.actions.includes('translate'),'US A Enter keeps the ordinary English backtranslation review, independently of manual mouse clicks');
  console.log('US A/USA: direct input clicks and edges allowed; English Enter review still works.');
  if(process.argv.includes('--with-native-quill'))await checkNativeClipboard();
  win.destroy();console.log('signal-composer-focus-runtime: draft text, edge/padding clicks, synchronous native editor handling, send protection, picker clicks and reinjection passed');
 }).catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>app.exit(process.exitCode||0));
}

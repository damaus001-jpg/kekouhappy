const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
  const child = spawn(require('electron'), [__filename], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  const timeout = setTimeout(() => { child.kill(); process.exitCode = 1; }, 90_000);
  child.on('error', error => { clearTimeout(timeout); console.error(error); process.exitCode = 1; });
  child.on('exit', code => { clearTimeout(timeout); process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const ts = require('typescript');
  app.setPath('userData', path.join(root, '.tmp', 'apple-runtime-test'));
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    const runtimeCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/apple-runtime.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const { buildAppleScript } = new Function('exports', runtimeCode + ';return exports;')({});
    const shared = await import('../dist-electron/shared.js');
    const loadTs=(relative,modules={})=>new Function('exports','require',ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText+';return exports;')({},name=>{assert.ok(name in modules,name);return modules[name];});
    const exportDates=await import('../dist-electron/conversation-export-dates.js');
    const {buildConversationExportScript,unwrapConversationExportResult,mergeConversationExportRows}=loadTs('src/conversation-export-runtime.ts',{'../electron/shared':shared,'../electron/conversation-export-dates':exportDates});
    const {buildAssistantRuntimeScript}=loadTs('src/assistant-material-runtime.ts',{'../electron/assistant-material-identity':await import('../dist-electron/assistant-material-identity.js')});
    const {renderConversationExport}=await import('../dist-electron/conversation-export-core.js');
    const mainSource = fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8');
    const mainAst = ts.createSourceFile('main.ts', mainSource, ts.ScriptTarget.Latest, true);
    const authorizationCode = ['canonicalSendText', 'registerApprovedComposerTranslation', 'authorizeTranslatedSend'].map(name => mainAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(mainAst)).join('\n');
    const authorization = new Function('createHash', 'const approvedComposerTranslations=new Map(),approvedComposerTranslationTtlMs=120000;\n' + ts.transpileModule(authorizationCode, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + ';return {registerApprovedComposerTranslation,authorizeTranslatedSend};')(require('node:crypto').createHash);
    authorization.registerApprovedComposerTranslation({profileId:'apple-profile',platform:'apple',reason:'composer-enter',text:'中文草稿',contactId:'apple:device-a:chat-a'},'apple-proof','Reviewed English');
    const sendProof={profileId:'apple-profile',platform:'apple',requestId:'apple-proof',text:'Reviewed English',conversationSignature:'apple:device-a:chat-a'};
    for(const changed of [{profileId:'other-profile'},{platform:'opensms'},{conversationSignature:'apple:device-b:chat-a'},{text:'Different English'}])assert.equal(authorization.authorizeTranslatedSend({...sendProof,...changed}).ok,false);
    assert.equal(authorization.authorizeTranslatedSend(sendProof).ok,true,'Apple sends require the main-process translation proof');
    assert.equal(authorization.authorizeTranslatedSend(sendProof).ok,false,'the proof is single use');
    const source = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
    const ast = ts.createSourceFile('App.ts', source.slice(source.indexOf('>') + 1, source.indexOf('</script>')), ts.ScriptTarget.Latest, true);
    const names = ['buildComposerPlainTextReaderSource', 'buildMediaCaptionComposerSource', 'isMediaCaptionComposerFromDom', 'buildDirectSendHttpUrlSource', 'buildComposerScript', 'buildInjectedComposerScript', 'buildNativeComposerHelpersScript', 'buildNativeComposerTextScript', 'buildNativeComposerFocusScript', 'buildComposerRequestMatchScript', 'buildMessageScanScript', 'buildMessageTranslationInjectScript', 'buildCachedTranslationRuntimeScript', 'buildUnreadScanScript'];
    const functionCode = names.map(name => { const item = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name); assert.ok(item, name); return item.getText(ast); }).join('\n');
    const helpers = new Function('activeTheme', 'readComposerPlainTextFromDom', 'isDirectSendHttpUrl', 'readTelegramConversationIdFromDom', 'buildAppleScript', ts.transpileModule(functionCode, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + `;return {${names.join(',')}};`)({ value: 'blackGold' }, shared.readComposerPlainTextFromDom, shared.isDirectSendHttpUrl, shared.readTelegramConversationIdFromDom, buildAppleScript);
    const fixture = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font-family:sans-serif}aside{width:180px;float:left}.reading{margin-left:200px}#messages{height:360px;overflow:auto}.message{margin:12px;padding:8px}.bubble{padding:12px;background:#e5e7eb}.outgoing .bubble{background:#a3e5b9}#reply-zh{width:600px;height:60px}#reply-box{padding:16px}</style></head><body>
      <aside><div class="message"><div class="bubble"><div class="original">Outside right chat</div></div></div><textarea id="profile-paste">Profile input</textarea><button id="other-action">Other action</button></aside>
      <section class="reading"><strong id="peer-phone">+12135551212</strong><div id="messages"></div><section id="reply-box"><textarea id="reply-zh"></textarea><button id="send-reply" disabled>确认发送</button></section></section>
      <script>
        let workspaceDevice='device-a',workspaceRevision=1,currentConversationId='chat-a',currentConversation={id:'chat-a',phone_number:'+12135551212',contact:'Fixture'};
        let workspaceBusy=false,sendBlocked=false,controlOwner='device-a';
        window.nativeCalls=[];window.nativeDelay=120;window.nativeFailure=false;
        const draftEl=document.querySelector('#reply-zh'),sendButton=document.querySelector('#send-reply');
        const updateControls=()=>{draftEl.disabled=workspaceBusy;sendButton.disabled=workspaceBusy||sendBlocked||!draftEl.value.trim();};
        const renderRows=(count=4)=>{currentConversation.messages=Array.from({length:count},(_,index)=>({side:index%2?'outgoing':'incoming',time:'2026-11-02 10:00',text:'English message '+index,kind:'text'}));document.querySelector('#messages').innerHTML=currentConversation.messages.map((message,index)=>'<div class="message '+message.side+'" data-message-id="'+index+'"><div class="message-meta">对方 · '+message.time+'</div><div class="bubble"><div class="original">'+message.text+'</div></div></div>').join('');};
        const nativeSubmit=()=>{if(workspaceBusy||sendBlocked||!draftEl.value.trim()||!currentConversation)return;const text=draftEl.value,revision=workspaceRevision;workspaceBusy=true;updateControls();window.nativeCalls.push({text,device:workspaceDevice,conversation:currentConversationId});setTimeout(()=>{workspaceBusy=false;if(revision!==workspaceRevision)return;if(window.nativeFailure){sendBlocked=true;updateControls();return;}draftEl.value='';updateControls();},window.nativeDelay);};
        draftEl.addEventListener('input',updateControls);
        draftEl.addEventListener('keydown',event=>{if(event.key!=='Enter'||event.shiftKey||event.isComposing||event.keyCode===229)return;event.preventDefault();if(!event.repeat)nativeSubmit();});
        sendButton.addEventListener('click',nativeSubmit);
        window.changeConversation=(device='device-a',id='chat-a',phone='+12135551212')=>{workspaceDevice=device;controlOwner=device;workspaceRevision++;currentConversationId=id;currentConversation={id,phone_number:phone,contact:'Fixture'};workspaceBusy=false;sendBlocked=false;draftEl.value='';document.querySelector('#peer-phone').textContent=phone;renderRows();updateControls();};
        window.reloadRows=renderRows;renderRows();
      </script></body></html>`;
    const win = new BrowserWindow({ show: false, width: 1200, height: 850, webPreferences: { preload: path.join(root, 'electron/webview-send-guard-preload.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false } });
    await win.webContents.session.protocol.handle('http', () => new Response(fixture, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
    await win.loadURL('http://127.0.0.1:8070/');
    const execute = script => win.webContents.executeJavaScript(script, true);
    const cmd = value => execute(buildAppleScript(value));
    const events = () => execute(`(()=>{const events=window.__dfTranslatorQueue||[];window.__dfTranslatorQueue=[];return events;})()`);
    const type = text => execute(`(()=>{const input=document.querySelector('#reply-zh');input.value=${JSON.stringify(text)};input.focus();input.dispatchEvent(new InputEvent('input',{bubbles:true,data:${JSON.stringify(text)}}));return true;})()`);
    const enter = (options = {}) => execute(`(()=>{const event=new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...${JSON.stringify(options)}});document.querySelector('#reply-zh').dispatchEvent(event);return event.defaultPrevented;})()`);
    const clickSend = () => execute(`document.querySelector('#send-reply').click();true`);
    const nativeCount = () => execute('window.nativeCalls.length');
    const change = async (device = 'device-a', id = 'chat-a') => { await execute(`window.changeConversation(${JSON.stringify(device)},${JSON.stringify(id)});true`); await cmd({ action: 'bootstrap' }); await events(); };
    const requestTranslation = async text => { await type(text); await events(); assert.equal(await enter(), true); const request = (await events()).find(event => event.action === 'translate'); assert.ok(request, 'Chinese Enter must enqueue a translation request'); return request; };
    const finishTranslation = async (request, text = 'Translated English draft') => {
      assert.equal(await execute(helpers.buildComposerRequestMatchScript(request.requestId)), true);
      const written = await execute(helpers.buildComposerScript('write', text, true, false, 'default', request.requestId)); assert.equal(written.ok, true);
      assert.equal(await execute(helpers.buildInjectedComposerScript('state', { translated: text, requestId: request.requestId, conversationSignature: request.conversationSignature })), true);
      return text;
    };
    const sendTranslated = (text, signature) => execute(helpers.buildComposerScript('send', text, true, false, 'default', '', { platform: 'apple', conversationSignature: signature }));

    // The production preload blocks native submission before the page guard is installed.
    await type('启动中文'); await enter(); await clickSend(); assert.equal(await nativeCount(), 0);
    await cmd({ action: 'install' }); await cmd({ action: 'enabled', enabled: true }); await events();
    assert.equal(await execute(`document.documentElement.dataset.dfAppleGuard`), '2026-11-02-apple-v2');
    const scanned = await execute(helpers.buildMessageScanScript('apple', { limit: 20, includeAlreadyTranslated: true }));
    assert.equal(scanned.length, 4); assert.ok(scanned.every(item => item.contactId.startsWith('apple:device-a:chat-a:')));
    assert.ok(scanned.every(item => item.text.startsWith('English message')), 'only right-side message originals are scanned');
    assert.equal((await execute(helpers.buildUnreadScanScript('apple'))).count, 0);
    assert.equal(await execute(helpers.buildMessageTranslationInjectScript(scanned[0].key, '气泡译文', 'apple', scanned[0].text)), true);
    assert.equal(await execute(`document.querySelector('#messages .df-chat-translation').textContent`), '气泡译文');
    assert.equal(await execute(`document.querySelector('aside .df-chat-translation')===null`), true);
    await execute(helpers.buildCachedTranslationRuntimeScript('apple', [{ sourceText: scanned[1].text, translatedText: '缓存译文', contactId: scanned[1].contactId }]));
    await execute(`window.reloadRows();true`); await pause(300);
    assert.equal(await execute(`document.querySelectorAll('#messages .df-chat-translation').length`), 2, 'rerendering restores cached translations once per bubble');
    const originalText = await execute(`document.querySelector('#messages .original').textContent`);
    assert.equal(originalText, 'English message 0', 'translations preserve the original text');
    await execute(`document.querySelector('#messages .original').textContent='An updated English message';true`); await pause(300);
    assert.equal(await execute(`document.querySelector('#messages .message').querySelector('.df-chat-translation')===null`), true, 'updating an original removes its previous translation');

    let request = await requestTranslation('你好，今天怎么样？');
    await clickSend(); assert.equal((await events()).filter(event => event.action === 'translate').length, 0, 'repeat click must not duplicate an in-flight translation');
    assert.equal(await nativeCount(), 0);
    const translated = await finishTranslation(request);
    assert.equal(await execute(`document.querySelector('#reply-zh').value`), translated);
    await enter(); const sendEvent = (await events()).find(event => event.action === 'send'); assert.equal(sendEvent.requestId, request.requestId);
    const sent = await sendTranslated(translated, request.conversationSignature); assert.equal(sent.ok, true); assert.equal(await nativeCount(), 1);
    assert.equal(await execute('window.nativeCalls[0].text'), translated, 'the native workspace receives the reviewed English text once');

    request = await requestTranslation('旧草稿'); await type('修改后的草稿');
    assert.equal((await execute(helpers.buildComposerScript('write', 'Stale translated text', true, false, 'default', request.requestId))).ok, false, 'editing invalidates a translation');
    request = await requestTranslation('换手机前的草稿'); await change('device-b');
    assert.equal(await execute(helpers.buildComposerRequestMatchScript(request.requestId)), false, 'device identity separates identical conversation IDs and phone numbers');
    assert.equal((await execute(helpers.buildComposerScript('write', 'Wrong device', true, false, 'default', request.requestId))).ok, false);
    assert.equal(await execute(helpers.buildMessageTranslationInjectScript(scanned[0].key, '错误会话译文', 'apple', scanned[0].text)), false);
    assert.equal(await execute(`document.querySelectorAll('#messages .df-chat-translation').length`), 0, 'cached translations from another device are not applied');
    request = await requestTranslation('刷新前的草稿'); await change('device-b');
    assert.equal(await execute(helpers.buildComposerRequestMatchScript(request.requestId)), false, 'reloading the same conversation also invalidates stale writes');

    await type('输入法候选'); await events(); await enter({ isComposing: true }); await enter({ keyCode: 229 });
    await execute(`document.querySelector('#reply-zh').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));true`); await enter();
    await execute(`document.querySelector('#reply-zh').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));true`);
    await enter({ ctrlKey: true }); await enter({ metaKey: true }); await enter({ repeat: true }); await enter({ shiftKey: true });
    assert.equal((await events()).filter(event => event.action === 'translate').length, 0, 'IME, modified keys and repeats cannot submit');
    assert.equal(await nativeCount(), 1);
    await cmd({ action: 'enabled', enabled: false }); await type('Manual English'); await enter(); await clickSend();
    assert.equal(await nativeCount(), 1, 'locking or deactivating the profile blocks native sends');
    await cmd({ action: 'enabled', enabled: true }); await type('Manual English'); await enter(); await pause(220);
    assert.equal(await nativeCount(), 2, 'reviewed manual English retains the native workspace send path');

    await type('1234567890'); await events(); await enter();
    const sensitiveRequest = (await events()).find(event => event.action === 'sensitive-prepare'); assert.ok(sensitiveRequest); assert.equal(await nativeCount(), 2);
    await cmd({ action: 'state', state: { sensitiveToken: 'trusted-confirmation', sensitiveText: '1234567890', conversationSignature: sensitiveRequest.conversationSignature } });
    await enter(); const approved = (await events()).find(event => event.action === 'sensitive-send'); assert.equal(approved.requestId, 'trusted-confirmation');
    const exact = await execute(helpers.buildComposerScript('sendExact', '1234567890', true, false, 'default', '', { platform: 'apple', conversationSignature: sensitiveRequest.conversationSignature }));
    assert.equal(exact.ok, true); assert.equal(await nativeCount(), 3);

    request = await requestTranslation('等待手机核验'); const nextText = await finishTranslation(request, 'Waiting for phone verification');
    await enter(); await events(); await execute(`window.nativeDelay=1000;true`);
    const sending = sendTranslated(nextText, request.conversationSignature); await pause(180); await enter(); await clickSend();
    assert.equal((await sending).ok, true); assert.equal(await nativeCount(), 4, 'asynchronous phone processing must never cause duplicate sends');
    await execute(`window.nativeDelay=120;window.nativeFailure=true;true`);
    request = await requestTranslation('发送结果待核对'); const failedText = await finishTranslation(request, 'Please verify the phone result'); await enter(); await events();
    const uncertain = await sendTranslated(failedText, request.conversationSignature);
    assert.equal(uncertain.ok, false); assert.equal(uncertain.submitted, true); await enter(); await clickSend();
    assert.equal(await nativeCount(), 5, 'an unconfirmed phone result cannot be retried automatically');

    await change();await cmd({action:'enabled',enabled:true});
    const config={platform:'apple',catalog:{persona:[],schedule:[],quotes:[]},colors:{},icon:'',usages:[],enabled:true,showButton:false};
    const material=value=>execute(buildAssistantRuntimeScript(value));
    await material({command:'install',config});const contact=await material({command:'contact'});assert.equal(contact.phone,'+12135551212');assert.ok(contact.id.startsWith('apple:device-a:chat-a:'));
    const pending={id:'fixture:text',type:'text',text:'素材文字',token:'fixture-token',expiresAt:Date.now()+60000};
    await type('Existing draft ');await material({command:'confirm',pending,contactId:contact.id,cardTitle:'Apple card'});
    await execute(`(()=>{const shadow=document.querySelector('#df-material-root').shadowRoot;shadow.querySelector('.dialog textarea').value='US A 素材';shadow.querySelector('.dialog .primary').click();return true;})()`);await pause(20);
    let confirmation=await material({command:'confirmation-status',token:pending.token});assert.equal(confirmation.status,'inserted');assert.equal(confirmation.contactId,contact.id);assert.equal(confirmation.actualText,'US A 素材');assert.equal(await execute(`document.querySelector('#reply-zh').value`),'Existing draft US A 素材');assert.equal(await nativeCount(),5,'using a material fills the native draft without sending');
    await material({command:'usages',usages:[{profileId:'android-profile',platform:'opensms',phone:contact.phone,contactId:'sms:android-profile:chat-z',materialId:pending.id,usedAt:'now',confirmation:'inserted'}]});
    await material({command:'confirm',pending:{...pending,token:'duplicate'},contactId:contact.id});assert.ok(await execute(`document.querySelector('#df-material-root').shadowRoot.querySelector('.duplicate-warning')?.textContent.includes('手机号')`),'duplicate warnings follow the confirmed Apple phone across devices');
    await change('device-b','chat-b');await pause(240);assert.equal((await material({command:'confirmation-status',token:'duplicate'})).status,'cancelled','switching device/contact cancels the material confirmation');
    await change();await material({command:'confirm',pending:{...pending,token:'disabled'},contactId:contact.id});await execute(`document.querySelector('#reply-zh').disabled=true;document.querySelector('#df-material-root').shadowRoot.querySelector('.dialog .primary').click();true`);await pause(20);assert.equal((await material({command:'confirmation-status',token:'disabled'})).status,'pending');assert.ok(await execute(`!!document.querySelector('#df-material-root').shadowRoot.querySelector('.dialog .error').textContent`));await material({command:'cancel-confirmation'});await execute(`document.querySelector('#reply-zh').disabled=false;true`);
    await execute(`window.changeConversation('device-a','chat-a','+1 (213) 555-1212');true`);await cmd({action:'bootstrap'});assert.equal((await material({command:'contact'})).phone,contact.phone,'formatted receiver numbers keep the same customer identity');await change();
    await execute(`document.querySelector('#peer-phone').textContent='+12135551213';true`);assert.equal((await material({command:'contact'})).id,'','a mismatched visible receiver number blocks the material target');await change();
    const imagePending={...pending,type:'image',text:undefined,imageData:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',token:'image-unavailable'};
    await material({command:'confirm',pending:imagePending,contactId:contact.id});await execute(`document.querySelector('#df-material-root').shadowRoot.querySelector('.dialog .primary').click();true`);await pause(20);assert.ok(await execute(`document.querySelector('#df-material-root').shadowRoot.querySelector('.dialog .error').textContent.includes('图片附件入口')`));assert.equal((await material({command:'confirmation-status',token:imagePending.token})).status,'pending','unsupported image insertion cannot report success or usage');await material({command:'cancel-confirmation'});
    const exporting=action=>execute(buildConversationExportScript({action,platform:'apple',...(action==='begin'?{}:{expectedId:contact.id})}));
    await execute(`currentConversation.messages[0].time='2026-11-01 23:59';currentConversation.messages[2].text=currentConversation.messages[1].text;document.querySelectorAll('#messages .original')[2].textContent=currentConversation.messages[2].text;document.querySelectorAll('#messages .bubble')[1].insertAdjacentHTML('beforeend','<div class="df-chat-translation">已翻译的第二条</div>');document.querySelector('#messages').style.height='100px';document.querySelector('#messages').scrollTop=17;window.exportOriginalScroll=document.querySelector('#messages').scrollTop;true`);
    let exported=unwrapConversationExportResult(await exporting('begin'));assert.equal(exported.rows.length,4);assert.equal(exported.rows[1].chineseText,'已翻译的第二条');assert.equal(exported.rows[2].originalText,exported.rows[1].originalText);assert.notEqual(exported.rows[2].id,exported.rows[1].id,'repeated saved messages keep separate IDs');assert.equal(exported.rows[1].direction,'outgoing');assert.equal(exported.rows[2].direction,'incoming');
    const requestExport={profileId:'apple-profile',platform:'apple',contactId:contact.id,contactTitle:contact.title,coverage:'partial',coverageNote:'Saved Apple workbench records',rows:exported.rows,exportDate:'2026-11-02'};
    assert.equal(renderConversationExport({...requestExport,mode:'english',scope:'all'}).count,4);assert.equal(renderConversationExport({...requestExport,mode:'chinese',scope:'today'}).count,3);assert.match(renderConversationExport({...requestExport,mode:'chinese',scope:'today'}).content,/已翻译的第二条/);assert.equal(unwrapConversationExportResult(await exporting('older')),false);assert.equal(unwrapConversationExportResult(await exporting('restore')),true);
    assert.equal(await execute(`document.querySelector('#messages').scrollTop===window.exportOriginalScroll`),true,'export leaves the current reading position intact');
    const host=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='exportCurrentConversation');let savedExport,olderCalls=0;
    const hostContext={...exportDates,localConversationExportDate:()=> '2026-11-02',profiles:{value:[{id:'apple-profile',platform:'apple'}]},activeProfileId:{value:'apple-profile'},window:{chatTranslator:{exportConversation:async request=>{savedExport=request;return {saved:true,...renderConversationExport(request)};}}},conversationExportBusy:{value:false},conversationExportProfileId:{value:''},conversationExportStatus:{value:''},appForPlatform:p=>p,unwrapConversationExportResult,executeProfileScript:async(_id,script)=>{if(script.includes('"action":"older"'))olderCalls++;return execute(script);},buildConversationExportScript,mergeConversationExportRows,lockScreenVisible:{value:false},activePanel:{value:'session'},diagnosticEvent:()=>{}};
    const hostExport=new Function('ctx',`const {${Object.keys(hostContext).join(',')}}=ctx;let conversationExportCancelled=false;${ts.transpileModule(host.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText};return exportCurrentConversation;`)(hostContext);
    await hostExport({mode:'chinese',scope:'today'});assert.equal(savedExport.platform,'apple');assert.equal(savedExport.contactId,contact.id);assert.equal(savedExport.coverage,'partial');assert.match(savedExport.coverageNote,/当前已读取/);assert.equal(olderCalls,0);assert.match(hostContext.conversationExportStatus.value,/已导出 3 条/);
    await exporting('begin');await execute(`currentConversation.messages.push({side:'incoming',time:'2026-11-02',kind:'attachment',text:''});true`);exported=unwrapConversationExportResult(await exporting('snapshot'));assert.equal(exported.rows.length,5);assert.equal(exported.rows[4].mediaLabel,'[附件消息]');await exporting('restore');
    await exporting('begin');await change('device-b','chat-a');const switchedExport=await exporting('snapshot');assert.equal(switchedExport.ok,false);assert.equal(switchedExport.errorCode,'contact-changed');
    await change();await exporting('begin');await execute(`workspaceRevision++;true`);assert.equal((await exporting('snapshot')).ok,false,'a new capture/revision invalidates an old export');
    console.log('apple assistant/export: confirmed textarea insertion, phone duplicate warnings, switch/disabled protection, unsupported-image honesty; saved model export, repeated rows, both parties, today/all, Chinese and actual App export handler passed');

    await cmd({ action: 'dispose' }); await type('重新安装守卫前'); await enter(); assert.equal(await nativeCount(), 5, 'disposing the runtime re-enables the startup preload block');
    await win.loadURL('http://127.0.0.1:8071/'); assert.equal(await cmd({ action: 'install' }), false, 'the Apple adapter is restricted to its exact origin');
    win.destroy();
    console.log('apple-runtime: right-side bubbles/cache, startup guard, Chinese Enter/click, native asynchronous sends, device/conversation races, IME, lock and sensitive confirmation passed');
    app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}

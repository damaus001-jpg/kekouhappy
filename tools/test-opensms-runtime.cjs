const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
if(!process.versions.electron){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  const child=spawn(require('electron'),[__filename],{cwd:root,env,windowsHide:true,stdio:'inherit'});
  const timer=setTimeout(()=>{child.kill();process.exitCode=1;},90000);
  child.on('error',e=>{clearTimeout(timer);console.error(e);process.exitCode=1;});child.on('exit',code=>{clearTimeout(timer);process.exitCode=code??1;});
}else{
  const {app,BrowserWindow}=require('electron');const ts=require('typescript');
  app.setPath('userData',path.join(root,'.tmp','opensms-runtime-test'));
  const loadTs=(file,dependencies={})=>{const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;return new Function('exports','require',code+';return exports;')({},name=>{if(dependencies[name])return dependencies[name];throw new Error('Unexpected dependency '+name);});};
  app.whenReady().then(async()=>{
    const {buildOpenSmsScript}=loadTs('src/opensms-runtime.ts');
    const shared=await import('../dist-electron/shared.js');
    const {buildGptClipboardText}=await import('../dist-electron/gpt-handoff.js');
    const source=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
    const ast=ts.createSourceFile('App.ts',source.slice(source.indexOf('>')+1,source.indexOf('</script>')),ts.ScriptTarget.Latest,true);
    const names=['buildComposerPlainTextReaderSource','buildMediaCaptionComposerSource','isMediaCaptionComposerFromDom','buildDirectSendHttpUrlSource','buildComposerScript','buildInjectedComposerScript','buildNativeComposerHelpersScript','buildNativeComposerTextScript','buildNativeComposerFocusScript','buildComposerRequestMatchScript','buildMessageScanScript','buildMessageTranslationInjectScript','buildCachedTranslationRuntimeScript','buildUnreadScanScript','isLatestVisibleMessageCandidate','isBaseLatestVisibleCandidate','isLatestWhatsAppMessageCandidate','isLatestTelegramMessageCandidate','isLatestSignalMessageCandidate','candidateViewportRatio'];
    const code=names.map(name=>{const item=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(item,name);return item.getText(ast);}).join('\n');
    const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const helpers=new Function('activeTheme','readComposerPlainTextFromDom','isDirectSendHttpUrl','readTelegramConversationIdFromDom','buildOpenSmsScript',js+`;return {${names.join(',')}};`)({value:'blackGold'},shared.readComposerPlainTextFromDom,shared.isDirectSendHttpUrl,shared.readTelegramConversationIdFromDom,buildOpenSmsScript);
    const today=new Date();
    const dayOffset=offset=>{const date=new Date(today);date.setDate(date.getDate()+offset);return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');};
    const win=new BrowserWindow({show:false,width:1200,height:850,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});
    await win.webContents.session.protocol.handle('https',()=>new Response('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',{headers:{'content-type':'text/html'}}));
    await win.loadURL('https://www.opensms.cc/#/index/chat');
    const execute=script=>win.webContents.executeJavaScript(script,true).catch(error=>{console.error(script.slice(0,240));throw error;});
    win.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message);});
    const cmd=c=>execute(buildOpenSmsScript(c));
    const events=()=>execute(`(()=>{const events=window.__dfTranslatorQueue||[];window.__dfTranslatorQueue=[];return events;})()`);
    async function fixture(count=4,previousCount=0){
      await execute(`window.__dfOpenSms?.dispose();delete window.__dfOpenSms;window.__dfTranslatorQueue=[];localStorage.removeItem('sendKey');document.body.innerHTML=${JSON.stringify(`<style>body{margin:0}.left-bar{width:100px}.im-chat{margin-left:250px}#message-box{height:400px;overflow:auto}.im-chat-text{background:#ddd;margin:10px;padding:12px}.im-chat-mine .im-chat-text{background:#59b477}.im-chat-footer{height:170px}#messageTextArea{width:800px;min-height:80px}.im-chat-send button{min-height:30px}.chat-item{width:200px;height:40px}.message-content{min-height:20px}</style><aside class="left-bar"><span class="avatar-name">ACCOUNT_A</span></aside><div class="chat-item active" data-id="chat-a"><span class="stat-unread"><span class="stat-value">2</span></span></div><div class="chat-item" data-id="chat-b"><span class="stat-unread"><span class="stat-value">3</span></span></div><button id="sidebar-send">Send contact</button><div class="im-chat"><div class="im-chat-top"><span class="info-other"><span class="info-value">Contact A</span></span></div><div id="message-box" class="im-chat-main-box messages"><ul>${Array.from({length:count},(_,i)=>`<li id="m-${i}" class="${i%2?'im-chat-mine':'im-chat-other'}"><div class="im-chat-user">Contact A <i class="msg-time">${i<previousCount?dayOffset(-1):dayOffset(0)} 13:48</i></div><div class="im-chat-text" data-id="message.id"><div class="message-content">${i===count-1?'Newest incoming message':`English message ${i}`}</div></div><div class="read-tips">Delivered</div></li>`).join('')}</ul></div><div class="im-chat-footer"><div id="messageTextArea" contenteditable="true" class="textarea notranslate"></div><div class="im-chat-send"><button id="send">发送</button><button id="dropdown">▼</button></div></div></div>`)};document.querySelectorAll('.chat-item').forEach(card=>card.insertAdjacentHTML('beforeend','<div class="receiver-row"><span class="tag tag-receiver">收信人</span><span class="address-name">14234631871</span></div>'));window.nativeSends=[];window.wrongClicks=0;document.querySelector('#sidebar-send').onclick=()=>window.wrongClicks++;
        window.nativeSend=()=>{const input=document.querySelector('.mms-title-input input')||document.querySelector('#messageTextArea');window.nativeSends.push({text:input.value??input.innerText,contact:document.querySelector('.chat-item.active').dataset.id});if(input instanceof HTMLInputElement)input.value='';else input.textContent='';};document.querySelector('#send').onclick=window.nativeSend;document.querySelector('#messageTextArea').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey&&(localStorage.getItem('sendKey')!=='alt+enter'||e.altKey))window.nativeSend();});`);
      await cmd({action:'install'});await events();
    }
    async function type(text){await execute(`(()=>{const input=window.__dfOpenSms.editor();if(input instanceof HTMLInputElement)input.value=${JSON.stringify(text)};else input.textContent=${JSON.stringify(text)};input.focus();input.dispatchEvent(new InputEvent('input',{bubbles:true,data:${JSON.stringify(text)}}));})()`);await events();}
    const enter=options=>execute(`(()=>{const event=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true,...${JSON.stringify(options||{})}});window.__dfOpenSms.editor().dispatchEvent(event);return event.defaultPrevented;})()`);
    const target=()=>cmd({action:'contact'});
    async function translateReady(request,text='Hello from translated draft'){
      assert.equal(await execute(helpers.buildComposerRequestMatchScript(request.requestId)),true);
      const written=await execute(helpers.buildComposerScript('write',text,true,false,'default',request.requestId));assert.equal(written.ok,true);
      assert.equal(await execute(helpers.buildInjectedComposerScript('state',{translated:text,requestId:request.requestId,conversationSignature:request.conversationSignature})),true);
      return text;
    }
    async function send(text,signature){return execute(helpers.buildComposerScript('send',text,true,false,'default','',{platform:'opensms',conversationSignature:signature}));}
    await fixture(5);
    await execute(`(()=>{const chat=document.querySelector('.im-chat'),layout=document.createElement('div'),right=document.createElement('div'),toolbar=document.createElement('div');layout.className='main content';right.className='right';toolbar.className='im-top';toolbar.style.height='80px';right.append(toolbar,chat);layout.append(right);document.body.append(layout);document.body.insertAdjacentHTML('beforeend','<div class="ops-bell-root"></div><div class="sound-alert-toggle"></div>');window.foldMutationCount=0;window.foldObserver=new MutationObserver(records=>window.foldMutationCount+=records.length);window.foldObserver.observe(document.body,{childList:true,subtree:true,characterData:true});return true;})()`);
    await new Promise(r=>setTimeout(r,100));
    assert.ok(await execute(`document.querySelector('.df-opensms-topbar-fold')`),'top toolbar fold control is installed');
    assert.ok(await execute(`window.foldMutationCount<12`),'top toolbar sync settles without a self-triggering DOM mutation loop');
    await execute(`document.querySelector('.df-opensms-topbar-fold').click();true`);
    assert.equal(await execute(`getComputedStyle(document.querySelector('.im-top')).height`),'0px','folding collapses the top area');
    assert.equal(await execute(`getComputedStyle(document.querySelector('.ops-bell-root')).display`),'none','folding hides the operations notice');
    assert.equal(await execute(`getComputedStyle(document.querySelector('.sound-alert-toggle')).display`),'none','folding hides the message reminder');
    await execute(`document.querySelector('.df-opensms-topbar-fold').click();window.foldObserver.disconnect();document.body.append(document.querySelector('.im-chat'));document.querySelector('.main.content').remove();document.querySelector('.ops-bell-root').remove();document.querySelector('.sound-alert-toggle').remove();true`);
    await execute(`document.querySelector('.chat-item .address-name').textContent='14234631871';true`);await target();
    assert.match(await execute(`document.querySelector('.chat-item .df-opensms-area-hint').textContent`),/^查塔努加-田纳西州-时差\+3$/,'US number area 423 displays beneath the recipient number in the contact list');
    await execute(`document.querySelector('.chat-item .address-name').textContent='+1 (516) 555-1212';true`);await target();
    assert.match(await execute(`document.querySelector('.chat-item .df-opensms-area-hint').textContent`),/^长岛-纽约州-时差\+3$/,'Long Island area code displays beneath the recipient number');
    await execute(`document.querySelector('.chat-item .address-name').textContent='+1 (854) 555-1212';true`);await target();
    assert.match(await execute(`document.querySelector('.chat-item .df-opensms-area-hint').textContent`),/^查尔斯顿-南卡罗来纳州-时差\+3$/,'area 854 resolves to Charleston, South Carolina');
    await execute(`document.querySelector('.chat-item .address-name').textContent='+1 (859) 555-1212';true`);await target();
    assert.match(await execute(`document.querySelector('.chat-item .df-opensms-area-hint').textContent`),/^列克星敦-肯塔基州-时差\+3$/,'area 859 resolves to Lexington, Kentucky');
    await execute(`document.querySelector('.chat-item .address-name').textContent='Contact A';true`);await target();
    let scan=await execute(helpers.buildMessageScanScript('opensms',{includeAlreadyTranslated:true,viewportScreensBelow:2}));
    assert.equal(scan.length,5);assert.equal(scan[0].direction,'incoming');assert.equal(scan[1].direction,'outgoing');assert.ok(scan.every(r=>!r.text.includes('Delivered')&&!r.text.includes('2026-')));
    assert.equal(helpers.isLatestVisibleMessageCandidate('opensms',{scanBand:'visible',nearConversationEnd:true,rectBottom:120,viewportHeight:850}),true,'upper visible bubbles are translated at the conversation end');
    await execute(`document.querySelector('#message-box ul').insertAdjacentHTML('beforeend','<li id="m-cn" class="im-chat-other"><div class="im-chat-text"><div class="message-content">不需要重复翻译中文</div></div></li>')`);
    assert.equal((await execute(helpers.buildMessageScanScript('opensms',{includeAlreadyTranslated:true,viewportScreensBelow:3}))).length,5,'Chinese messages do not generate English translation requests');
    assert.equal((await execute(helpers.buildUnreadScanScript('opensms'))).count,5);
    await execute(`const nav=document.createElement('div');nav.className='nav-section';nav.innerHTML='<a href="#/index/chat"><sup class="el-badge__content">17</sup></a>';document.querySelector('.left-bar').appendChild(nav);true`);
    assert.equal((await execute(helpers.buildUnreadScanScript('opensms'))).count,17,'native total takes precedence over the filtered contact list');
    assert.equal(await execute(helpers.buildMessageTranslationInjectScript(scan[0].key,'测试译文','opensms',scan[0].text)),true);
    assert.equal(await execute(`document.querySelector('#m-0 .message-content').textContent`),scan[0].text);
    assert.equal(await execute(`document.querySelector('#m-0 .message-content').nextElementSibling.textContent`),'测试译文');
    const {buildConversationExportScript,unwrapConversationExportResult,mergeConversationExportRows}=loadTs('src/conversation-export-runtime.ts',{'../electron/shared':shared});
    const {renderConversationExport}=await import('../dist-electron/conversation-export-core.js');
    let exportContactId;
    const exporting=action=>execute(buildConversationExportScript({action,platform:'opensms',expectedId:action==='begin'?undefined:exportContactId}));
    await execute(`document.querySelector('#m-0 .im-chat-user').innerHTML='<img src="data:image/png;base64,AAAA"><span>Contact A</span><i class="msg-time">2026-10-16 13:48</i>';document.querySelector('#message-box ul').insertAdjacentHTML('beforeend','<li id="m-photo" class="im-chat-mine"><div class="im-chat-user"><img src="data:image/png;base64,AAAA"></div><div class="im-chat-text"><img src="data:image/png;base64,AAAA"></div></li>');true`);
    const exported=await exporting('begin');assert.equal(exported.ok,true);exportContactId=exported.data.contactId;assert.equal(exported.data.rows.length,7);
    const first=exported.data.rows.find(r=>r.id==='m-0');assert.equal(first.direction,'incoming');assert.equal(first.originalText,scan[0].text);assert.equal(first.chineseText,'测试译文');assert.equal(first.timestamp,'2026-10-16 13:48');assert.equal(first.mediaLabel,'','avatar is not a photo message');
    assert.equal(exported.data.rows.find(r=>r.id==='m-1').direction,'outgoing');assert.equal(exported.data.rows.find(r=>r.id==='m-photo').mediaLabel,'[图片/贴纸]');
    const exportRequest={profileId:'sms-test',platform:'opensms',contactId:exported.data.contactId,contactTitle:exported.data.contactTitle,coverage:'history-top',coverageNote:'All message-box bubbles',rows:exported.data.rows};
    const en=renderConversationExport({...exportRequest,mode:'english'}),zh=renderConversationExport({...exportRequest,mode:'chinese'});assert.match(en.content,/English message 0/);assert.match(en.content,/对方/);assert.match(en.content,/我方/);assert.match(zh.content,/测试译文/);assert.equal(zh.missing,4);assert.match(zh.content,/暂无译文/);assert.equal((await exporting('restore')).ok,true);
    // Exact message-box structure supplied by the user: metadata/dividers are not messages.
    const suppliedMessages=[
      ['2111123026338217984','mine','08:52','Are you going to be impossible to catch tomorrow?'],
      ['2111213245154029568','other','14:50','I might, where you gonna be at'],
      ['ca9bc403-dbdc-40c0-b1cd-a19878c88005','mine','14:53','Just at home'],
      ['2111222039108304896','other','15:25','Swing on by then']
    ];
    const suppliedHtml=suppliedMessages.map(([id,side,time,text])=>`<div class="time-divider"><span class="time-text">${time}</span></div><li id="m-${id}" class="im-chat-${side}" style="padding:60px"><div class="im-chat-user"><span class="el-avatar">${side==='mine'?'自己':'13'}</span><div class="message-info"><span>${side==='mine'?'自己':'13145704300'}</span><i class="msg-time">2026-10-16 ${time}</i></div></div><div class="im-chat-text" data-id="message.id"><div class="message-content">${text}</div></div>${side==='mine'?'<div class="read-tips delivered">已送达</div>':''}</li>`).join('');
    await execute(`window.exportOriginalHtml=document.querySelector('#message-box ul').innerHTML;document.querySelector('#message-box ul').innerHTML=${JSON.stringify(suppliedHtml)};document.querySelector('#message-box').scrollTop=120;window.exportScrollEvents=0;document.querySelector('#message-box').addEventListener('scroll',()=>window.exportScrollEvents++);true`);
    const beforeTop=await execute(`document.querySelector('#message-box').scrollTop`);
    const supplied=await exporting('begin');assert.equal(supplied.ok,true);
    exportContactId=supplied.data.contactId;
    assert.deepEqual(supplied.data.rows.map(r=>[r.id,r.direction,r.timestamp,r.originalText]),suppliedMessages.map(([id,side,time,text])=>['m-'+id,side==='mine'?'outgoing':'incoming','2026-10-16 '+time,text]));
    assert.equal(await execute(`document.querySelector('#message-box').scrollTop`),beforeTop,'container export does not scroll');
    assert.equal((await exporting('older')).data,false,'no history paging needed');
    const suppliedText=renderConversationExport({...exportRequest,rows:supplied.data.rows,mode:'english'}).content;
    for(const [,side,,text]of suppliedMessages)assert.ok(suppliedText.includes(`${side==='mine'?'我方':'对方'}：${text}`));
    assert.doesNotMatch(suppliedText,/2026-10-16|08:52|14:50|14:53|15:25|导出时间/);
    assert.doesNotMatch(suppliedText,/已送达|13145704300|身份未识别|self|other/);
    await execute(`window.savedContactList=Array.from(document.querySelectorAll('.chat-item')).map(n=>n.outerHTML).join('');document.querySelectorAll('.chat-item').forEach(n=>n.remove());window.savedOpenSmsRuntime=window.__dfOpenSms;delete window.__dfOpenSms;true`);
    assert.equal((await exporting('snapshot')).data.rows.length,4,'export needs neither contact list nor translation contact runtime');
    const hostExport=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='exportCurrentConversation');
    const hostJs=ts.transpileModule(hostExport.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const exportStatus={value:''},exportBusy={value:false};let savedRequest,olderCalls=0;
    const hostContext={profiles:{value:[{id:'sms-test',platform:'opensms'}]},activeProfileId:{value:'sms-test'},window:{chatTranslator:{exportConversation:async request=>{savedRequest=request;return{saved:true,...renderConversationExport(request)};}}},conversationExportBusy:exportBusy,conversationExportProfileId:{value:''},conversationExportStatus:exportStatus,appForPlatform:p=>p,unwrapConversationExportResult,executeProfileScript:async(id,script)=>{assert.equal(id,'sms-test');if(script.includes('"action":"older"'))olderCalls++;return execute(script);},buildConversationExportScript,mergeConversationExportRows,lockScreenVisible:{value:false},activePanel:{value:'session'},diagnosticEvent:()=>{}};
    const runHostExport=new Function('ctx',`const {${Object.keys(hostContext).join(',')}}=ctx;let conversationExportCancelled=false;${hostJs};return exportCurrentConversation;`)(hostContext);
    await runHostExport('english');assert.equal(savedRequest.rows.length,4);assert.equal(savedRequest.coverage,'history-top');assert.match(savedRequest.coverageNote,/message-box/);assert.equal(olderCalls,0,'OpenSMS host never runs other platforms history paging');assert.equal(exportBusy.value,false);assert.match(exportStatus.value,/已导出 4 条/);assert.doesNotMatch(exportStatus.value,/部分历史/);
    savedRequest=undefined;hostContext.activeProfileId.value='other-profile';
    await runHostExport('english');assert.equal(savedRequest,undefined,'no save when active profile is unavailable');hostContext.activeProfileId.value='sms-test';
    await execute(`document.body.insertAdjacentHTML('afterbegin',window.savedContactList);delete window.savedContactList;window.__dfOpenSms=window.savedOpenSmsRuntime;delete window.savedOpenSmsRuntime;true`);
    await execute(`document.querySelector('#message-box li').style.display='none';true`);
    assert.equal((await exporting('snapshot')).data.rows.length,4,'all container bubbles, not just displayed or viewport rows');
    const afterHideTop=await execute(`document.querySelector('#message-box').scrollTop`);
    await exporting('restore');
    assert.equal(await execute(`document.querySelector('#message-box').scrollTop`),afterHideTop,'restore leaves container position untouched');
    await execute(`document.querySelector('#message-box ul').innerHTML=window.exportOriginalHtml;delete window.exportOriginalHtml;true`);
    const oldKey=scan[0].key;
    await execute(`document.querySelector('.avatar-name').textContent='ACCOUNT_B'`);
    assert.notEqual((await target()).id,scan[0].contactId);
    assert.equal((await exporting('snapshot')).errorCode,'contact-changed','export stops after account changes');
    assert.equal(await execute(helpers.buildMessageTranslationInjectScript(oldKey,'Wrong account translation','opensms',scan[0].text)),false);
    await fixture(23,5);await execute(`document.querySelector('#m-22 .df-smart-reply-host').click()`);
    const gpt=(await events()).find(e=>e.action==='smart-reply-request');assert.ok(gpt);
    const transcript=JSON.parse(gpt.text);assert.equal(transcript.messages.length,18);assert.equal(transcript.messages[0].text,'English message 5');assert.equal(transcript.messages.at(-1).speaker,'other');assert.ok(transcript.messages.some(m=>m.speaker==='self'));
    assert.match(buildGptClipboardText({platform:'opensms',messages:transcript.messages,latestSpeaker:'other',replyCount:3,outputLanguage:'en-US',allowSensitiveEcho:false}),/参考你在 ChatGPT 个性化设置中保存的记忆/);
    await fixture(13,3);await execute(`document.querySelector('#m-12 .df-smart-reply-host').click()`);
    const fewer=(await events()).find(e=>e.action==='smart-reply-request');assert.ok(fewer);assert.equal(JSON.parse(fewer.text).messages.length,10,'fewer than eighteen messages today includes all of today');
    await fixture();await type('你好，最近怎么样');assert.equal(await enter(),true);
    let enterEvents=await events();let request=enterEvents.find(e=>e.action==='translate');assert.ok(request);assert.equal(JSON.parse(enterEvents.find(e=>e.action==='debug').text).decision,'submit-composer');assert.equal((await execute('window.nativeSends')).length,0);
    await enter();assert.equal((await events()).filter(e=>e.action==='translate').length,0,'pending translation cannot repeat');
    // A delayed conversation-change UI clear must not erase the newer request.
    await execute(helpers.buildInjectedComposerScript('state',{draft:'',translated:'',status:''}));
    let english=await translateReady(request);assert.equal((await execute('window.nativeSends')).length,0);
    await enter();let queued=(await events()).find(e=>e.action==='send');assert.ok(queued);assert.equal(queued.requestId,request.requestId);
    assert.equal((await send(english,queued.conversationSignature)).ok,true);assert.deepEqual(await execute('window.nativeSends'),[{text:english,contact:'chat-a'}]);assert.equal(await execute('window.wrongClicks'),0);
    await fixture();await type('按钮翻译');await execute(`document.querySelector('#send').click()`);request=(await events()).find(e=>e.action==='translate');assert.ok(request);english=await translateReady(request);await execute(`document.querySelector('#send').click()`);queued=(await events()).find(e=>e.action==='send');assert.ok(queued);assert.equal((await send(english,queued.conversationSignature)).ok,true);
    await fixture();await type('切换联系人测试');await enter();request=(await events()).find(e=>e.action==='translate');
    await execute(`document.querySelector('[data-id="chat-a"]').classList.remove('active');document.querySelector('[data-id="chat-b"]').classList.add('active');document.querySelector('#messageTextArea').textContent='Other contact draft'`);
    assert.equal(await execute(helpers.buildComposerRequestMatchScript(request.requestId)),false);
    assert.equal((await execute(helpers.buildComposerScript('write','Stale translation',true,false,'default',request.requestId))).ok,false);
    assert.equal(await execute(helpers.buildNativeComposerTextScript()),'Other contact draft');
    assert.equal((await send('Other contact draft',request.conversationSignature)).ok,false);
    await fixture();await type('正在修改的草稿');await enter();request=(await events()).find(e=>e.action==='translate');await type('新的草稿');assert.equal((await execute(helpers.buildComposerScript('write','Old result',true,false,'default',request.requestId))).ok,false);
    await fixture();await type('焦点切换');await enter();request=(await events()).find(e=>e.action==='translate');
    await execute(`window.__dfOpenSms.editor().focus=()=>{document.querySelector('[data-id="chat-a"]').classList.remove('active');document.querySelector('[data-id="chat-b"]').classList.add('active');};true`);
    assert.equal((await execute(helpers.buildComposerScript('write','Wrong focus',true,false,'default',request.requestId))).ok,false);
    await fixture();await type('快捷键测试');await enter({shiftKey:true});await enter({ctrlKey:true});await enter({metaKey:true});await enter({altKey:true,shiftKey:true});await enter({isComposing:true});await enter({repeat:true});assert.equal((await events()).filter(e=>e.action==='translate').length,0);assert.equal((await execute('window.nativeSends')).length,0);
    await execute(`localStorage.setItem('sendKey','alt+enter')`);await enter();assert.equal((await events()).filter(e=>e.action==='translate').length,0);await enter({altKey:true});assert.ok((await events()).find(e=>e.action==='translate'));
    await fixture();await type('https://example.com/中文路径');await enter();assert.equal((await events()).filter(e=>e.action==='translate').length,0,'a whole URL must not consume a translation request');assert.equal((await execute('window.nativeSends'))[0].text,'https://example.com/中文路径');
    await fixture();await type('1234567890123456');await enter();assert.ok((await events()).find(e=>e.action==='sensitive-prepare'));assert.equal((await execute('window.nativeSends')).length,0);const identity=await target();await execute(helpers.buildInjectedComposerScript('state',{sensitiveToken:'trusted-token',sensitiveText:'1234567890123456',conversationSignature:identity.id}));await enter();assert.ok((await events()).find(e=>e.action==='sensitive-send'));
    await fixture();await execute(`const bar=document.createElement('div');bar.className='mms-preview-bar';bar.innerHTML='<img src="data:image/png;base64,abc"><span class="mms-title-input"><input></span>';document.querySelector('.im-chat-footer').before(bar);bar.querySelector('input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing)window.nativeSend();});`);
    await type('彩信正文');await enter();request=(await events()).find(e=>e.action==='translate');assert.ok(request);english=await translateReady(request,'MMS caption');await enter();queued=(await events()).find(e=>e.action==='send');assert.ok(queued);assert.equal((await send(english,queued.conversationSignature)).ok,true);
    await type('新的图片说明');await enter();request=(await events()).find(e=>e.action==='translate');await execute(`document.querySelector('.mms-preview-bar img').src='data:image/png;base64,changed'`);assert.equal((await execute(helpers.buildComposerScript('write','Old image caption',true,false,'default',request.requestId))).ok,false);
    // Exercise the real material runtime and encrypted store with SMS identities.
    await fixture();
    const {clipboard,dialog}=require('electron');let clipText='',clipImage;
    clipboard.writeText=text=>{clipText=text;};clipboard.readText=()=>clipText;clipboard.writeImage=image=>{clipImage=image;};clipboard.readImage=()=>clipImage;
    const store=await import('../dist-electron/assistant-material-store.js');const library=await import('../dist-electron/assistant-library.js');const {emptyAssistantLibrary}=await import('../dist-electron/assistant-library-types.js');
    const module=emptyAssistantLibrary().modules.quotes;module.entries=[{id:'sms-image',title:'Photo',text:'',date:'',timeZone:'America/Los_Angeles',status:'planned',tags:[],media:[]}];await library.saveAssistantModule('quotes',module);
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(root,'src/assets/xiaozhi-assistant-transparent.png')]});
    const media=(await library.attachAssistantMedia('quotes','sms-image')).modules.quotes.entries[0].media[0];
    const {buildAssistantRuntimeScript}=loadTs('src/assistant-material-runtime.ts');
    const material=c=>execute(buildAssistantRuntimeScript(c));
    const colors={'--text':'#eee','--muted':'#aaa','--muted-strong':'#ccc','--accent':'#dca749','--accent-bright':'#ffd68f','--bg':'#111','--bg-soft':'#191919','--panel-strong':'#222','--panel-muted':'#292929','--line':'#555','--line-strong':'#666'};
    const materialConfig={platform:'opensms',catalog:{persona:[],schedule:[],quotes:[]},colors,icon:'',usages:[],enabled:true,showButton:false};
    await material({command:'install',config:materialConfig});
    const materialScope=(await target()).id,profileId=`sms-material-${Date.now()}`;
    let staged=await store.stageAssistantMaterial({id:'sms-text',type:'text',text:'Card material'});
    await material({command:'confirm',pending:staged,contactId:materialScope});
    const dialogAction=selector=>execute(`document.querySelector('#df-material-root').shadowRoot.querySelector(${JSON.stringify(selector)}).click()`);
    await dialogAction('.dialog .primary');let inserted=await material({command:'confirmation-status',token:staged.token});assert.equal(inserted.status,'inserted');assert.equal(await cmd({action:'text'}),'Card material');
    const textUsage=await store.recordAssistantUse({profileId,platform:'opensms',token:staged.token,contactId:materialScope,contactTitle:'Contact A',actualText:inserted.actualText});
    staged=await store.stageAssistantMaterial({id:'first-card-photo',type:'image',mediaId:media.id});
    await execute(`document.querySelector('#messageTextArea').addEventListener('paste',event=>{if(!event.clipboardData?.files.length)return;event.preventDefault();const bar=document.createElement('div');bar.className='mms-preview-bar';const image=document.createElement('img');image.style.cssText='width:80px;height:80px';image.src=${JSON.stringify(staged.imageData)};bar.appendChild(image);const field=document.createElement('span');field.className='mms-title-input';field.appendChild(document.createElement('input'));bar.appendChild(field);document.querySelector('.im-chat-footer').before(bar);});true`);
    await material({command:'confirm',pending:staged,contactId:materialScope});await dialogAction('.dialog .primary');await new Promise(r=>setTimeout(r,200));inserted=await material({command:'confirmation-status',token:staged.token});assert.equal(inserted.status,'inserted');
    const imageUsage=await store.recordAssistantUse({profileId,platform:'opensms',token:staged.token,contactId:materialScope,contactTitle:'Contact A'});
    materialConfig.usages=[textUsage,imageUsage];await material({command:'install',config:materialConfig});
    staged=await store.stageAssistantMaterial({id:'second-card-same-photo',type:'image',mediaId:media.id});assert.equal(staged.id,imageUsage.materialId);
    await material({command:'confirm',pending:staged,contactId:materialScope});assert.equal(await execute(`document.querySelector('#df-material-root').shadowRoot.querySelector('h2').textContent`),'此素材在当前联系人聊天里已使用');await dialogAction('.dialog .actions button');
    staged=await store.stageAssistantMaterial({id:'caption-material',type:'text',text:'Material MMS caption'});await material({command:'confirm',pending:staged,contactId:materialScope});await dialogAction('.dialog .primary');inserted=await material({command:'confirmation-status',token:staged.token});assert.equal(inserted.status,'inserted');assert.equal(await cmd({action:'text'}),'Material MMS caption');assert.equal((await execute('window.nativeSends')).length,0,'material insertion never sends a message');
    await fixture();await cmd({action:'enabled',enabled:false});await type('锁屏时禁止发送');await enter();assert.equal((await events()).filter(e=>e.action==='translate').length,0);assert.equal((await execute('window.nativeSends')).length,0);
    // Execute the actual startup preload with an IPC stub; no real SMS traffic.
    await fixture();await execute(`window.__dfOpenSms.dispose();delete window.__dfOpenSms`);
    const preload=fs.readFileSync(path.join(root,'electron/webview-send-guard-preload.cjs'),'utf8');
    await execute(`new Function('require',${JSON.stringify(preload)})(()=>({ipcRenderer:{sendToHost:()=>{}}}))`);
    await execute(`document.querySelector('#messageTextArea').textContent='Startup Chinese 中文';document.querySelector('#messageTextArea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));document.querySelector('#send').click()`);assert.equal((await execute('window.nativeSends')).length,0,'startup is fail closed');
    await cmd({action:'install'});assert.equal(await execute(`document.documentElement.dataset.dfOpenSmsGuard`),'2026-10-16-opensms-v1','runtime must release the startup preload after installing its Enter handler');await events();await type('启动保护就绪');await enter();assert.ok((await events()).find(e=>e.action==='translate'));
    // Check singleton enforcement in the actual main-process creation functions.
    const main=fs.readFileSync(path.join(root,'electron/main.ts'),'utf8');const mainAst=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true);
    const mainFunctions=names=>names.map(name=>mainAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(mainAst)).join('\n');
    const authCode=ts.transpileModule(mainFunctions(['canonicalSendText','registerApprovedComposerTranslation','authorizeTranslatedSend','isAllowedPlatformUrl','isAllowedPlatformPermissionOrigin']),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const auth=new Function('createHash','const approvedComposerTranslations=new Map(),approvedComposerTranslationTtlMs=120000;'+authCode+';return {registerApprovedComposerTranslation,authorizeTranslatedSend,isAllowedPlatformUrl,isAllowedPlatformPermissionOrigin};')(require('node:crypto').createHash);
    for(const url of ['https://www.opensms.cc/#/index/chat','https://opensms.cc/#/login']){assert.equal(auth.isAllowedPlatformUrl('opensms',url),true);assert.equal(auth.isAllowedPlatformPermissionOrigin('opensms',url),true);}
    for(const url of ['http://www.opensms.cc/','https://evil.opensms.cc/','https://www.opensms.cc.evil.example/','https://www.opensms.cc@evil.example/']){assert.equal(auth.isAllowedPlatformUrl('opensms',url),false);assert.equal(auth.isAllowedPlatformPermissionOrigin('opensms',url),false);}
    auth.registerApprovedComposerTranslation({profileId:'sms-profile',platform:'opensms',reason:'composer-enter',text:'中文草稿',contactId:'sms:ACCOUNT:chat-a'},'proof','Approved English');
    const authorization={profileId:'sms-profile',platform:'opensms',requestId:'proof',conversationSignature:'sms:ACCOUNT:chat-a',text:'Approved English'};
    for(const change of [{profileId:'other-profile'},{platform:'whatsapp'},{conversationSignature:'sms:ACCOUNT:chat-b'},{text:'Changed English'}])assert.equal(auth.authorizeTranslatedSend({...authorization,...change}).ok,false);
    assert.equal(auth.authorizeTranslatedSend(authorization).ok,true);assert.equal(auth.authorizeTranslatedSend(authorization).ok,false,'translation approval is single use');
    const mainCode=['createProfile','createProfileRecord'].map(name=>mainAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(mainAst)).join('\n');
    const factory=ts.transpileModule('let creatingOpenSms=null;\n'+mainCode,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    let config={profiles:[],profileTabOrder:[],lastActiveProfileIds:{}};let ids=0;
    const create=new Function('readConfig','saveConfig','randomId','platformDefaults','buildFingerprint','userAgentForPlatform','configureSession','workspaceAppForPlatform',factory+';return createProfile;')(async()=>structuredClone(config),async value=>{config=value;},()=>`id-${++ids}`,{opensms:{label:'打新增'}},()=>({}),()=>'',()=>{},shared.workspaceAppForPlatform);
    const created=await Promise.all(Array.from({length:12},()=>create('opensms','打新增','打新增')));assert.equal(new Set(created.map(p=>p.id)).size,1);assert.equal(config.profiles.length,1);const second=await create('opensms','打新增 2','打新增');assert.equal(config.profiles.length,2);assert.notEqual(second.id,created[0].id,'OpenSMS can now create a second isolated profile');
    assert.ok(source.indexOf('class="app-short sms"')>source.indexOf('class="app-short sg"'));assert.match(source,/:src="opensmsIcon" alt="打新增"/);assert.match(source,/function nextProfileName\(app: RuntimeApp\)[\s\S]*?existingNames\.has\(`打新增 \$\{suffix\}`\)/,'OpenSMS profile names are generated without collisions');assert.match(source,/<button class="add-tab" type="button"[^>]*@click="openCreateProfileDialog">\+/,'OpenSMS exposes the add-profile control');assert.match(source,/<em aria-label="rename"/);assert.match(source,/<i aria-label="close"/);
    // Render the actual application navigation fragment with Vue and the real CSS.
    const navStart=source.indexOf('<button type="button" class="app-short wa"');
    const navEnd=source.lastIndexOf('<button',source.indexOf('class="runtime-customize-button"',navStart));
    assert.ok(navStart>0&&navEnd>navStart);
    const nav=source.slice(navStart,navEnd);
    const css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
    const icon='data:image/svg+xml;base64,'+fs.readFileSync(path.join(root,'src/assets/opensms-bubble.svg')).toString('base64');
    const png=name=>'data:image/png;base64,'+fs.readFileSync(path.join(root,'src/assets',name)).toString('base64');
    await execute(`window.__dfOpenSms.dispose();delete window.__dfOpenSms;document.body.innerHTML='<div id="nav-fixture"></div>';const style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.appendChild(style);`);
    await execute(fs.readFileSync(require.resolve('vue/dist/vue.global.prod.js'),'utf8')+';true');
    const template='<main class="page workspace-page theme-black-gold"><header class="runtime-header">Navigation fixture</header><aside class="runtime-side"><button>Home</button><button>Lock</button><button>Guard</button><button>Collapse</button>'+nav+'<button class="runtime-customize-button">Settings</button></aside></main>';
    await execute(`Vue.createApp({template:${JSON.stringify(template)},setup(){const currentApp=Vue.ref('signal');window.testCurrentApp=currentApp;return {currentApp,multiWhatsappIcon:${JSON.stringify(png('multi-whatsapp.png'))},multiTelegramIcon:${JSON.stringify(png('multi-telegram.png'))},multiSignalIcon:${JSON.stringify(png('multi-signal.png'))},opensmsIcon:${JSON.stringify(icon)},unreadCountForApp:()=>0,selectRuntimeApp:app=>currentApp.value=app};}}).mount('#nav-fixture');true`);
    await new Promise(r=>setTimeout(r,100));
    for(const theme of ['theme-black-gold','theme-pink','theme-black-gold theme-murong-purple','theme-black-gold theme-clear-water-blue']){
      await execute(`document.querySelector('main').className='page workspace-page '+${JSON.stringify(theme)}`);
      const layout=await execute(`(()=>{const button=document.querySelector('.app-short.sms'),sg=document.querySelector('.app-short.sg'),label=button.querySelector('small');const a=button.getBoundingClientRect(),b=sg.getBoundingClientRect(),c=label.getBoundingClientRect();return {below:a.top>=b.bottom,label:label.textContent,inside:c.top>=a.top&&c.bottom<=a.bottom,loaded:button.querySelector('img').naturalWidth>0};})()`);
      assert.deepEqual(layout,{below:true,label:'打新增',inside:true,loaded:true});
    }
    await execute(`document.querySelector('.app-short.sms').click()`);assert.equal(await execute(`window.testCurrentApp.value`),'opensms');
    await execute('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');await new Promise(r=>setTimeout(r,150));
    const screenshot=await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});fs.mkdirSync(path.join(root,'.tmp/opensms-runtime-test'),{recursive:true});fs.writeFileSync(path.join(root,'.tmp/opensms-runtime-test/sidebar.png'),screenshot.toPNG());
    win.destroy();console.log('opensms-runtime: actual App dispatch, body/direction, account isolation, GPT, Enter/button translation, races, IME, sensitive/MMS/startup/lock guards, confirmed materials/photo duplicates, singleton and four-theme Vue sidebar passed');app.exit(0);
  }).catch(error=>{console.error(error);app.exit(1);});
}

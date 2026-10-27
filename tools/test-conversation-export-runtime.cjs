const {app,BrowserWindow,dialog}=require('electron');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const ts=require('typescript');
const root=path.resolve(__dirname,'..');const directory=path.join(root,'.tmp','conversation-export-test');fs.mkdirSync(directory,{recursive:true});app.setPath('userData',directory);app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  const {readTelegramConversationIdFromDom}=await import('../dist-electron/shared.js');
  const {conversationExportDay}=await import('../dist-electron/conversation-export-dates.js');
  const source=fs.readFileSync(path.join(root,'src/conversation-export-runtime.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  let {buildConversationExportScript,mergeConversationExportRows,unwrapConversationExportResult}=new Function('readTelegramConversationIdFromDom','conversationExportDay',compiled+';return {buildConversationExportScript,mergeConversationExportRows,unwrapConversationExportResult};')(readTelegramConversationIdFromDom,conversationExportDay);
  if(process.argv.includes('--production')){
    const file=fs.readdirSync(path.join(root,'dist/assets')).find(name=>/^index-.*\.js$/.test(name));
    const artifact=process.argv.find(value=>value.startsWith('--package='))?.slice('--package='.length);
    let bundle=fs.readFileSync(path.join(root,'dist/assets',file),'utf8');
    if(artifact){const asar=require('@electron/asar');const entries=asar.listPackage(artifact);const entry=entries.find(name=>/dist[\\/]assets[\\/]index-[^\\/]+\.js$/.test(name));assert.ok(entry);bundle=asar.extractFile(artifact,entry.replace(/^[/\\]/,'')).toString('utf8');}
    const ast=ts.createSourceFile(file,bundle,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node));
    const builder=functions.find(node=>node.getText(ast).includes('exportResult:')&&node.getText(ast).includes('.toString()'));
    assert.ok(builder,'production export builder must be present');
    const dependencies=[...builder.getText(ast).matchAll(/([\w$]+)\.toString\(\)/g)].map(match=>functions.find(node=>node.name?.text===match[1]));
    assert.ok(dependencies.every(Boolean),'serialized production helpers must be self-contained functions');
    buildConversationExportScript=new Function(dependencies.map(node=>node.getText(ast)).join('\n')+'\n'+builder.getText(ast)+';return '+builder.name.text+';')();
    console.log('Testing serialized export script extracted from production Vite bundle.');
  }
  for(const platform of ['whatsapp','telegram','signal']){
    const win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{sandbox:true,contextIsolation:true}});await win.loadURL('data:text/html,<html><body></body></html>');
    const execute=async script=>{const result=await win.webContents.executeJavaScript(script,true);return result?.exportResult?unwrapConversationExportResult(result):result;};
    const message=(id,text,chinese='')=>platform==='whatsapp'?`<div data-id="false_15550000001@c.us_${id}" class="message-in" style="height:120px"><div data-pre-plain-text="[10:00, 10/12/2026] Customer: "><span class="selectable-text">${text}<div class="df-chat-translation">${chinese}<button>refresh</button></div></span></div></div>`:platform==='telegram'?`<div class="bubble is-in" data-mid="${id}" style="height:120px"><div class="bubble-content"><div class="message"><span class="translatable-message">${text}</span><div class="df-chat-translation">${chinese}<button>refresh</button></div></div></div><span class="time">10:00</span></div>`:`<div class="module-message__wrapper" role="article" aria-labelledby="message-accessibility-contents:${id}"><div class="module-message module-message--incoming" style="height:120px"><div class="module-message__text">${text}</div><div class="module-message__maoyi-translation${chinese?'':' module-message__maoyi-translation--missing'}">${chinese}<button>refresh</button></div></div></div>`;
    const wrap=platform==='whatsapp'?'<div id="main" data-jid="15550000001@c.us">':platform==='telegram'?'<div id="MiddleColumn" data-peer-id="101">':'<div class="ConversationView ConversationPanel"><div class="CompositionArea" data-df-signal-conversation-id="11111111-1111-4111-8111-111111111111"></div>';
    const header=platform==='telegram'?'<div class="chat-info"><span class="title">Fixture</span></div>':'<header><span title="Fixture">Fixture</span></header>';
    const html=wrap+header+'<div id="history" class="scrollable" style="height:200px;overflow-y:auto">'+message('1','Hello','你好')+message('2','Hello')+message('3','Bye')+'</div></div><div class="bubble" data-mid="outside">OTHER CONVERSATION</div>';
    await execute(`document.body.innerHTML=${JSON.stringify(html)};true`);
    await execute(`document.querySelector('#history').scrollTop=42;window.fixtureScrollEvents=0;document.querySelector('#history').addEventListener('scroll',()=>window.fixtureScrollEvents++);true`);
    const scrollBefore=await execute(`document.querySelector('#history').scrollTop`);
    const contact=await execute(buildConversationExportScript({action:'contact',platform}));
    assert.ok(contact.contactId);assert.equal(contact.contactTitle,'Fixture');
    assert.equal(await execute(`document.querySelector('#history').scrollTop`),scrollBefore,'customer identity lookup does not move history');
    assert.equal(await execute(`!!window.__dfConversationExport`),false,'customer lookup does not start an export');
    const begin=await execute(buildConversationExportScript({action:'begin',platform}));assert.ok(begin.contactId);assert.equal(begin.contactTitle,'Fixture');
    assert.equal(contact.contactId,begin.contactId,'customer tracking uses export contact identity');
    await execute(`document.querySelector('#history').insertAdjacentHTML('afterbegin','<div class="time-divider">2026-10-12</div>');true`);
    const snapshot=await execute(buildConversationExportScript({action:'snapshot',platform,expectedId:begin.contactId}));assert.equal(snapshot.rows.length,3);assert.equal(snapshot.rows[0].originalText,'Hello');assert.equal(snapshot.rows[0].chineseText,'你好');assert.equal(snapshot.rows[0].direction,'incoming');
    assert.ok(snapshot.rows.every(row=>conversationExportDay(row.timestamp) === '2026-10-12'),'time-only messages inherit a real day separator');
    const epoch=String(new Date(2026,9,13,12).getTime());
    await execute(`(()=>{const row=document.querySelector('#history ${platform==='signal'?'.module-message':platform==='telegram'?'.bubble':'[data-id]'}');row.setAttribute('data-timestamp',${JSON.stringify(epoch)});return true;})()`);
    const dated=await execute(buildConversationExportScript({action:'snapshot',platform,expectedId:begin.contactId}));assert.equal(conversationExportDay(dated.rows[0].timestamp),'2026-10-13','explicit timestamp takes priority over a day separator');
    if(platform==='whatsapp'){
      await execute(`document.querySelector('#main').removeAttribute('data-jid');document.querySelectorAll('#history [data-id]')[1].setAttribute('data-id','false_15550000001@s.whatsapp.net_2');document.querySelector('#main').insertAdjacentHTML('beforeend','<div style="display:none" data-id="false_15550000002@c.us_hidden">Hidden other chat</div>');true`);
      const aliases=await execute(buildConversationExportScript({action:'snapshot',platform,expectedId:begin.contactId}));
      assert.equal(aliases.contactId,begin.contactId,'same phone with alternate domain must remain one contact');
      assert.equal(aliases.rows.length,3,'hidden messages must not contaminate identity or export');
      await execute("document.querySelector('#main').setAttribute('data-jid','15550000001@c.us');document.querySelectorAll('#history [data-id]')[1].setAttribute('data-id','false_15550000001@c.us_2');true");
      await execute(`document.querySelector('#main').removeAttribute('data-jid');document.querySelector('#history [data-id]').insertAdjacentHTML('beforeend','<div data-testid="quoted-message"><div data-id="false_15550000002@c.us_quoted"><span class="selectable-text">Other contact quote</span></div></div>');true`);
      const quoted=await execute(buildConversationExportScript({action:'snapshot',platform,expectedId:begin.contactId}));assert.equal(quoted.contactId,begin.contactId,'quoted messages cannot contaminate current contact identity');assert.equal(quoted.rows.length,3);
      await execute(`document.querySelector('#history [data-id]').setAttribute('data-id','false_15550000001:7@s.whatsapp.net_1');true`);
      assert.equal((await execute(buildConversationExportScript({action:'contact',platform}))).contactId,begin.contactId,'device-qualified message IDs resolve to the same chat');
      await execute(`document.querySelector('#main').setAttribute('data-jid','pending');document.querySelector('#main header span').setAttribute('data-jid','15550000001@c.us');true`);
      assert.equal((await execute(buildConversationExportScript({action:'contact',platform}))).contactId,begin.contactId,'an invalid root attribute cannot mask a valid current header identity');
      await execute(`document.querySelector('#main').removeAttribute('data-jid');document.querySelector('#main header span').removeAttribute('data-jid');document.querySelector('#main header span').setAttribute('data-id','false_15550000001@c.us_header');true`);
      assert.equal((await execute(buildConversationExportScript({action:'contact',platform}))).contactId,begin.contactId,'serialized header message identity is supported');
      await execute(`document.querySelector('#main header span').removeAttribute('data-id');document.querySelector('[data-testid="quoted-message"]').remove();document.querySelector('#history [data-id]').setAttribute('data-id','false_15550000001@c.us_1');document.querySelector('#main').setAttribute('data-jid','15550000001@c.us');true`);
    }
    await execute(`document.getElementById('history').insertAdjacentHTML('afterbegin',${JSON.stringify(message('0','Earlier'))});true`);
    const older=await execute(buildConversationExportScript({action:'snapshot',platform,expectedId:begin.contactId}));const rows=mergeConversationExportRows(snapshot.rows,older.rows);assert.equal(rows.length,4);assert.equal(rows[0].originalText,'Earlier');assert.equal(rows.filter(r=>r.originalText==='Hello').length,2);
    const change=platform==='whatsapp'?"document.querySelector('#main').setAttribute('data-jid','15550000002@c.us')":platform==='telegram'?"document.querySelector('#MiddleColumn').setAttribute('data-peer-id','202')":"document.querySelector('.CompositionArea').setAttribute('data-df-signal-conversation-id','22222222-2222-4222-8222-222222222222')";
    if(platform==='signal'){
      await execute("document.querySelector('.module-message__wrapper').removeAttribute('aria-labelledby');true");
      const error=await win.webContents.executeJavaScript(buildConversationExportScript({action:'snapshot',platform,expectedId:begin.contactId}),true);
      assert.equal(error.ok,false,'native bridge receives a serialized error instead of a rejected execution');
      assert.match(error.error,/稳定编号/);
      assert.equal(error.errorCode,'message-id-unavailable');
      assert.throws(()=>unwrapConversationExportResult(error),/稳定编号/);
    }
    await execute(change+';true');await assert.rejects(execute(buildConversationExportScript({action:'snapshot',platform,expectedId:begin.contactId})),/联系人已切换/);
    if(platform==='signal'){
      const {renderConversationExport}=await import('../dist-electron/conversation-export-core.js');
      const media=(id,body)=>`<div class="module-message__wrapper" aria-labelledby="message-accessibility-contents:${id}"><div class="module-message module-message--incoming" style="height:120px">${body}</div></div>`;
      const nativeHeader=day=>`<div class="flex justify-center p-5"><div class="type-body-medium"><time datetime="${day}">${day}</time></div></div>`;
      const gif=media('today-gif','<video loop autoplay muted></video>');
      const quoted=media('today-quote','<div class="module-quoted-message"><time datetime="2026-10-01">quoted old date</time></div><div class="module-message__text">Today reply</div><div class="module-message__metadata"><time class="module-message__metadata__date" datetime="2026-10-12T12:00:00">12:00</time></div>');
      const signalHtml=wrap+header+'<div id="history" style="height:200px;overflow-y:auto">'+nativeHeader('2026-10-11')+media('yesterday-gif','<video loop muted></video>')+nativeHeader('2026-10-12')+gif+quoted+'</div></div>';
      await execute(`document.body.innerHTML=${JSON.stringify(signalHtml)};true`);
      const signal=await execute(buildConversationExportScript({action:'begin',platform}));
      assert.equal(signal.rows[0].timestamp,'2026-10-11');assert.equal(signal.rows[1].timestamp,'2026-10-12','first GIF without its own metadata inherits the native Signal day header');
      assert.equal(conversationExportDay(signal.rows[2].timestamp),'2026-10-12','quote time cannot replace the message time');
      const today=renderConversationExport({profileId:'fixture',platform:'signal',contactId:signal.contactId,contactTitle:'Fixture',mode:'english',scope:'today',exportDate:'2026-10-12',coverage:'history-top',coverageNote:'',rows:signal.rows});
      assert.equal(today.count,2);assert.ok(today.content.includes('[视频]'));assert.ok(today.content.includes('Today reply'));assert.ok(!today.content.includes('2026-10-11'));
      await execute(`document.querySelectorAll('#history>.flex').forEach(n=>n.remove());true`);
      const noDate=await execute(buildConversationExportScript({action:'snapshot',platform,expectedId:signal.contactId}));
      assert.equal(noDate.rows[1].timestamp,'','a later dated text cannot assign a date to the preceding GIF');
      assert.throws(()=>renderConversationExport({profileId:'fixture',platform:'signal',contactId:signal.contactId,contactTitle:'Fixture',mode:'english',scope:'today',exportDate:'2026-10-12',coverage:'history-top',coverageNote:'',rows:noDate.rows}),/日期无法识别/);
      console.log('PASS Signal media dates: native date-only time headers, first GIF with collapsed metadata, midnight boundary, quote exclusion and no guessing from later messages');
    }
    win.destroy();
    console.log(`PASS ${platform}: both history pages, repeated text kept, inline cache, UI exclusion, contact-switch abort`);
  }
  const {exportConversationFile}=await import('../dist-electron/conversation-export.js');
  const request={profileId:'fixture',platform:'telegram-k',contactId:'telegram:101',contactTitle:'Fixture',mode:'english',coverage:'partial',coverageNote:'Partial fixture',rows:[{id:'1',direction:'incoming',timestamp:'10:00',originalText:'Hello',chineseText:'你好',mediaLabel:''}]};
  dialog.showSaveDialog=async()=>({canceled:true});assert.equal((await exportConversationFile(request)).saved,false);
  const filename=path.join(directory,'export.txt');let proposedName='';dialog.showSaveDialog=async options=>{proposedName=options.defaultPath;return {canceled:false,filePath:filename};};assert.equal((await exportConversationFile({...request,exportDate:'2026-10-26'})).saved,true);assert.equal(proposedName,'Fixture_20261026.txt');assert.ok(!fs.readFileSync(filename,'utf8').includes('Partial fixture'));assert.match(fs.readFileSync(filename,'utf8'),/对方：Hello/);console.log('PASS export: native cancellation, TXT persistence, contact/date filename and no metadata header');app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});

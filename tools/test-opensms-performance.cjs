const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
  const child = spawn(require('electron'), [__filename], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  const timer = setTimeout(() => { child.kill(); process.exitCode = 1; }, 90000);
  child.on('error', error => { clearTimeout(timer); console.error(error); process.exitCode = 1; });
  child.on('exit', code => { clearTimeout(timer); process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const ts = require('typescript');
  app.setPath('userData', path.join(root, '.tmp', 'opensms-performance-test'));
  app.whenReady().then(async () => {
    const identity = await import('../dist-electron/assistant-material-identity.js');
    const runtimeCode = ts.transpileModule(fs.readFileSync(path.join(root, 'src/opensms-runtime.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const runtime = new Function('exports', 'require', runtimeCode + ';return exports;')({}, () => identity);
    const win = new BrowserWindow({ show: false, width: 1200, height: 850, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
    await win.webContents.session.protocol.handle('https', () => new Response('<!doctype html><html><body></body></html>', { headers: { 'content-type': 'text/html' } }));
    await win.loadURL('https://www.opensms.cc/#/index/chat');
    const execute = script => win.webContents.executeJavaScript(script, true);
    const fixture = `<style>#message-box{height:400px;overflow:auto}.message-content{height:30px}.im-chat-text{padding:4px}.chat-item{height:30px}</style><aside class="left-bar"><span class="avatar-name">TEST_ACCOUNT</span></aside><div class="chat-item active" data-id="a">Contact A</div><div class="im-chat"><div class="im-chat-top"><span class="info-other"><span class="info-value">Contact A</span></span></div><div id="message-box"><ul>${Array.from({ length: 300 }, (_, i) => `<li class="im-chat-other" id="m-${i}"><div class="im-chat-user"><i class="msg-time">2026-11-15 12:00</i></div><div class="im-chat-text"><div class="message-content">English message ${i}</div></div></li>`).join('')}</ul></div><div class="im-chat-footer"><div id="messageTextArea" contenteditable="true"></div><div class="im-chat-send"><button>发送</button></div></div></div>`;
    await execute(`document.body.innerHTML=${JSON.stringify(fixture)};window.testHidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});window.perfCounts={clones:0,rects:0};const clone=Element.prototype.cloneNode,rect=Element.prototype.getBoundingClientRect;Element.prototype.cloneNode=function(...args){if(this.matches('.message-content'))window.perfCounts.clones++;return clone.apply(this,args);};Element.prototype.getBoundingClientRect=function(...args){if(this.matches('.message-content'))window.perfCounts.rects++;return rect.apply(this,args);};true;`);
    // Exercise the actual App executor, including runtime recovery and short calls.
    const appSource = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
    const tree = ts.createSourceFile('App.ts', appSource.slice(appSource.indexOf('>') + 1, appSource.indexOf('</script>')), ts.ScriptTarget.Latest, true);
    const fn = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getRuntimeScriptExecutor');
    const hostCode = ts.transpileModule(fn.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const sent = [];
    const webview = { executeJavaScript(script) { sent.push(Buffer.byteLength(script)); return execute(script); } };
    const generations = new Map();
    const activePanel={value:'session'};
    const executor = new Function('document', 'webRuntimeGenerations', 'webRuntimeControllers', 'window', 'buildOpenSmsRuntimeCheck', 'buildOpenSmsBootstrapScript', 'buildAppleScript', 'withTranslationDeadline', 'signedIn', 'activePanel', 'activeProfileId', 'lockScreenVisible', hostCode + ';return getRuntimeScriptExecutor({id:"android",platform:"opensms"});')(
      { querySelector: () => webview, hidden:false }, generations, new Map(), {}, runtime.buildOpenSmsRuntimeCheck, runtime.buildOpenSmsScript, () => { throw Error('Apple must not run'); }, promise => promise, {value:true}, activePanel, {value:'android'}, {value:false}
    );
    const cmd = command => executor.execute(runtime.buildOpenSmsCommandScript(command));
    const scan = () => cmd({ action: 'scan', options: { limit: 1000, includeAlreadyTranslated: true, viewportScreensAbove: 100, viewportScreensBelow: 100 } });
    await cmd({ action: 'install' });
    assert.equal(sent.filter(bytes => bytes > 10000).length, 1, 'one full install on first use');
    assert.equal((await scan()).length, 300);
    await execute('window.perfCounts={clones:0,rects:0}');
    await scan(); await cmd({ action: 'smart' });
    assert.equal((await execute('window.perfCounts')).clones, 0, 'unchanged messages reuse source metadata');
    assert.ok(sent.at(-1) < 1000, 'steady state uses a short command');
    const changed = await execute(`document.querySelector('#m-299 .message-content').textContent='Updated English message';window.__dfOpenSms.apply({action:'scan',options:{limit:1000,viewportScreensBelow:100,includeAlreadyTranslated:true}})`);
    assert.equal(changed.at(-1).text, 'Updated English message', 'same-task DOM edit is observed before scan');
    assert.equal((await execute('window.perfCounts')).clones, 1, 'only the changed source is reparsed');
    const candidates = await scan();
    await execute('window.perfCounts={clones:0,rects:0};const box=document.getElementById("message-box");box.scrollTop=box.scrollHeight;');
    const batch = candidates.slice(0, 20).map(item => ({ action: 'inject', key: item.key, sourceText: item.text, translation: '测试译文' }));
    const results = await execute(`Promise.all(${JSON.stringify(batch)}.map(command=>window.__dfOpenSms.apply(command)))`);
    assert.ok(results.every(Boolean));
    const batchCounts = await execute('window.perfCounts');
    assert.equal(batchCounts.clones, 0);
    assert.equal(batchCounts.rects, 300, '20 concurrent translations share one geometry scan');
    assert.equal(await execute('document.querySelectorAll(".df-chat-translation").length'), 20);
    assert.ok(await execute('(()=>{const b=document.getElementById("message-box");return b.scrollHeight-b.scrollTop-b.clientHeight<2})()'), 'bottom stays anchored');
    const anchorTop = await execute('(()=>{const b=document.getElementById("message-box"),row=document.getElementById("m-100");b.scrollTop+=row.getBoundingClientRect().top-b.getBoundingClientRect().top;return row.getBoundingClientRect().top;})()');
    await execute(`Promise.all(${JSON.stringify(batch.slice(0, 5).map(item => ({ ...item, translation: 'Longer translation\n'.repeat(8) })))}.map(command=>window.__dfOpenSms.apply(command)))`);
    assert.ok(Math.abs(await execute('document.getElementById("m-100").getBoundingClientRect().top') - anchorTop) < 2, 'reading position survives translations above the viewport');
    await assert.rejects(() => executor.execute('window.failedCommandCount=(window.failedCommandCount||0)+1;throw new Error("expected command failure");'));
    assert.equal(await execute('window.failedCommandCount'), 1, 'a command failure is never replayed as runtime recovery');
    // Changing source or contact before the batch commits must reject stale work.
    assert.equal(await execute(`(()=>{const promise=window.__dfOpenSms.apply(${JSON.stringify({ ...batch[0], translation: 'stale' })});document.querySelector('#m-0 .message-content').textContent='Replacement source';return promise;})()`), false);
    assert.equal(await execute(`(()=>{const promise=window.__dfOpenSms.apply(${JSON.stringify(batch[1])});document.querySelector('.chat-item.active').dataset.id='b';return promise;})()`), false);
    await scan();
    activePanel.value='home';
    await cmd({action:'contact'});
    await execute(`document.getElementById('message-box').querySelector('ul').insertAdjacentHTML('beforeend','<li id="m-new" class="im-chat-other"><div class="im-chat-text"><div class="message-content">New background message</div></div></li>');`);
    await cmd({ action: 'smart' });
    assert.equal(await execute('!!document.querySelector("#m-new .df-chat-refresh-translation")'), false, 'background defers optional UI');
    activePanel.value='session';
    await cmd({action:'contact'});
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(await execute('!!document.querySelector("#m-new .df-chat-refresh-translation")'), true, 'foreground catches up');
    assert.equal(await execute(`(()=>{const promise=window.__dfOpenSms.apply({action:'inject',key:'missing',translation:'disposed'});window.__dfOpenSms.dispose();delete window.__dfOpenSms;return promise;})()`), false, 'dispose settles pending batches');
    await cmd({ action: 'install' });
    assert.equal(sent.filter(bytes => bytes > 10000).length, 2, 'missing runtime is reinstalled');
    await execute('window.__dfOpenSms.version="outdated";true;');
    await cmd({action:'install'});
    assert.equal(sent.filter(bytes => bytes > 10000).length, 3, 'version changes install the current runtime');
    generations.set('android', 1);
    await assert.rejects(() => cmd({ action: 'install' }), /runtime replaced/);
    console.log(JSON.stringify({ messages: 300, unchangedSourceClones: 0, changedSourceClones: 1, batchTranslations: 20, batchGeometryReads: batchCounts.rects, commandBytes: Buffer.byteLength(runtime.buildOpenSmsCommandScript({ action: 'smart' })), fullScriptBytes: Buffer.byteLength(runtime.buildOpenSmsScript({ action: 'smart' })) }));
    win.destroy(); app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}

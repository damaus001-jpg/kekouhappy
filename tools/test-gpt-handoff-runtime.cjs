const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  const child = spawn(require('electron'), [__filename], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const ts = require('typescript');
  app.setPath('userData', path.join(root, '.tmp', 'gpt-handoff-runtime'));
  const timer = setTimeout(() => { console.error('GPT handoff runtime timed out'); app.exit(1); }, 30000);
  function loadRuntime(relative) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    return new Function('exports', js + ';return exports;')({});
  }
  app.whenReady().then(async () => {
    const web = loadRuntime('src/smart-reply-runtime.ts');
    const signal = loadRuntime('src/gpt-handoff-runtime.ts');
    const { handoffChatToGpt } = await import(pathToFileURL(path.join(root, 'dist-electron/gpt-handoff.js')).href);
    const win = new BrowserWindow({show:false, width:1000, height:1200, webPreferences:{sandbox:true, contextIsolation:true}});
    const today = new Date();
    const dayOffset = offset => { const date=new Date(today);date.setDate(date.getDate()+offset);return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); };
    await win.loadURL('data:text/html,<!doctype html><html><body></body></html>');
    const execute = script => win.webContents.executeJavaScript(script, true);
    for (const platform of ['whatsapp', 'telegram']) {
      const rows = Array.from({length:26}, (_, i) => {
        const incoming = i % 2 === 1;
        const text = `Message ${i + 1}, how was your day?`;
        return platform === 'whatsapp'
          ? `<div class="message-${incoming?'in':'out'}" data-id="${incoming?'false':'true'}_sample_${i}"><div data-pre-plain-text="[${i<8?dayOffset(-1):dayOffset(0)}, 10:00 AM] ${incoming?'Alice':'You'}: "><span class="selectable-text copyable-text">${text}</span></div></div>`
          : `<div class="bubble ${incoming?'is-in':'is-out'}" data-mid="${i}"><div class="bubble-content"><div class="message"><span class="translatable-message">${text}</span><time class="time" datetime="${i<8?dayOffset(-1):dayOffset(0)}T10:00:00">10:00</time></div></div></div>`;
      }).join('');
      const html = `<style>.message-in,.message-out,.bubble{min-height:45px;width:600px;padding:4px}</style><main id="main"><header><span title="Alice">Alice</span></header>${rows}</main>`;
      await execute(`document.body.innerHTML=${JSON.stringify(html)};window.__dfConversationSignature='test-contact';window.__dfTranslatorQueue=[];`);
      const installed = await execute(web.buildSmartReplyUiInstallScript(platform));
      assert.equal(installed.state, 'eligible');
      const labels = await execute(`Array.from(document.querySelectorAll('.df-smart-reply-button')).map(b=>b.textContent)`);
      assert.ok(labels.length > 0 && labels.every(label => label === '去GPT'), platform + ': ' + JSON.stringify(installed));
      await execute(`(() => {const b=Array.from(document.querySelectorAll('.df-smart-reply-button')).at(-1);b.dispatchEvent(new Event('pointerdown',{bubbles:true}));b.click();return true;})()`);
      const events = await execute('window.__dfTranslatorQueue');
      assert.equal(events.length, 1, 'pointerdown and click must not copy twice');
      const payload = JSON.parse(events[0].text);
      assert.equal(payload.messages.length, 18);
      assert.equal(payload.messages[0].text, 'Message 9, how was your day?');
      assert.equal(payload.messages.at(-1).speaker, 'other');
      const request = { messages:payload.messages.map(({speaker,text})=>({speaker,text})), latestSpeaker:'other',replyCount:3,outputLanguage:'en-US',allowSensitiveEcho:false };
      let copied = '', opened = false;
      await handoffChatToGpt(request, {
        writeClipboard(value) {copied=value;},
        async showPrompt(count) {assert.equal(count,18);assert.ok(copied.includes('self 表示我方'));return false;},
        async openExternal() {opened=true;}
      });
      assert.equal(opened,false);
      assert.ok(copied.endsWith('请结合以上聊天记录，翻译对方的最后两句话并揣摩其中的意思向我用中文表达清楚。并在记忆功能可用时参考你在 ChatGPT 个性化设置中保存的记忆，为我方生成三组自然、符合上下文的美式英文回复。每组附上忠实、简洁的中文释义。不要编造聊天记录中没有的信息，回复长度和语气要适合当前对话。'));
      await execute(web.buildSmartReplyUiStateScript({ latestMessageKey:payload.latestMessageKey,conversationSignature:'test-contact',state:'idle' }));
      assert.equal(await execute(`Array.from(document.querySelectorAll('.df-smart-reply-button')).at(-1).disabled`),false);

      const fewerRows = Array.from({length:12}, (_, i) => {
        const incoming = i % 2 === 1;
        const text = `Recent ${i + 1}, how was your day?`;
        return platform === 'whatsapp'
          ? `<div class="message-${incoming?'in':'out'}" data-id="${incoming?'false':'true'}_fewer_${i}"><div data-pre-plain-text="[${i<3?dayOffset(-1):dayOffset(0)}, 10:00 AM] ${incoming?'Alice':'You'}: "><span class="selectable-text copyable-text">${text}</span></div></div>`
          : `<div class="bubble ${incoming?'is-in':'is-out'}" data-mid="fewer-${i}"><div class="bubble-content"><div class="message"><span class="translatable-message">${text}</span><time class="time" datetime="${i<3?dayOffset(-1):dayOffset(0)}T10:00:00">10:00</time></div></div></div>`;
      }).join('');
      await execute(`document.body.innerHTML=${JSON.stringify(`<style>.message-in,.message-out,.bubble{min-height:45px;width:600px;padding:4px}</style><main id="main"><header><span title="Alice">Alice</span></header>${fewerRows}</main>`)};window.__dfConversationSignature='test-contact-fewer';window.__dfTranslatorQueue=[];`);
      assert.equal((await execute(web.buildSmartReplyUiInstallScript(platform))).state,'eligible');
      await execute(`(() => {const b=Array.from(document.querySelectorAll('.df-smart-reply-button')).at(-1);b.dispatchEvent(new Event('pointerdown',{bubbles:true}));b.click();return true;})()`);
      const fewerPayload=JSON.parse((await execute('window.__dfTranslatorQueue[0].text')));
      assert.equal(fewerPayload.messages.length,9,'fewer than eighteen messages today includes all of today');
      assert.equal(fewerPayload.messages[0].text,'Recent 4, how was your day?');
    }
    // Native bubble hit testing must survive the large-to-compact layout transition.
    const asar = require('@electron/asar');
    const signalArchive = path.join(root,'.package-staging/signal/resources/app.asar');
    const nativeCss = asar.extractFile(signalArchive,path.join('stylesheets','manifest.css')).toString();
    const bubbleCss = Array.from(nativeCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)).filter(m=>/\.module-message__(?:container|maoyi-smart-reply|metadata|text)/.test(m[1])).map(m=>m[0]).join('\n');
    for(const size of [[1600,1000],[1100,720],[1600,1000],[1100,720]]){
      win.setSize(...size);
      for(const width of [80,100,180,300]){
        await execute(`document.body.innerHTML=${JSON.stringify(`<style>${bubbleCss}</style><div class="module-message module-message--incoming"><div class="module-message__container module-message__container-incoming" style="width:${width}px"><div class="module-message__text module-message__text--incoming">OK</div><button class="module-message__maoyi-smart-reply">去GPT</button><div class="module-message__metadata module-message__metadata--inline"><span>11:59 PM</span></div></div></div>`)};window.nativeGptClicks=0;document.querySelector('button').addEventListener('click',()=>window.nativeGptClicks++);true`);
        await execute(signal.buildSignalGptButtonScript());
        const hit=await execute(`(()=>{const b=document.querySelector('.module-message__maoyi-smart-reply'),r=b.getBoundingClientRect();return {targets:[.25,.5,.75].map(t=>document.elementFromPoint(r.x+r.width/2,r.y+r.height*t)===b),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
        assert.ok(hit.targets.every(Boolean),`native GPT button remains clickable at ${size} / bubble ${width}`);
        win.webContents.sendInputEvent({type:'mouseDown',x:hit.x,y:hit.y,button:'left',clickCount:1});
        win.webContents.sendInputEvent({type:'mouseUp',x:hit.x,y:hit.y,button:'left',clickCount:1});
        await new Promise(resolve=>setTimeout(resolve,20));
        assert.equal(await execute('window.nativeGptClicks'),1,'real mouse input reaches the Signal GPT button once');
      }
    }
    await execute(`document.body.innerHTML='<button class="module-message__maoyi-smart-reply">去GPT</button>';`);
    await execute(signal.buildSignalGptButtonScript());
    assert.equal(await execute(`document.querySelector('button').textContent`),'去GPT');
    await execute(`document.querySelector('button').disabled=true;`);
    assert.equal(await execute(`new Promise(r=>setTimeout(()=>r(document.querySelector('button').textContent),30))`),'复制中…');
    await execute(`document.querySelector('button').disabled=false;document.querySelector('button').textContent='去GPT';`);
    assert.equal(await execute(`new Promise(r=>setTimeout(()=>r(document.querySelector('button').textContent),30))`),'去GPT');
    // Render the real Vue dialog with the production theme stylesheet.
    const appSource=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
    const dialogTemplate=appSource.match(/<div\s+v-if="activeSensitiveDialog"[\s\S]*?<\/section>\s*<\/div>/)?.[0];
    assert.ok(dialogTemplate,'actual themed dialog template');
    await execute(`document.body.innerHTML='<div id="gpt-dialog-test"></div>';const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(root,'src/styles.css'),'utf8'))};document.head.appendChild(style);true`);
    await execute(fs.readFileSync(path.join(root,'node_modules/vue/dist/vue.global.prod.js'),'utf8'));
    await execute(`Vue.createApp({template:${JSON.stringify(dialogTemplate)},setup(){const themeClass=Vue.ref('theme-black-gold'),activeSensitiveDialog=Vue.ref(null),sensitiveDialogBusy=Vue.ref(false);window.dialogTest={themeClass,activeSensitiveDialog,responses:[]};return{themeClass,activeSensitiveDialog,sensitiveDialogBusy,trapSensitiveDialogTab:()=>{},respondSensitiveDialog:response=>{window.dialogTest.responses.push(response);activeSensitiveDialog.value=null;}};}}).mount('#gpt-dialog-test');true`);
    const primaryColors=new Set(),panelColors=new Set();
    for(const theme of ['theme-black-gold','theme-pink','theme-black-gold theme-murong-purple','theme-black-gold theme-clear-water-blue']){
      await execute(`window.dialogTest.themeClass.value=${JSON.stringify(theme)};window.dialogTest.activeSensitiveDialog.value={id:'gpt-theme',title:'去GPT',message:'已复制 18 条聊天记录',detail:'点击打开GPT，然后粘贴并发送。',buttons:['打开GPT','稍后粘贴'],cancelId:1};true`);
      const appearance=await execute(`new Promise(resolve=>requestAnimationFrame(()=>{const card=document.querySelector('.sensitive-dialog-card'),buttons=Array.from(card.querySelectorAll('button'));resolve({primary:getComputedStyle(buttons[0]).backgroundColor,panel:getComputedStyle(card).background,labels:buttons.map(b=>b.textContent),visible:card.getBoundingClientRect().height>0,reachable:buttons.every(button=>{const r=button.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})});}))`);
      assert.deepEqual(appearance.labels,['打开GPT','稍后粘贴']);assert.equal(appearance.visible,true);primaryColors.add(appearance.primary);panelColors.add(appearance.panel);
      assert.equal(appearance.reachable,true,'both GPT dialog buttons fit in the compact window');
      await execute(`document.querySelector('.sensitive-dialog-card button').click();true`);
      assert.equal(await execute(`window.dialogTest.responses.at(-1)`),0);
    }
    assert.equal(primaryColors.size,4,'GPT primary button follows all four themes');assert.equal(panelColors.size,4,'GPT dialog follows all four themes');
    await execute(`window.dialogTest.activeSensitiveDialog.value={id:'gpt-cancel',title:'去GPT',message:'已复制',detail:'',buttons:['打开GPT','稍后粘贴'],cancelId:1};true`);
    await execute(`new Promise(resolve=>requestAnimationFrame(()=>{document.querySelector('.sensitive-dialog-mask').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));resolve(true);}))`);
    assert.equal(await execute(`window.dialogTest.responses.at(-1)`),1,'Escape keeps copied text and cancels browser prompt');
    win.destroy();
    console.log('gpt-handoff-runtime: web clicks, latest-18-today messages, role labels, instruction, cancel, Signal label lifecycle, actual Vue dialog in four themes and Escape passed; system clipboard and browser untouched');
    clearTimeout(timer);
    app.exit(0);
  }).catch(error => {console.error(error);clearTimeout(timer);app.exit(1);});
}

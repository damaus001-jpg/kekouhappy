const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, '.tmp/web-send-guard-test'));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  await window.loadURL('data:text/html,<html><body></body></html>');
  const source = fs.readFileSync(path.join(root, 'electron/webview-send-guard-preload.cjs'), 'utf8').replaceAll('location.hostname', "'web.whatsapp.com'");
  const result = await window.webContents.executeJavaScript(`(() => {
    const messages = [];
    const guard = new Function('require', ${JSON.stringify(source + '\nreturn { handleKeydown, handleBeforeInput, handleCompositionEnd, handlePointerSend, handleTranslationSpace, resetTranslationSpace };')})(() => ({ipcRenderer:{sendToHost:(_channel,payload)=>messages.push(payload)}}));
    const rows = [];
    const test = (name, html, options = {}, expected = true) => {
      document.body.innerHTML = html;
      const composer = document.querySelector('[role="textbox"]');
      composer.focus();
      const before = messages.filter(m=>m.action==='translate').length;
      const event = {isTrusted:true,type:'keydown',key:'Enter',code:'Enter',target:composer,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true},...options};
      guard.handleKeydown(event);
      const blocked = Boolean(event.prevented || event.stopped);
      rows.push({name,blocked,expected,passed:blocked===expected,translations:messages.filter(m=>m.action==='translate').length-before});
    };
    test('original-compose', '<footer><div data-testid="conversation-compose-box-input" contenteditable="true" role="textbox">你好</div></footer>');
    test('footer-without-testid', '<footer><div contenteditable="true" role="textbox">你好</div></footer>');
    test('plaintext-only-composer', '<footer><div contenteditable="plaintext-only" role="textbox">你好</div></footer>');
    test('testid-on-wrapper', '<div data-testid="conversation-compose-box-input"><div contenteditable="true" role="textbox">你好</div></div>');
    test('caption-testid-on-wrapper', '<div role="dialog"><div data-testid="media-caption-input-container"><div contenteditable="true" role="textbox">你好</div></div></div>');
    test('retargeted-enter', '<footer><div contenteditable="true" role="textbox">你好</div></footer>', {target:document});
    test('ime-process-enter', '<footer><div data-testid="conversation-compose-box-input" contenteditable="true" role="textbox">你好</div></footer>', {key:'Process',code:'Enter',keyCode:229,isComposing:true});
    test('ctrl-enter-chinese', '<footer><div data-testid="conversation-compose-box-input" contenteditable="true" role="textbox">你好</div></footer>', {ctrlKey:true});
    test('repeat-enter', '<footer><div contenteditable="true" role="textbox">你好</div></footer>', {repeat:true});
    test('english-native-enter', '<footer><div contenteditable="true" role="textbox">Hello</div></footer>', {}, false);
    test('search-input-unaffected', '<aside><div contenteditable="true" role="textbox" aria-label="Search">你好</div></aside>', {}, false);
    test('shift-enter-newline', '<footer><div data-testid="conversation-compose-box-input" contenteditable="true" role="textbox">你好</div></footer>', {shiftKey:true}, false);
    const composer = document.querySelector('[role="textbox"]');
    const lineBreak = {isTrusted:true,inputType:'insertLineBreak',target:composer,preventDefault(){this.prevented=true},stopPropagation(){},stopImmediatePropagation(){}};
    guard.handleBeforeInput(lineBreak);
    rows.push({name:'shift-enter-beforeinput',blocked:Boolean(lineBreak.prevented),expected:false,passed:!lineBreak.prevented});
    document.body.innerHTML = '<footer><div contenteditable="true" role="textbox">你好</div></footer>';
    const live = document.querySelector('[role="textbox"]');
    live.focus();
    const enter = options => ({isTrusted:true,type:'keydown',key:'Enter',code:'Enter',target:live,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true},...options});
    const first = enter();
    const countBefore = messages.filter(m=>m.action==='translate').length;
    guard.handleKeydown(first);
    const waiting = enter({repeat:true});
    guard.handleKeydown(waiting);
    rows.push({name:'pending-chinese-repeat-deduped',passed:first.prevented===true&&waiting.prevented===true&&messages.filter(m=>m.action==='translate').length-countBefore===1});
    // Simulate the fastest possible successful translation between keydown
    // and keypress, without sending a real message or calling an API.
    live.textContent = 'Hello';
    const held = enter({repeat:true});
    guard.handleKeydown(held);
    const press = enter({type:'keypress'});
    guard.handleKeydown(press);
    const release = enter({type:'keyup'});
    guard.handleKeydown(release);
    rows.push({name:'first-enter-never-sends-fast-result',passed:held.prevented===true&&press.prevented===true&&release.prevented===true});
    const second = enter();
    guard.handleKeydown(second);
    rows.push({name:'second-physical-enter-allows-english',passed:!second.prevented&&!second.stopped});
    live.textContent = 'Hello 你好';
    const mixed = enter();
    guard.handleKeydown(mixed);
    rows.push({name:'mixed-chinese-never-native-send',passed:mixed.prevented===true});
    const spaceEvent = options => ({isTrusted:true,type:'keydown',key:' ',code:'Space',target:live,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true},stopImmediatePropagation(){this.stopped=true},...options});
    const resetSpace = () => guard.resetTranslationSpace({type:'focusout',target:live});
    // Use a fresh draft to avoid the Enter tests' pending-translation cache.
    live.textContent = '双空格翻译';
    resetSpace();
    const spaceBefore = messages.filter(m=>m.action==='translate').length;
    const one = spaceEvent(); guard.handleTranslationSpace(one);
    rows.push({name:'single-space-keeps-normal-input',passed:!one.prevented&&messages.filter(m=>m.action==='translate').length===spaceBefore});
    live.textContent += ' ';
    guard.resetTranslationSpace({type:'input',inputType:'insertText',data:' ',target:live});
    const two = spaceEvent(); guard.handleTranslationSpace(two);
    const three = spaceEvent(); guard.handleTranslationSpace(three);
    rows.push({name:'two-or-more-spaces-translate-once',passed:two.prevented===true&&three.prevented===true&&messages.filter(m=>m.action==='translate').length===spaceBefore+1});
    for (const mode of ['ime','composition-state','repeat','modifier','other-key','edit','blur','pointer']) {
      live.textContent = '测试中文 ' + mode;
      resetSpace();
      const before = messages.filter(m=>m.action==='translate').length;
      guard.handleTranslationSpace(spaceEvent());
      if (mode==='ime') guard.handleTranslationSpace(spaceEvent({isComposing:true,keyCode:229}));
      if (mode==='composition-state') {
        guard.resetTranslationSpace({type:'compositionstart',target:live});
        guard.handleTranslationSpace(spaceEvent());
        guard.resetTranslationSpace({type:'compositionend',target:live});
      }
      if (mode==='repeat') guard.handleTranslationSpace(spaceEvent({repeat:true}));
      if (mode==='modifier') guard.handleTranslationSpace(spaceEvent({ctrlKey:true}));
      if (mode==='other-key') guard.handleTranslationSpace(spaceEvent({key:'a',code:'KeyA'}));
      if (mode==='edit') guard.resetTranslationSpace({type:'input',inputType:'insertFromPaste',target:live});
      if (mode==='blur') guard.resetTranslationSpace({type:'focusout',target:live});
      if (mode==='pointer') guard.resetTranslationSpace({type:'pointerdown',target:live});
      if (mode!=='repeat') guard.handleTranslationSpace(spaceEvent());
      rows.push({name:'space-reset-'+mode,passed:messages.filter(m=>m.action==='translate').length===before});
    }
    live.textContent='Hello'; resetSpace();
    const englishOne=spaceEvent(); guard.handleTranslationSpace(englishOne);
    const englishTwo=spaceEvent(); guard.handleTranslationSpace(englishTwo);
    rows.push({name:'english-double-space-unaffected',passed:!englishOne.prevented&&!englishTwo.prevented});
    return rows;
  })()`);
  const report = path.join(root, '.tmp', process.argv.includes('--baseline') ? 'web-send-guard-baseline.json' : 'web-send-guard-results.json');
  fs.writeFileSync(report, JSON.stringify(result, null, 2));
  for (const row of result) console.log(`${row.passed ? 'PASS' : 'FAIL'} ${row.name}`);
  if (!process.argv.includes('--baseline') && result.some(row => !row.passed)) process.exitCode = 1;
  for (const platform of ['whatsapp', 'telegram']) {
    await window.loadURL('data:text/html,<html><body></body></html>');
    const platformSource = fs.readFileSync(path.join(root, 'electron/webview-send-guard-preload.cjs'), 'utf8')
      .replaceAll('location.hostname', JSON.stringify(platform === 'whatsapp' ? 'web.whatsapp.com' : 'web.telegram.org'));
    await window.webContents.executeJavaScript(`(() => {
      window.guardMessages=[];
      document.body.innerHTML=${JSON.stringify(platform === 'whatsapp'
        ? '<footer><div contenteditable="true" role="textbox">中文测试</div></footer>'
        : '<div class="new-message-wrapper"><div class="input-message-input" contenteditable="true" role="textbox">中文测试</div></div>')};
      new Function('require', ${JSON.stringify(platformSource)})(()=>({ipcRenderer:{sendToHost:(_channel,payload)=>guardMessages.push(payload)}}));
      document.querySelector('[contenteditable]').focus();
    })()`);
    const space = async () => {
      window.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});
      window.webContents.sendInputEvent({type:'char',keyCode:' '});
      window.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
      await new Promise(resolve=>setTimeout(resolve,30));
    };
    await space();
    let count = await window.webContents.executeJavaScript("guardMessages.filter(m=>m.action==='translate').length");
    if (count !== 0) throw new Error(platform + ': first real space translated');
    await space(); await space();
    count = await window.webContents.executeJavaScript("guardMessages.filter(m=>m.action==='translate').length");
    if (count !== 1) throw new Error(platform + ': real double/triple space must translate exactly once, got ' + count);
    console.log('PASS ' + platform + '-physical-double-and-triple-space');
    for (const mode of ['enter', 'space', 'both']) {
      await window.webContents.executeJavaScript(`(() => {
        document.documentElement.dataset.dfInputTrigger=${JSON.stringify(mode)};
        document.querySelector('[contenteditable]').textContent=${JSON.stringify('选择模式中文' + mode)};
        guardMessages=[];
        window.nativeEnters=0;
        document.querySelector('[contenteditable]').onkeydown=e=>{if(e.key==='Enter')nativeEnters++};
      })()`);
      window.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});
      window.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
      await new Promise(resolve=>setTimeout(resolve,30));
      const enterResult=await window.webContents.executeJavaScript("({count:guardMessages.filter(m=>m.action==='translate').length,native:nativeEnters})");
      if(enterResult.native!==0||enterResult.count!==1)throw new Error(platform+' '+mode+' Chinese Enter policy failed');
      await window.webContents.executeJavaScript(`document.querySelector('[contenteditable]').textContent=${JSON.stringify('另一段中文' + mode)};guardMessages=[];document.querySelector('[contenteditable]').dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText'}));`);
      await space();await space();await space();
      const spaceCount=await window.webContents.executeJavaScript("guardMessages.filter(m=>m.action==='translate').length");
      if(spaceCount!==1)throw new Error(platform+' '+mode+' space policy failed');
      console.log('PASS '+platform+'-ignores-legacy-'+mode+'-mode');
    }
    if(platform==='telegram'){
      await window.webContents.executeJavaScript(`(() => {
        document.documentElement.dataset.dfInputTrigger='space';
        const input=document.querySelector('[contenteditable]');input.textContent='编辑器重发输入事件';guardMessages=[];
        document.querySelector('[contenteditable]').dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText'}));
        // Telegram K's editor emits a replacement plain Event after the
        // native input is committed; it has no inputType or data fields.
        input.addEventListener('input',event=>{if(event.isTrusted)queueMicrotask(()=>input.dispatchEvent(new Event('input',{bubbles:true,cancelable:true})));});
      })()`);
      await space();await space();await space();
      const count=await window.webContents.executeJavaScript("guardMessages.filter(m=>m.action==='translate').length");
      if(count!==1)throw new Error('Telegram replacement input event resets the double-space run: translations='+count);
      console.log('PASS telegram-editor-replacement-input-double-space');
      await window.webContents.executeJavaScript(`(()=>{const input=document.querySelector('[contenteditable]');input.textContent='开始新草稿';guardMessages=[];document.querySelector('[contenteditable]').dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText'}));})()`);
      await space();
      await window.webContents.executeJavaScript(`(()=>{const input=document.querySelector('[contenteditable]');input.textContent='外部替换了中文';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await space();
      const changedCount=await window.webContents.executeJavaScript("guardMessages.filter(m=>m.action==='translate').length");
      if(changedCount!==0)throw new Error('Telegram plain input must reset the space run when actual draft changes');
      console.log('PASS telegram-editor-actual-draft-change-resets-space');
    }
  }
  window.destroy();
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => app.exit(process.exitCode || 0));

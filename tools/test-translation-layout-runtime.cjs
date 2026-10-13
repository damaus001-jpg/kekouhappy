const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, '.tmp/translation-layout-test'));
const source = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
const helperSource = ts.transpileModule(fs.readFileSync(path.join(root, 'src/translation-layout-runtime.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
const helper = new Function('exports', helperSource + ';return exports.installTranslationLayoutWatchersFromDom;')({});
const start = source.indexOf('function buildCachedTranslationRuntimeScript(');
const end = source.indexOf('function buildWebBubbleRefreshStateScript(', start);
assert.ok(start >= 0 && end > start);
const compiled = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const build = new Function('installTranslationLayoutWatchersFromDom', 'browserRenderCacheEntryLimit', compiled + ';return buildCachedTranslationRuntimeScript;')(helper, 1500);
const smartSource = ts.transpileModule(fs.readFileSync(path.join(root, 'src/smart-reply-runtime.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
const smart = new Function('exports', smartSource + ';return exports;')({});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = text => { let value = 2166136261; for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619); return (value >>> 0).toString(36); };
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const js = code => win.webContents.executeJavaScript(code);
  for (const platform of ['whatsapp', 'telegram']) {
    await win.loadURL('data:text/html,<html><body></body></html>');
    win.webContents.setZoomFactor(1);
    const text = 'How was your day today?';
    const row = platform === 'whatsapp'
      ? `<main id="main"><div class="message-in" data-id="false_contact_1"><span id="text" class="selectable-text copyable-text">${text}</span></div></main>`
      : `<div class="bubble is-in" data-mid="1"><div class="bubble-content"><div class="message"><span id="text" class="translatable-message">${text}</span></div></div></div>`;
    await js(`document.body.innerHTML=${JSON.stringify('<style>#text{display:block;width:350px;min-height:24px;visibility:hidden}</style>' + row)};`);
    await js(build(platform, [{ sourceHash: hash(text), translatedText: '今天过得怎么样？' }]));
    await wait(1800);
    // Prevent DOM insertion/removal observers from masking a missing layout trigger.
    await js('window.__dfCachedTranslationObserver.disconnect();');
    const count = () => js('document.querySelectorAll(".df-chat-translation").length');
    const restored = async label => {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline && await count() !== 1) await wait(100);
      assert.equal(await count(), 1, platform + ': ' + label);
    };
    assert.equal(await count(), 0);
    await js('document.getElementById("text").style.visibility="visible";');
    win.setSize(platform === 'whatsapp' ? 1100 : 1000, 850);
    await restored('resize restores cached translation');
    await wait(1700);
    await js('document.querySelector(".df-chat-translation").remove();document.dispatchEvent(new Event("fullscreenchange"));');
    await restored('fullscreen event restores missing child despite retained cache marker');
    for (const scale of [1.5, 1.25]) {
      await wait(1700);
      await js('document.querySelector(".df-chat-translation").remove();');
      win.webContents.setZoomFactor(scale);
      await restored('Chromium scaling ' + scale + ' restores translation');
    }
    assert.equal(await js('Object.keys(window.__dfCachedTranslationByHash).length'), 1);
    assert.equal(await js('(window.__dfTranslatorQueue||[]).length'), 0);
    console.log(platform + ': resize, fullscreen notification, 150%/125% Chromium zoom replay passed; cache retained and no translation request queued.');
    if (platform === 'telegram') {
      await js(`window.__dfConversationSignature='telegram:123';window.__dfCachedTranslationObserver.observe(document.body,{childList:true,subtree:true});`);
      await js(smart.buildSmartReplyUiInstallScript('telegram'));
      assert.equal(await js('document.querySelectorAll(".df-smart-reply-button").length'), 1);
      await js(`window.savedSmartButton=document.querySelector('.df-smart-reply-button');window.savedTranslation=document.querySelector('.df-chat-translation');window.translationWrites=0;window.writeObserver=new MutationObserver(records=>{window.translationWrites+=records.filter(record=>record.target.closest?.('.df-chat-translation')).length;});window.writeObserver.observe(document.body,{childList:true,subtree:true});window.__dfApplyCachedTranslationsBurst();`);
      await wait(2200);
      assert.equal(await js('window.translationWrites'), 0, 'identical cached replay must not rewrite its own DOM');
      assert.equal(await js('window.savedSmartButton===document.querySelector(".df-smart-reply-button")'), true);
      await js(build(platform, [{ sourceHash: hash(text), translatedText: '今天过得好不好？' }]));
      await wait(1500);
      assert.equal(await js('window.savedTranslation===document.querySelector(".df-chat-translation")'), true);
      assert.equal(await js('window.savedSmartButton===document.querySelector(".df-smart-reply-button")'), true, 'updated translation retains smart reply button and handler');
      await js('window.translationWrites=0;');
      await wait(800);
      assert.equal(await js('window.translationWrites'), 0, 'updated translation settles without a mutation loop');
      await js('window.savedSmartButton.click();');
      assert.equal(await js('(window.__dfTranslatorQueue||[]).filter(event=>event.action==="smart-reply-request").length'), 1, 'retained smart reply remains clickable');
      console.log('Telegram: unchanged replay is stable; updated cached text retains the smart reply button and click handler.');
    }
  }
  await win.loadURL('data:text/html,<html><body></body></html>');
  await js(`window.replays=0;window.cleanup=(${helper.toString()})(()=>window.replays++);document.dispatchEvent(new Event('fullscreenchange'));window.cleanup();`);
  await wait(1800);
  assert.equal(await js('window.replays'), 0, 'cleanup cancels pending retries');
  await js("document.dispatchEvent(new Event('fullscreenchange'));");
  win.setSize(900, 700);
  await wait(300);
  assert.equal(await js('window.replays'), 0, 'cleanup removes listeners');
  console.log('Layout watcher cleanup passed. Windows physical display DPI still requires live verification.');
  win.destroy();
}).catch(error => { console.error(error); process.exitCode = 1; }).finally(() => app.exit(process.exitCode || 0));

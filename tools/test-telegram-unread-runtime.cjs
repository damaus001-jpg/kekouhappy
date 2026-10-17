const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

if (!process.versions.electron) {
  const { spawn } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  const child = spawn(require('electron'), [__filename], {
    cwd: path.resolve(__dirname, '..'), env, windowsHide: true, stdio: 'inherit'
  });
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const root = path.resolve(__dirname, '..');
  app.setPath('userData', path.join(root, '.tmp', 'telegram-unread-test'));
  app.whenReady().then(async () => {
    const source = fs.readFileSync(path.join(root, 'src', 'App.vue'), 'utf8');
    const builder = source.slice(source.indexOf('function buildUnreadScanScript('), source.indexOf('\nfunction buildMessageScanScript('));
    const build = new Function(builder.replace('app: RuntimeApp', 'app') + ';return buildUnreadScanScript;')();
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
    await win.loadURL('data:text/html,<!doctype html><html><head><style>.ChatBadge_unread_x{display:inline-block;min-width:14px;min-height:14px}</style></head><body></body></html>');
    const execute = script => win.webContents.executeJavaScript(script, true);
    const scan = () => execute(build('telegram'));
    const fixture = async (html, reset = true) => {
      await execute(`document.title = 'Telegram'; document.body.innerHTML = ${JSON.stringify(html)}; ${reset ? 'delete window.__dfTelegramUnarchivedUnreadStateV3;' : ''} true`);
    };
    await fixture('<div class="chat-list"><div class="Chat ListItem"><div class="ChatBadge_badge_x ChatBadge_unread_x">3</div></div><div class="Chat ListItem"><div class="ChatBadge_badge_x ChatBadge_unread_x"></div></div></div>');
    assert.equal((await scan()).count, 4, 'A: hyphenated chat-list and empty unread mark must be detected');
    await fixture('<div class="chatlist"><a class="chatlist-chat" data-peer-id="11"><span class="badge">2</span></a><a class="chatlist-chat" data-peer-id="22"><span class="badge">5</span></a></div>');
    assert.equal((await scan()).count, 7, 'K: direct chatlist links must be detected without role or li');
    await fixture('<ul class="chatlist"><li><a class="chatlist-chat" data-peer-id="11"><span class="badge">2</span></a></li></ul>');
    assert.equal((await scan()).count, 2, 'nested selectors must count a contact once');
    await fixture('<div class="chat-list"><div class="ListItem"><span class="avatar-badge">9</span><span class="ChatBadge_badge_x ChatBadge_pinned_x">8</span><span class="ChatBadge_badge_x ChatBadge_mention_x">7</span><span class="badge-wrapper"><span class="ChatBadge_unread_x">2</span><span class="ChatBadge_mention_x">6</span></span></div></div>');
    assert.equal((await scan()).count, 2, 'pins, mentions, avatar badges and wrappers must not inflate unread messages');
    await fixture('<div class="chat-list"><div class="ListItem chat-item-archive"><span class="fullName">Archived Chats</span><span class="badge">20</span><span>Preview</span></div><div class="ListItem"><span class="badge">3</span></div></div>');
    assert.equal((await scan()).count, 3, 'archive aggregate must be excluded even when it includes a preview');
    await fixture('<header>Archived Chats</header><div data-folder-id="1" class="chat-list"><div class="ListItem"><span class="badge">20</span></div></div>', false);
    assert.equal((await scan()).count, 3, 'opening archive must retain the confirmed unarchived total');
    await fixture('<div class="chat-list"><div class="ListItem">Read contact</div><div class="ListItem" style="display:none"><span class="badge">9</span></div></div>', false);
    assert.equal((await scan()).count, 0, 'reading messages must clear count and hidden rows must not count');
    await fixture('<div class="chatlist"><a class="chatlist-chat" data-peer-id="31"><span class="badge">4</span></a></div>');
    assert.equal((await scan()).count, 4);
    await fixture('<div class="loading">Loading chats</div>', false);
    assert.equal((await scan()).count, 4, 'temporary list unmount must not erase an existing notification');
    await fixture('<main>Conversation in narrow layout</main>');
    await execute("document.title='(6) Telegram'");
    assert.equal((await scan()).count, 6, 'native unread title must work when the list is not mounted');
    await execute("document.title='Telegram (7)'");
    assert.equal((await scan()).count, 7, 'alternate native unread title must work');
    await execute("document.title='Telegram'");
    assert.equal((await scan()).count, 0, 'native title returning to read state clears the narrow-layout badge');
    assert.equal((await scan()).ready, true);
    await fixture('<div class="chatlist" style="display:none"><a class="chatlist-chat"><span class="badge">8</span></a></div>');
    await execute("document.title='(8) Telegram'");
    assert.equal((await scan()).count, 8, 'hidden sidebar must not suppress a native unread signal');
    await fixture('<main>Loading chats</main>');
    assert.equal((await scan()).ready, false, 'an unreadable initial page must not publish a confirmed zero');
    await fixture('<div data-filter-id="1" class="chatlist"><a class="chatlist-chat"><span class="badge">5</span></a></div>');
    assert.equal((await scan()).count, 5, 'custom chat filter IDs must not be mistaken for the archive');
    await fixture('<div class="chatlist"><div class="dialogs-wrapper"><a class="chatlist-chat" data-peer-id="1"><span class="badge">2</span></a><a class="chatlist-chat" data-peer-id="2"><span class="badge">3</span></a></div></div>');
    assert.equal((await scan()).count, 5, 'a dialog container must not merge several independent chat rows');
    await fixture('<div class="chat-list"><div class="ListItem chat-item-archive"><span class="fullName">Archived Chats</span><span class="badge">20</span></div><div class="ListItem"><span class="badge">3</span></div></div>');
    assert.equal((await scan()).count, 3);
    await fixture('<main>Conversation in narrow layout</main>', false);
    await execute("document.title='(23) Telegram'");
    assert.equal((await scan()).count, 3, 'known archived unread must not contaminate native title fallback');
    await fixture('<div data-folder-id="1" class="chatlist"><a class="chatlist-chat"><span class="badge">20</span></a></div>', false);
    assert.equal((await scan()).count, 3, 'archive view without a header must retain normal-chat unread');
    await fixture('<header style="display:none">Archived Chats</header><div class="chatlist"><a class="chatlist-chat"><span class="badge">2</span></a></div>');
    assert.equal((await scan()).count, 2, 'hidden archive headings must not freeze a live main-list counter');
    await fixture('<div class="chatlist"><a class="chatlist-chat">All messages read</a></div>', false);
    assert.equal((await scan()).count, 0, 'confirmed read state clears the fallback and retained count');

    const ts = require('typescript');
    const sidebarButton = source.match(/<button type="button" class="app-short tg"[\s\S]*?<\/button>/)[0];
    const aggregate = source.slice(source.indexOf('const unreadCountsByApp = computed'), source.indexOf('const totalUnreadCount = computed'));
    const accessors = source.slice(source.indexOf('function unreadCountForProfile('), source.indexOf('function clearUnreadState('));
    const hostCode = ts.transpileModule(`${aggregate}\n${accessors}`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    await execute(fs.readFileSync(require.resolve('vue/dist/vue.global.prod.js'), 'utf8'));
    await execute(`
      document.body.innerHTML='<div class="runtime-side" id="sidebar"></div>';
      const style=document.createElement('style');style.textContent=${JSON.stringify(fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8'))};document.head.appendChild(style);
      const {ref,computed}=Vue;
      const profiles=ref([{id:'tg-a',platform:'telegram-a'},{id:'tg-k',platform:'telegram-k'},{id:'wa',platform:'whatsapp'}]);
      const unreadCounts=ref({});
      const appForPlatform=platform=>platform.startsWith('telegram')?'telegram':platform;
      ${hostCode}
      window.__setUnread=setUnreadCount;
      Vue.createApp({setup:()=>({currentApp:ref('whatsapp'),multiTelegramIcon:'',unreadCountForApp,selectRuntimeApp:()=>{}}),template:${JSON.stringify(sidebarButton)}}).mount('#sidebar');
      true;
    `);
    const sidebar = () => execute(`(()=>{const button=document.querySelector('.app-short.tg'),dot=button.querySelector('.app-unread-dot');return {unread:button.classList.contains('unread'),dot:Boolean(dot),buttonAnimation:getComputedStyle(button).animationName,dotAnimation:dot?getComputedStyle(dot).animationName:''}})()`);
    assert.equal((await sidebar()).dot, false);
    await execute("window.__setUnread('tg-k',3); true");
    assert.deepEqual(await sidebar(), {unread:true,dot:true,buttonAnimation:'appUnreadPulse',dotAnimation:'appUnreadDotBlink'});
    await execute("window.__setUnread('tg-a',2); window.__setUnread('tg-k',0); true");
    assert.equal((await sidebar()).dot, true, 'another Telegram account keeps the app indicator active');
    await execute("window.__setUnread('tg-a',0); window.__setUnread('wa',8); true");
    assert.equal((await sidebar()).dot, false, 'reading every Telegram account clears its dot even if WhatsApp is unread');
    win.destroy();
    console.log('telegram-unread-runtime: A/K badges, native title, hidden/loading lists, archive, filters, clear and actual Vue sidebar dot/animations passed');
    app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}

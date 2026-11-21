const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(require('electron'), [__filename], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  fs.mkdirSync(path.join(root, '.tmp'), { recursive: true });
  app.setPath('userData', fs.mkdtempSync(path.join(root, '.tmp', 'backend-menu-')));
  const timeout = setTimeout(() => { console.error('backend8070-menu timeout'); app.exit(1); }, 45000);
  app.whenReady().then(async () => {
    const ts = require('typescript');
    const source = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
    const script = source.slice(source.indexOf('>') + 1, source.indexOf('</script>'));
    const ast = ts.createSourceFile('App.ts', script, ts.ScriptTarget.Latest, true);
    const variables = ['backend8070Menu', 'backend8070Busy', 'backend8070Result', 'backend8070StateText'];
    const functions = ['controlBackend8070', 'showBackend8070Menu', 'closeBackend8070Menu', 'backend8070OutsidePointer', 'backend8070Escape'];
    const selected = ast.statements.filter(node =>
      ts.isFunctionDeclaration(node) && functions.includes(node.name?.text) ||
      ts.isVariableStatement(node) && node.declarationList.declarations.some(d => variables.includes(d.name.getText(ast))));
    assert.equal(selected.length, variables.length + functions.length);
    const extracted = ts.transpileModule(selected.map(node => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const centerIcon = source.match(/<span class="app-logo"[^>]+>[\s\S]*?<\/span>/)[0];
    const sidebar = source.match(/<button type="button" class="app-short sms"[\s\S]*?<\/button>/)[0];
    const menu = source.slice(source.lastIndexOf('<Teleport to="body">'), source.lastIndexOf('</Teleport>') + '</Teleport>'.length);
    const win = new BrowserWindow({ show: false, width: 700, height: 600, webPreferences: { contextIsolation: true, sandbox: true } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><body><div id="fixture"></div></body></html>'));
    const exec = code => win.webContents.executeJavaScript(code, true);
    await exec(fs.readFileSync(require.resolve('vue/dist/vue.global.prod.js'), 'utf8') + ';true');
    const template = '<div class="test-center">' + centerIcon + '</div><div class="test-sidebar">' + sidebar + '</div>' + menu;
    await exec(`window.calls=[];window.result={ok:true,state:'stopped',message:'后台已关闭'};window.chatTranslator={controlBackend8070:action=>{window.calls.push(action);return new Promise(resolve=>window.release=()=>resolve(window.result));}};
      Vue.createApp({template:${JSON.stringify(template)},setup(){
        const {ref,computed,nextTick}=Vue,signedIn=ref(true),lockScreenVisible=ref(false),currentApp=ref('opensms'),themeClass=ref('theme-black-gold');
        const tile={app:'opensms',icon:'',label:'打新增'},opensmsIcon='',unreadCountForApp=()=>0,showWhatsAppFilterMenu=()=>{},closeWhatsAppFilterMenu=()=>{};
        const openAppEntry=()=>window.leftClicks=(window.leftClicks||0)+1;
        ${extracted}
        window.addEventListener('pointerdown',backend8070OutsidePointer,true);window.addEventListener('keydown',backend8070Escape);
        window.testMenu=backend8070Menu;window.testTheme=themeClass;
        return {tile,currentApp,themeClass,opensmsIcon,unreadCountForApp,showWhatsAppFilterMenu,openAppEntry,backend8070Menu,backend8070Busy,backend8070Result,backend8070StateText,showBackend8070Menu,controlBackend8070};
      }}).mount('#fixture');true`);
    const wait = async expression => {
      for (let i = 0; i < 100; i++) { if (await exec(expression)) return; await new Promise(resolve => setTimeout(resolve, 20)); }
      throw new Error('UI condition failed: ' + expression);
    };
    const open = async selector => { await exec(`document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));true`); await wait(`!!document.querySelector('.backend8070-menu')`); };
    for (const selector of ['.app-logo', '.app-short.sms']) {
      await open(selector);
      assert.equal(await exec('window.leftClicks||0'), 0, 'right click preserves the left-click action');
      assert.equal(await exec(`Array.from(document.querySelectorAll('[role="menuitem"]')).every(b=>b.disabled)`), true);
      await exec('window.release();true'); await wait(`!document.querySelector('[role="menuitem"]').disabled`);
      await exec(`window.result={ok:true,state:'running',message:'后台运行中'};document.querySelector('[role="menuitem"]').click();true`);
      await wait(`document.querySelector('[role="status"]').textContent.includes('启动中')`);
      assert.equal(await exec(`Array.from(document.querySelectorAll('[role="menuitem"]')).every(b=>b.disabled)`), true);
      await exec('window.release();true'); await wait(`document.querySelector('[role="status"]').textContent.includes('后台运行中')`);
      assert.equal(await exec(`document.querySelector('[role="menuitem"]').disabled`), true);
      await exec(`window.result={ok:true,state:'stopped',message:'后台已关闭'};document.querySelectorAll('[role="menuitem"]')[1].click();true`);
      await wait(`document.querySelector('[role="status"]').textContent.includes('关闭中')`);
      await exec('window.release();true'); await wait(`document.querySelector('[role="status"]').textContent.includes('后台已关闭')`);
      await exec(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));true`); await wait(`!document.querySelector('.backend8070-menu')`);
    }
    assert.deepEqual(await exec('window.calls'), ['status','start','stop','status','start','stop']);
    for (const theme of ['theme-black-gold', 'theme-pink', 'theme-black-gold theme-murong-purple', 'theme-black-gold theme-clear-water-blue']) {
      await exec(`window.testTheme.value=${JSON.stringify(theme)};window.result={ok:false,state:'unknown',code:'MISSING_FILES',message:'安装文件缺失'};true`);
      await open('.app-logo'); await exec('window.release();true'); await wait(`document.querySelector('[role="status"]').textContent.includes('安装文件缺失')`);
      assert.equal(await exec(`Array.from(document.querySelectorAll('[role="menuitem"]')).every(b=>b.disabled)`), true);
      assert.equal(await exec(`document.querySelector('.backend8070-menu').className.includes(${JSON.stringify(theme)})`), true);
      await exec(`document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));true`); await wait(`!document.querySelector('.backend8070-menu')`);
    }
    await exec(`document.querySelector('.app-short.sms').click();true`); assert.equal(await exec('window.leftClicks'), 1);
    clearTimeout(timeout); win.destroy(); console.log('backend8070-menu: both actual icon templates, status/start/stop, shared busy state, missing files, four themes, Escape/outside dismissal and preserved left-click passed'); app.exit(0);
  }).catch(error => { clearTimeout(timeout); console.error(error); app.exit(1); });
}

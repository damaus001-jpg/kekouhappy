const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');

if (!process.versions.electron) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  const child = spawn(require('electron'), [__filename], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  child.on('error', error => { console.error(error); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  const ts = require('typescript');
  app.setPath('userData', path.join(root, '.tmp', 'whatsapp-contact-resize-test'));
  app.whenReady().then(async () => {
    const source = fs.readFileSync(path.join(root, 'src', 'whatsapp-contact-list-resize-runtime.ts'), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const { buildWhatsAppContactListResizeScript } = new Function('exports', compiled + ';return exports;')({});
    const win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { sandbox: true, contextIsolation: true } });
    await win.webContents.session.protocol.handle('https', () => new Response('<html><head></head><body style="margin:0"></body></html>', { headers: { 'content-type': 'text/html' } }));
    await win.loadURL('https://web.whatsapp.com/');
    const execute = script => win.webContents.executeJavaScript(script, true);
    await execute(`localStorage.setItem('df-whatsapp-contact-list-width-v1','300');document.body.innerHTML='<div class="layout" style="position:relative;display:flex;width:1000px;height:700px"><div id="column" style="box-sizing:border-box;flex:0 0 420px;width:420px;height:700px"><div class="side" style="height:100%"><div id="pane-side" style="height:100%"></div></div></div><div id="conversation" style="flex:1;height:700px"></div><div id="default-border" style="position:absolute;left:0;top:0;box-sizing:border-box;width:420px;height:700px;border-right:1px solid #888;pointer-events:none"></div><div id="default-seam" style="position:absolute;left:419.5px;top:0;width:1px;height:700px;background:#888;pointer-events:none"></div></div>';true`);
    await execute(buildWhatsAppContactListResizeScript());
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = await execute(`(()=>({columnWidth:Math.round(document.querySelector('#column').getBoundingClientRect().width),borderOwnerWidth:Math.round(document.querySelector('#default-border').getBoundingClientRect().width),borderWidth:document.querySelector('#default-border').style.borderRightWidth,seamCenter:Math.round((document.querySelector('#default-seam').getBoundingClientRect().left+document.querySelector('#default-seam').getBoundingClientRect().right)/2),seamDisplay:getComputedStyle(document.querySelector('#default-seam')).display}))()`);
    if (result.columnWidth !== 300 || result.borderOwnerWidth !== 300 || result.borderWidth !== '1px' || result.seamCenter !== 300 || result.seamDisplay === 'none') {
      throw new Error('Default-width seam synchronization failed: ' + JSON.stringify(result));
    }
    win.destroy();
    console.log('whatsapp-contact-resize: resized pane moves the visible border and detached seam to its new edge');
    app.exit(0);
  }).catch(error => { console.error(error); app.exit(1); });
}

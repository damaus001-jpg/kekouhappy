// Isolated verification of the Apple/8070 webview keep-alive policy:
// the production main process attaches Apple-partition webviews with
// background throttling disabled while other platform webviews keep
// Electron's default, and unregistered partitions stay blocked.
//
// The production listeners are extracted from electron/main.ts source and
// replayed inside real hidden BrowserWindows with a real <webview> attach.
// One webview per window keeps the harness deterministic under Electron 43.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
  const resultPath = path.join(root, '.tmp', 'apple-background-throttling-test', 'result.txt');
  try { fs.mkdirSync(path.dirname(resultPath), { recursive: true }); fs.rmSync(resultPath, { force: true }); } catch {}
  const child = spawn(require('electron'), [__filename], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
  const timeout = setTimeout(() => { child.kill(); process.exitCode = 1; }, 90_000);
  child.on('error', error => { clearTimeout(timeout); console.error(error); process.exitCode = 1; });
  child.on('exit', code => {
    clearTimeout(timeout);
    process.exitCode = code ?? 1;
    try { if (fs.existsSync(resultPath)) console.log(fs.readFileSync(resultPath, 'utf8').trim()); } catch {}
  });
} else {
  const { app, BrowserWindow, session } = require('electron');
  app.setPath('userData', path.join(root, '.tmp', 'apple-background-throttling-test'));
  const resultPath = path.join(root, '.tmp', 'apple-background-throttling-test', 'result.txt');
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const record = (line) => { try { fs.appendFileSync(resultPath, line + '\n'); } catch {} };

  // Extract the two production statements verbatim from electron/main.ts.
  const source = fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8');
  function extractListenerStatement(eventName) {
    const marker = `on('${eventName}',`;
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `missing ${eventName} listener in main.ts`);
    // Start inside the .on(...) call's opening parenthesis.
    let depth = 1;
    let quote = '';
    for (let i = start + marker.length; i < source.length; i += 1) {
      const ch = source[i];
      if (quote) {
        if (ch === '\\') { i += 1; continue; }
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
      if (ch === '(' || ch === '{' || ch === '[') depth += 1;
      else if (ch === ')' || ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) {
          const end = source.indexOf(';', i);
          assert.ok(end > i, `unterminated ${eventName} listener in main.ts`);
          return `mainWindow.webContents.${source.slice(start, end + 1)}`;
        }
      }
    }
    throw new Error(`unbalanced ${eventName} listener in main.ts`);
  }
  const willAttachStatement = extractListenerStatement('will-attach-webview');
  const didAttachStatement = extractListenerStatement('did-attach-webview');
  assert.ok(willAttachStatement.includes('backgroundThrottling = false'), 'will-attach must disable apple throttling');
  assert.ok(didAttachStatement.includes('setBackgroundThrottling(false)'), 'did-attach must enforce apple throttling off');
  assert.ok(didAttachStatement.includes("sessionPolicies.get(guestContents.session) === 'apple'"), 'did-attach must scope the policy to apple sessions');

  app.whenReady().then(async () => {
    // Keep the process alive between scenario windows; this harness controls
    // its own exit explicitly after all scenarios finish.
    app.on('window-all-closed', () => {});
    const applePartition = 'persist:apple-bg-throttle-verify';
    const controlPartition = 'persist:control-bg-throttle-verify';
    const appleSession = session.fromPartition(applePartition);
    const controlSession = session.fromPartition(controlPartition);
    // Keep the isolated guests from reaching the real 8070 backend or network.
    for (const ses of [appleSession, controlSession]) {
      ses.webRequest.onBeforeRequest(() => ({ cancel: true }));
    }
    const partitionPolicies = new Map([[applePartition, 'apple'], [controlPartition, 'whatsapp']]);
    const sessionPolicies = new Map([[appleSession, 'apple'], [controlSession, 'whatsapp']]);
    const isAllowedPlatformUrl = (platform, src) => {
      if (platform === 'apple') return new URL(src).origin === 'http://127.0.0.1:8070' && !new URL(src).username && !new URL(src).password;
      return true;
    };

    // Bind the production listeners against stub dependencies.
    const captured = {};
    const mainWindowStub = { webContents: { on: (name, listener) => { captured[name] = listener; } } };
    new Function('mainWindow', 'partitionPolicies', 'sessionPolicies', 'isAllowedPlatformUrl', 'webviewSendGuardPreloadPath',
      `${willAttachStatement}\n${didAttachStatement}`)(
      mainWindowStub, partitionPolicies, sessionPolicies, isAllowedPlatformUrl, path.join(root, 'electron/webview-send-guard-preload.cjs')
    );
    assert.equal(typeof captured['will-attach-webview'], 'function');
    assert.equal(typeof captured['did-attach-webview'], 'function');

    const productionHandlers = {
      'will-attach-webview': captured['will-attach-webview'],
      'did-attach-webview': captured['did-attach-webview']
    };
    const allowOnly = {
      'will-attach-webview': (event, _webPreferences, params) => {
        const platform = partitionPolicies.get(params.partition || '');
        if (!platform || !isAllowedPlatformUrl(platform, params.src || '')) { event.preventDefault(); return; }
      },
      'did-attach-webview': () => {}
    };

    let httpHandlerInstalled = false;
    async function runScenario({ name, partition, src, handlers, expectAttach, expectThrottling }) {
      const win = new BrowserWindow({
        show: false, width: 900, height: 700,
        webPreferences: { webviewTag: true, sandbox: true, contextIsolation: true, nodeIntegration: false }
      });
      if (!httpHandlerInstalled) {
        await win.webContents.session.protocol.handle('http', (request) => {
          const url = new URL(request.url);
          const fixture = `<!doctype html><html><body><webview partition="${url.searchParams.get('partition') || ''}" src="${url.searchParams.get('src') || ''}"></webview></body></html>`;
          return new Response(fixture, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        });
        httpHandlerInstalled = true;
      }
      win.webContents.on('will-attach-webview', handlers['will-attach-webview']);
      win.webContents.on('did-attach-webview', handlers['did-attach-webview']);
      const attached = [];
      win.webContents.on('did-attach-webview', (_event, guest) => {
        attached.push({ platform: sessionPolicies.get(guest.session) || 'unknown', throttling: guest.getBackgroundThrottling() });
      });
      await win.loadURL(`http://127.0.0.1:8097/?partition=${encodeURIComponent(partition)}&src=${encodeURIComponent(src)}`);
      await pause(expectAttach ? 400 : 4_000);
      assert.equal(attached.length, expectAttach ? 1 : 0, `${name}: ${expectAttach ? 'guest must attach' : 'unregistered partition must stay blocked'}`);
      if (expectAttach) {
        assert.equal(attached[0].throttling, expectThrottling, `${name}: background throttling ${expectThrottling ? 'kept default' : 'disabled'}`);
      }
      win.destroy();
      await pause(150);
      record(`scenario ${name}: ${expectAttach ? `attached, throttling=${expectThrottling}` : 'blocked'}`);
    }

    // 0. Production listeners on a fresh window: other platforms keep default.
    await runScenario({ name: 'production-control-first', partition: controlPartition, src: 'http://127.0.0.1:8089/', handlers: productionHandlers, expectAttach: true, expectThrottling: true });

    // 1. Production listeners: apple guest must attach with throttling off.
    await runScenario({ name: 'production-apple', partition: applePartition, src: 'http://127.0.0.1:8070/', handlers: productionHandlers, expectAttach: true, expectThrottling: false });

    // 2. will-attach preference mutation alone (primary mechanism).
    await runScenario({ name: 'will-attach-only', partition: applePartition, src: 'http://127.0.0.1:8070/', handlers: {
      'will-attach-webview': (event, webPreferences, params) => {
        const platform = partitionPolicies.get(params.partition || '');
        if (!platform || !isAllowedPlatformUrl(platform, params.src || '')) { event.preventDefault(); return; }
        if (platform === 'apple') webPreferences.backgroundThrottling = false;
      },
      'did-attach-webview': () => {}
    }, expectAttach: true, expectThrottling: false });

    // 3. did-attach setBackgroundThrottling alone (fallback mechanism).
    await runScenario({ name: 'did-attach-only', partition: applePartition, src: 'http://127.0.0.1:8070/', handlers: {
      'will-attach-webview': allowOnly['will-attach-webview'],
      'did-attach-webview': (_event, guest) => {
        if (!guest.isDestroyed() && sessionPolicies.get(guest.session) === 'apple') guest.setBackgroundThrottling(false);
      }
    }, expectAttach: true, expectThrottling: false });

    // 4. Production listeners: other platforms keep Electron's default throttling.
    await runScenario({ name: 'production-control', partition: controlPartition, src: 'http://127.0.0.1:8089/', handlers: productionHandlers, expectAttach: true, expectThrottling: true });

    // 5. Production listeners: an unregistered partition must not attach at all.
    await runScenario({ name: 'production-blocked', partition: 'persist:not-registered', src: 'http://127.0.0.1:8070/', handlers: productionHandlers, expectAttach: false });

    record('ALL PASSED: production apple off, will-attach preference, did-attach fallback, control default and blocked partition');
    await pause(250);
    app.exit(0);
  }).catch(error => {
    record('FAILED: ' + String(error?.stack || error));
    console.error(error);
    app.exit(1);
  });
}

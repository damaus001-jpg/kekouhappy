const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/workspace-theme-runtime.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = {};
new Function('exports', compiled)(api);

function page(origin = 'http://127.0.0.1:8070') {
  const calls = [];
  const window = { pikachuWorkspaceTheme: { apply: payload => { calls.push(payload); return true; } } };
  window.top = window;
  const context = vm.createContext({ window, location: { origin } });
  return { window, calls, executeJavaScript: script => Promise.resolve(vm.runInContext(script, context)) };
}

async function main() {
  const first = page(), second = page();
  const profiles = [{ id: 'first', platform: 'apple' }, { id: 'other', platform: 'whatsapp' },
    { id: 'second', platform: 'apple' }, { id: 'unmounted', platform: 'apple' }, { id: 'navigating', platform: 'apple' }];
  const pages = { first, second, navigating: { executeJavaScript: () => Promise.reject(new Error('Navigating')) } };
  for (const theme of ['pink', 'blackGold', 'murongPurple', 'clearWaterBlue']) {
    const results = await api.syncWorkspaceThemes(profiles, theme, id => {
      assert.notEqual(id, 'other'); return pages[id] || null;
    });
    assert.equal(results.length, 4);
    assert.equal(results[3].status, 'rejected');
    assert.equal(first.calls.at(-1).theme, theme);
    assert.equal(second.calls.at(-1).theme, theme);
    assert.equal(first.calls.at(-1).version, 1);
  }
  const foreign = page('https://web.whatsapp.com');
  assert.equal(await foreign.executeJavaScript(api.buildWorkspaceThemeScript('pink')), false);
  assert.equal(foreign.calls.length, 0);
  const frame = page(); frame.window.top = {};
  assert.equal(await frame.executeJavaScript(api.buildWorkspaceThemeScript('pink')), false);
  assert.equal(frame.calls.length, 0);
  const oldPage = page(); delete oldPage.window.pikachuWorkspaceTheme;
  assert.equal(await oldPage.executeJavaScript(api.buildWorkspaceThemeScript('pink')), false);
  oldPage.window.pikachuWorkspaceTheme = { apply: () => { throw new Error('Old bridge'); } };
  assert.equal(await oldPage.executeJavaScript(api.buildWorkspaceThemeScript('pink')), false);
  // A new document receives the current saved theme without any phone runtime.
  const reloaded = page();
  assert.equal(await reloaded.executeJavaScript(api.buildWorkspaceThemeScript('clearWaterBlue')), true);
  assert.equal(reloaded.calls[0].theme, 'clearWaterBlue');
  const app = fs.readFileSync(path.join(__dirname, '../src/App.vue'), 'utf8');
  assert.match(app, /watch\(\[activeTheme, \(\) => profiles.value\]/);
  assert.match(app, /@did-finish-load="\(event: Event\) => syncWorkspaceThemeOnLoad/);
  assert.match(app, /function handleWebviewDomReady[\s\S]*?syncWorkspaceThemeOnLoad\(event, profile\)/);
  console.log('workspace-theme: four-theme broadcast, inactive instances, reload, absent pages/bridge, navigation failure isolation and origin/frame guards passed; no backend or phone accessed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

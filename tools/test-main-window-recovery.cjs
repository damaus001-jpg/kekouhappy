const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../electron/main-window-recovery.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const root = fs.mkdtempSync(path.join(__dirname, '../.tmp/renderer-recovery-'));
try {
  const timers = new Map(); let next = 0;
  const context = { exports: {}, require, Date, setTimeout: fn => { timers.set(++next, fn); return next; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(compiled, context);
  const window = new EventEmitter(); window.webContents = new EventEmitter();
  let destroyed = false, reloads = 0, hides = 0, failures = 0;
  window.isDestroyed = window.webContents.isDestroyed = () => destroyed;
  window.webContents.reload = () => reloads++;
  const logPath = path.join(root, 'health.jsonl');
  const stop = context.exports.installMainWindowRecovery(window, { logPath, hideSignalWindows: () => hides++, recoveryFailed: () => failures++ });
  const crash = () => window.webContents.emit('render-process-gone', {}, { reason: 'oom', exitCode: -1 });
  const tick = () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } };
  crash(); assert.equal(hides, 1); assert.equal(reloads, 0); tick(); assert.equal(reloads, 1);
  crash(); tick(); assert.equal(reloads, 2);
  crash(); tick(); assert.equal(reloads, 2); assert.equal(failures, 1, 'repeated OOM cannot create an infinite reload loop');
  const events = fs.readFileSync(logPath, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.length, 3); assert.equal(events[0].reason, 'oom'); assert.equal(events[0].exitCode, -1);
  assert.deepEqual(Object.keys(events[0]).sort(), ['at', 'attempts', 'exitCode', 'freeMemory', 'reason', 'totalMemory']);
  stop(); crash(); tick(); assert.equal(hides, 3); assert.equal(failures, 1);
  const second = new EventEmitter(); second.webContents = new EventEmitter(); second.isDestroyed = second.webContents.isDestroyed = () => destroyed;
  second.webContents.reload = () => { throw Error('must not reload after Close'); };
  context.exports.installMainWindowRecovery(second, { logPath, hideSignalWindows: () => {}, recoveryFailed: () => {} });
  second.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  destroyed = true; second.emit('closed'); tick(); assert.equal(timers.size, 0);
  console.log('main-window-recovery: hide native windows, bounded reload, diagnostic allowlist, close cancellation passed');
} finally {
  for (const file of fs.readdirSync(root)) fs.unlinkSync(path.join(root, file));
  fs.rmdirSync(root);
}

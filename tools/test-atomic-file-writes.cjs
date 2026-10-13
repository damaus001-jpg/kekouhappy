const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
async function main() {
  const project = path.resolve(__dirname, '..');
  const source = await fs.readFile(path.join(project, 'electron/main.ts'), 'utf8');
  const start = source.indexOf('// ATOMIC_FILE_WRITES_START');
  const end = source.indexOf('// ATOMIC_FILE_WRITES_END', start);
  assert.ok(start >= 0 && end > start);
  const compiled = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const dir = await fs.mkdtemp(path.join(project, '.tmp/atomic-write-test-'));
  const target = path.join(dir, 'config.json');
  const harness = rename => new Function('resolve', 'dirname', 'process', 'randomUUID', 'mkdir', 'writeFile', 'rename', 'rm', 'setTimeout', `${compiled}; return writeTextAtomic;`)(path.resolve, path.dirname, process, randomUUID, fs.mkdir, fs.writeFile, rename, async p => {
    assert.notEqual(p, target, 'the last valid destination must never be deleted');
    await fs.rm(p, { force: true });
  }, setTimeout);
  try {
    await fs.writeFile(target, 'old');
    let attempts = 0;
    const transient = harness(async (from, to) => {
      if (++attempts <= 2) throw Object.assign(new Error('locked'), { code: 'EPERM' });
      await fs.rename(from, to);
    });
    await transient(target, 'new');
    assert.equal(await fs.readFile(target, 'utf8'), 'new');
    assert.equal(attempts, 3);
    const permanent = harness(async () => { throw Object.assign(new Error('disk failure'), { code: 'EIO' }); });
    await assert.rejects(permanent(target, 'discarded'), /disk failure/);
    assert.equal(await fs.readFile(target, 'utf8'), 'new');
    assert.deepEqual(await fs.readdir(dir), ['config.json']);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let firstEntered;
    const entered = new Promise(resolve => { firstEntered = resolve; });
    let active = 0, maxActive = 0, count = 0;
    const serial = harness(async (from, to) => {
      active++; maxActive = Math.max(maxActive, active);
      if (++count === 1) { firstEntered(); await gate; }
      await fs.rename(from, to);
      active--;
    });
    const first = serial(target, 'first');
    await entered;
    const second = serial(target, 'second');
    release();
    await Promise.all([first, second]);
    assert.equal(maxActive, 1);
    assert.equal(await fs.readFile(target, 'utf8'), 'second');
    console.log('atomic-file-writes: file locks retry, failed writes preserve data, temporary files clean up, writes remain ordered');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

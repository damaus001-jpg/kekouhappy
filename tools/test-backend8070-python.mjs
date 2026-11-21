// Explicit source/runtime arguments keep this cross-project test separate from normal local checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runBackend8070Command, signBackend8070Command, validateBackend8070Installation } from '../dist-electron/backend8070-control.js';

const [sourceRoot, pythonBase] = process.argv.slice(2);
if (!sourceRoot || !pythonBase) throw new Error('Usage: node tools/test-backend8070-python.mjs <8070-source> <python-base>');
const tempRoot = path.resolve('.tmp'); fs.mkdirSync(tempRoot, { recursive: true });
const directory = fs.mkdtempSync(path.join(tempRoot, '中文后台-'));
const runtime = path.join(directory, 'runtime'), scripts = path.join(directory, 'iphone_batch');
fs.mkdirSync(runtime); fs.mkdirSync(scripts);
for (const filename of fs.readdirSync(pythonBase)) {
  if (/^(python(?:3\d*)?\.dll|python\.exe|vcruntime.*\.dll)$/i.test(filename)) fs.copyFileSync(path.join(pythonBase, filename), path.join(runtime, filename));
}
fs.writeFileSync(path.join(runtime, 'python._pth'), [path.join(pythonBase, 'Lib'), path.join(pythonBase, 'DLLs'), '.', '../iphone_batch'].join('\n'));
for (const name of ['host_control.py', 'host_access.py', 'workspace_access.py']) fs.copyFileSync(path.join(sourceRoot, 'iphone_batch', name), path.join(scripts, name));
for (const name of ['runtime/node.exe', 'iphone_batch/dashboard.py', 'iphone_batch/tunneld_entry.py']) fs.writeFileSync(path.join(directory, name), 'fixture only');
fs.writeFileSync(path.join(directory, 'VERSION'), 'fixture');
fs.writeFileSync(path.join(directory, '8070-host-policy.json'), JSON.stringify({ protocol: 1, mode: 'pikachu-only' }));
fs.writeFileSync(path.join(scripts, 'backend_control.py'), `import json, os
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
class Backend:
    def __init__(self):
        assert not any(name.upper() in ('PYTHONPATH', 'PYTHONHOME') for name in os.environ)
        assert Path.cwd() == ROOT
    def start(self):
        (ROOT/'fixture-state.json').write_text('[[1,"dashboard.py"]]')
        print('fixture log must not leak to stdout')
        return 'fixture started'
    def stop(self):
        if (ROOT/'fixture-refuse-stop').exists():
            raise RuntimeError('fixture refused stop')
        (ROOT/'fixture-state.json').write_text('[]')
        return 'fixture stopped'
    def processes(self):
        file = ROOT/'fixture-state.json'
        return json.loads(file.read_text()) if file.exists() else []
`);
const localAppData = path.join(directory, 'isolated-user'), key = Buffer.alloc(32, 1);
fs.mkdirSync(path.join(localAppData, 'PikachuSmsBridge'), { recursive: true });
fs.writeFileSync(path.join(localAppData, 'PikachuSmsBridge', 'workspace-access.key'), key.toString('hex'));
const oldLocalAppData = process.env.LOCALAPPDATA, oldPythonPath = process.env.PYTHONPATH;
process.env.LOCALAPPDATA = localAppData; process.env.PYTHONPATH = 'must be removed';
try {
  validateBackend8070Installation(directory);
  const command = action => runBackend8070Command(directory, action, signBackend8070Command(action, directory, key));
  const stopped = await command('status'); assert.equal(stopped.ok, true, JSON.stringify(stopped)); assert.equal(stopped.state, 'stopped');
  assert.equal((await command('start')).state, 'running');
  const proof = signBackend8070Command('status', directory, key);
  assert.equal((await runBackend8070Command(directory, 'status', proof)).ok, true);
  assert.equal((await runBackend8070Command(directory, 'status', proof)).code, 'AUTH_REQUIRED', 'nonce replay is refused across CLI processes');
  assert.equal((await runBackend8070Command(directory, 'stop', signBackend8070Command('start', directory, key))).code, 'AUTH_REQUIRED');
  assert.equal((await runBackend8070Command(directory, 'stop', signBackend8070Command('stop', directory + '-wrong', key))).code, 'AUTH_REQUIRED');
  assert.equal((await runBackend8070Command(directory, 'stop', signBackend8070Command('stop', directory, key, '1700000000'))).code, 'AUTH_REQUIRED');
  fs.writeFileSync(path.join(directory, 'fixture-refuse-stop'), 'fixture');
  assert.equal((await command('stop')).ok, false);
  assert.equal((await command('status')).state, 'running');
  fs.unlinkSync(path.join(directory, 'fixture-refuse-stop'));
  assert.equal((await command('stop')).state, 'stopped');
  fs.writeFileSync(path.join(directory, 'fixture-state.json'), '[[2,"tunneld_entry.py"]]');
  assert.equal((await command('status')).state, 'residual');
  assert.equal((await command('stop')).state, 'stopped');
  fs.unlinkSync(path.join(runtime, 'node.exe'));
  assert.deepEqual(await command('status'), { ok: false, state: 'unknown', code: 'MISSING_FILES', message: '安装文件缺失' });
  // Exercise malformed/nonzero/oversized responses through the real process wrapper.
  const control = path.join(scripts, 'host_control.py');
  fs.writeFileSync(control, 'print("not JSON")'); assert.equal((await command('status')).ok, false);
  fs.writeFileSync(control, 'import json,sys\nprint(json.dumps({"protocol":1,"ok":True,"action":"stop","state":"stopped","message":"must not report success"}))\nsys.exit(1)');
  const badExit = await command('stop'); assert.equal(badExit.ok, false); assert.match(badExit.message, /未完成/);
  fs.writeFileSync(control, 'print("x"*100000)'); assert.equal((await command('status')).ok, false);
  console.log('backend8070-python: actual Node spawn -> Python CLI, Chinese install path, isolated key, signed status/start/stop, residuals, replay/action/path/expiry refusal, environment cleanup, missing files and invalid/nonzero/oversized output passed; no real backend/devices touched');
} finally {
  if (oldLocalAppData === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = oldLocalAppData;
  if (oldPythonPath === undefined) delete process.env.PYTHONPATH; else process.env.PYTHONPATH = oldPythonPath;
}

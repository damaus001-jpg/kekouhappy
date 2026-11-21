import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Backend8070Control, signBackend8070Command, validateBackend8070Installation } from '../dist-electron/backend8070-control.js';

const key = Buffer.alloc(32, 1);
assert.equal(signBackend8070Command('start', 'C:\\Program Files\\手机工作台8070', key, '1700000000', 'a'.repeat(32)).signature,
  '165ebef969b3e184f9c455b3727106ac6cf0761d9519c6b67adee320fc5999db', 'Python/Node shared signature vector');
assert.notEqual(signBackend8070Command('stop', 'C:\\Program Files\\手机工作台8070', key, '1700000000', 'a'.repeat(32)).signature,
  signBackend8070Command('start', 'C:\\Program Files\\手机工作台8070', key, '1700000000', 'a'.repeat(32)).signature);

const root = resolve('.tmp'); mkdirSync(root, { recursive: true });
const directory = mkdtempSync(join(root, '后台控制-'));
mkdirSync(join(directory, 'runtime')); mkdirSync(join(directory, 'iphone_batch'));
assert.throws(() => validateBackend8070Installation(directory));
for (const file of ['runtime/python.exe', 'iphone_batch/host_control.py']) writeFileSync(join(directory, file), 'fixture');
writeFileSync(join(directory, '8070-host-policy.json'), JSON.stringify({ protocol: 1, mode: 'pikachu-only' }));
validateBackend8070Installation(directory);
writeFileSync(join(directory, '8070-host-policy.json'), JSON.stringify({ protocol: 1, mode: 'standalone' }));
assert.throws(() => validateBackend8070Installation(directory));

const missing = new Backend8070Control(async () => { throw new Error('missing registry'); }, () => { throw new Error('must not execute'); }, () => key);
assert.deepEqual(await missing.control('status'), { ok: false, state: 'unknown', code: 'MISSING_FILES', message: '安装文件缺失' });
await assert.rejects(missing.control('arbitrary command'), /无效/);
let release;
const actions = [];
const service = new Backend8070Control(async () => directory, async (_directory, action, proof) => {
  actions.push(action); assert.equal(proof.v, 1); assert.match(proof.signature, /^[0-9a-f]{64}$/);
  if (action === 'start') await new Promise(resolve => { release = resolve; });
  return { ok: true, state: action === 'stop' ? 'stopped' : 'running', message: 'fixture' };
}, () => key, () => {});
const start = service.control('start');
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(await service.control('stop'), { ok: false, state: 'starting', code: 'BUSY', message: '后台操作进行中' });
assert.equal((await service.control('status')).state, 'starting', 'queries cannot overwrite a pending operation');
assert.deepEqual(actions, ['start']); release(); assert.equal((await start).state, 'running');
assert.equal((await service.control('stop')).state, 'stopped');
const failureActions = [];
const failed = new Backend8070Control(async () => directory, async (_directory, action) => {
  failureActions.push(action);
  return action === 'stop' ? { ok: false, state: 'unknown', message: 'fixture stop failed' } : { ok: true, state: 'residual', message: 'residual' };
}, () => key, () => {});
assert.deepEqual(await failed.control('stop'), { ok: false, state: 'residual', message: 'fixture stop failed' });
assert.deepEqual(failureActions, ['stop', 'status']);
console.log('backend8070-control: shared HMAC vector, installation validation, missing files, fixed actions, concurrent commands, busy-state preservation and failure refresh passed');

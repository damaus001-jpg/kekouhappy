import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { generateSuiteKeyPair } from '../dist-electron/license-core.js';
import { filterBusinessPublicIdentity, createFilterBusinessMachineCode, issueFilterBusinessCode, verifyFilterBusinessCode } from '../dist-electron/filter-business-license.js';

const suite = generateSuiteKeyPair('123456789');
const other = generateSuiteKeyPair('987654321');
const identity = filterBusinessPublicIdentity(suite);
assert.deepEqual(identity, filterBusinessPublicIdentity(suite), 'business identity is stable for the same suite');
assert.ok(!JSON.stringify(identity).includes('PRIVATE'));
const first = createFilterBusinessMachineCode(identity, '1'.repeat(64));
const second = createFilterBusinessMachineCode(identity, '2'.repeat(64));
const issued = issueFilterBusinessCode(suite, first.machineCode);
assert.match(issued.authorizationCode, /^\d{4}$/);
assert.equal(issued.suiteId, suite.suiteId);
assert.equal(issued.hardwareHash, '1'.repeat(64));
assert.equal(verifyFilterBusinessCode(first.machineCode, first.verifier, issued.authorizationCode), true);
assert.equal(verifyFilterBusinessCode(second.machineCode, first.verifier, issued.authorizationCode), false);
assert.equal(verifyFilterBusinessCode(first.machineCode, first.verifier, '12345'), false);
assert.equal(verifyFilterBusinessCode(first.machineCode, first.verifier, ' 1234'), false);
assert.throws(() => issueFilterBusinessCode(other, first.machineCode), /套装不匹配/);
assert.throws(() => issueFilterBusinessCode({...suite, privateKeyPem:other.privateKeyPem}, first.machineCode), /验证失败/);
assert.throws(() => issueFilterBusinessCode(suite, 'DFM2.not-a-filter-code'), /WNFB1/);
const envelope = JSON.parse(Buffer.from(first.machineCode.split('.')[1], 'base64url').toString());
for (const field of ['hardwareHash','nonce','tag','ciphertext']) {
  const altered = {...envelope};
  altered[field] = field==='hardwareHash'?'2'.repeat(64):field==='nonce'?'2'.repeat(32):Buffer.alloc(Buffer.from(altered[field],'base64').length, 1).toString('base64');
  const invalid='WNFB1.'+Buffer.from(JSON.stringify(altered)).toString('base64url');
  assert.throws(() => issueFilterBusinessCode(suite, invalid), /验证失败/);
}
assert.throws(() => issueFilterBusinessCode(suite, 'WNFB1.'+Buffer.from(JSON.stringify({...envelope,extra:true})).toString('base64url')), /字段/);
assert.throws(() => createFilterBusinessMachineCode(identity,'not-hardware'), /本机标识/);

// Exercise the actual authenticated issuer handler without launching a real vault.
const source=fs.readFileSync(new URL('../electron/license-issuer.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('issuer.ts',source,ts.ScriptTarget.Latest,true);
const functions=['loadSuite','issuerText','registerIpc'].map(name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast)).join('\n');
const compiled=ts.transpileModule(functions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const handlers=new Map();
const api=new Function('suiteCache','issuerHandle','issueFilterBusinessCode',`let authenticated=false;${compiled};registerIpc();return {login(){authenticated=true;}};`)(suite,(channel,handler)=>handlers.set(channel,handler),issueFilterBusinessCode);
const handler=handlers.get('issuer:issue-filter-business');
await assert.rejects(handler({},first.machineCode), /请先登录/);
api.login();
assert.equal((await handler({},first.machineCode)).authorizationCode,issued.authorizationCode);
await assert.rejects(handler({},{}), /本机码无效/);
console.log('filter-business-license: same-suite identity, four-digit codes, machine binding, tampering, cross-suite rejection and actual issuer login gate passed');

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

(async () => {
  const root = path.resolve(__dirname, '..');
  const text = await fs.readFile(path.join(root, 'electron/main.ts'), 'utf8');
  const source = ts.createSourceFile('main.ts', text, ts.ScriptTarget.Latest, true);
  const names = new Set(['hasSignalStartupCorruption', 'launchSignalProfileNow', 'recoverSignalStartupIfCorrupt']);
  const pieces = source.statements.filter(node =>
    (ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => decl.name.getText(source) === 'preserveSignalProfileOnStartupFailure'))
  ).map(node => node.getText(source));
  assert.equal(pieces.length, 4);
  const code = ts.transpileModule(pieces.join('\n'), {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  const fixtureRoot = path.join(root, '.tmp/signal-upgrade-preservation');
  await fs.mkdir(fixtureRoot, {recursive: true});
  const directory = await fs.mkdtemp(path.join(fixtureRoot, 'profile-'));
  await fs.mkdir(path.join(directory, 'logs'));
  const account = crypto.randomBytes(128);
  const keyFile = path.join(directory, 'account-fixture.bin');
  await fs.writeFile(keyFile, account);
  const status = [];
  let destructiveCalls = 0;
  const forbidden = () => { destructiveCalls++; throw new Error('Unexpected account reset'); };
  const profile = {id: 'upgrade-fixture', platform: 'signal', signalDataDir: directory};
  const context = vm.createContext({
    join: path.join, readFile: fs.readFile,
    assertClientRuntimeAllowed() {}, activeRuntimeSecurity: {payload: {}, devicePrivateKeyPem: 'fixture'},
    readConfig: async () => ({profiles: [profile]}),
    signalStartupRecoveryAttempts: new Set(),
    signalProcesses: new Map([[profile.id, {pid: 321, exitCode: null, killed: false}]]),
    killSignalProcessesByDataDir: forbidden, quarantineSignalDataDir: forbidden,
    mkdir: forbidden, rename: forbidden,
    signalAppId: id => id,
    scheduleHideSignalTaskbarButtons() {},
    failSignalPresentationForApp: (id, message) => status.push({id, message}),
  });
  vm.runInContext(code, context);
  for (const failure of ['Database startup error: disk full', 'safeStorage.decryptString failed', 'SQLITE_NOTADB', 'hmac check failed', 'error decrypting page']) {
    await fs.writeFile(path.join(directory, 'logs/main.log'), failure);
    await assert.rejects(context.launchSignalProfileNow(profile.id), /原登录信息和聊天记录已保留/);
    context.signalStartupRecoveryAttempts.clear();
    await context.recoverSignalStartupIfCorrupt(profile.id, directory);
    assert.match(status.at(-1).message, /原登录信息和聊天记录已保留/);
    assert.deepEqual(await fs.readFile(keyFile), account);
  }
  await fs.writeFile(path.join(directory, 'logs/main.log'), 'Normal startup');
  const result = await context.launchSignalProfileNow(profile.id);
  assert.equal(result.pid, 321);
  assert.equal(destructiveCalls, 0);
  console.log('Signal upgrade preservation: 5 startup failures preserve credentials/history; healthy existing profile remains usable.');
})().catch(error => {console.error(error); process.exitCode = 1;});

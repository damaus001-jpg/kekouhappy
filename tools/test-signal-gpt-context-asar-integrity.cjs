const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const asar = require('@electron/asar');
const { asarHeaderHash, patchSignalGptContext, oldFunctions } = require('./patch-signal-gpt-context.cjs');

async function main() {
  const root = path.resolve('.tmp/test-signal-gpt-context-integrity');
  const signalRoot = path.join(root, 'signal');
  const archive = path.join(signalRoot, 'resources', 'app.asar');
  const executable = path.join(signalRoot, 'Signal.exe');
  const sourceRoot = path.join(root, 'source');
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(path.join(sourceRoot, 'bundles', 'chunks'), { recursive: true });
  await fs.mkdir(path.dirname(archive), { recursive: true });
  const bridge = path.join(sourceRoot, 'bundles', 'chunks', 'messageBridgeChannels.std-test.js');
  await fs.writeFile(bridge, `const selector=${oldFunctions};`);
  const requestBridge = path.join(sourceRoot, 'bundles', 'chunks', 'messageBridge.main-test.js');
  await fs.writeFile(requestBridge, 'function parse(t){switch(t.type){case`smartReply.request`:if(t.messages.length>8)return;return t;case`message.visibleBatch`:return t;}}');
  await asar.createPackage(sourceRoot, archive);

  const initialHash = asarHeaderHash(archive);
  await fs.writeFile(executable, Buffer.concat([Buffer.from('test executable:'), Buffer.from(initialHash, 'utf8')]));
  assert.equal(await patchSignalGptContext(archive), true);
  const updatedHash = asarHeaderHash(archive);
  assert.notEqual(updatedHash, initialHash, 'rewriting the archive changes its header hash');
  const executableBytes = await fs.readFile(executable);
  assert.ok(executableBytes.includes(Buffer.from(updatedHash, 'utf8')), 'Signal.exe receives the rebuilt app.asar header hash');
  assert.ok(!executableBytes.includes(Buffer.from(initialHash, 'utf8')), 'the stale app.asar header hash is removed');
  const parserEntry = path.join('bundles', 'chunks', 'messageBridge.main-test.js');
  const parser = asar.extractFile(archive, parserEntry).toString();
  assert.ok(parser.includes('t.messages.length>18'), 'request parser matches the context size');
  assert.equal(await patchSignalGptContext(archive), false, 'patching both chunks is idempotent');

  // Upgrade an archive produced by the older context-only patch as well.
  await fs.writeFile(bridge, require('./patch-signal-gpt-context.cjs').newFunctions);
  await asar.createPackage(sourceRoot, archive);
  await fs.writeFile(executable, Buffer.from(asarHeaderHash(archive), 'utf8'));
  assert.equal(await patchSignalGptContext(archive), true);
  assert.ok(asar.extractFile(archive, parserEntry).toString().includes('t.messages.length>18'));
  assert.ok((await fs.readFile(executable)).includes(Buffer.from(asarHeaderHash(archive), 'utf8')));
  console.log('signal-gpt-context-asar-integrity: rebuilt Signal app.asar and executable hashes stay paired');
  await fs.rm(root, { recursive: true, force: true });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

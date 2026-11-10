const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const asar = require('@electron/asar');
const { asarHeaderHash, patchSignalGptContext, oldFunctions } = require('./patch-signal-gpt-context.cjs');

async function main() {
  const {newFunctions}=require('./patch-signal-gpt-context.cjs');
  const {select,anchors}=new Function('u',newFunctions+';return {select:d,anchors:f};')((a,b)=>a===b);
  const messages=Array.from({length:26},(_,i)=>({messageId:String(i),conversationId:'chat',direction:i%2?'incoming':'outgoing',sourceText:i===20?'中文消息':'English bubble '+i,timestamp:Date.parse(i<20?'2026-11-08T23:55:00-08:00':'2026-11-09T00:15:00-08:00')}));
  const context=select('chat',messages,messages[21]);
  assert.equal(context.length,18);
  assert.equal(context[0].sourceText,'English bubble 3');
  assert.equal(context.at(-1).sourceText,'English bubble 21');
  assert.deepEqual(anchors('chat',messages),['21','23','25']);
  assert.ok(context.some(m=>m.direction==='outgoing'));
  assert.equal(context[0].timestamp,messages[3].timestamp);
  assert.equal(select('other-chat',messages,messages[21]).length,0);
  assert.equal(select('chat',[...messages,messages[0]],messages[21]).length,0,'duplicate IDs fail closed');
  assert.equal(select('chat',messages,messages[19]).length,0,'stale anchor is rejected');
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
  await fs.writeFile(bridge, require('./patch-signal-gpt-context.cjs').previousFunctions);
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

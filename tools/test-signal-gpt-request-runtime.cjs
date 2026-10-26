const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const asar = require('@electron/asar');
const ts = require('typescript');
const { patchSmartReplyRequestLimit } = require('./patch-signal-gpt-context.cjs');

async function main() {
  const archive = path.resolve(process.argv[2] || '.package-staging/signal/resources/app.asar');
  const entries = asar.listPackage(archive);
  const projectionPath = entries.find(e => /messageBridgeChannels\.std-.+\.js$/.test(e));
  const bridgePath = entries.find(e => /messageBridge\.main-.+\.js$/.test(e));
  assert.ok(projectionPath && bridgePath, 'native Signal bridge bundles exist');
  const projectionSource = asar.extractFile(archive, projectionPath.slice(1)).toString();
  const bridgeSource = asar.extractFile(archive, bridgePath.slice(1)).toString();
  const runtimeHelper = { n: fn => {
    let initialized = false;
    return () => { if (!initialized) { initialized = true; fn(); } };
  } };
  const projection = {};
  vm.runInNewContext(projectionSource, { exports: projection, require: () => runtimeHelper, TextEncoder });
  projection.l();
  projection.i();
  // Use the actual compiled native parser and its helpers, excluding window lifecycle code.
  const ast = ts.createSourceFile('bridge.js', bridgeSource, ts.ScriptTarget.Latest, true);
  const parser = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.getText(ast).includes('case`smartReply.request`:'));
  assert.ok(parser, 'native request parser exists');
  const prefix = bridgeSource.slice(0, parser.end);
  function loadParser(source) {
    const context = { exports: {}, Buffer, TextEncoder, require: name => {
      if (name.includes('messageBridgeChannels')) return projection;
      if (name.startsWith('./chunk-')) return runtimeHelper;
      if (name === 'node:crypto') return require(name);
      return {};
    } };
    return vm.runInNewContext(`${source}\n${parser.name.text}`, context);
  }
  const originalParser = loadParser(prefix);
  const fixedParser = loadParser(patchSmartReplyRequestLimit(prefix));
  const conversationId = randomUUID();
  const now = Date.now();
  const messages = Array.from({ length: 19 }, (_, i) => projection.p({
    id: randomUUID(), conversationId, text: `Message ${i + 1} how are you today?`,
    direction: 'incoming', timestamp: now - 20000 + i
  }));
  const request = count => ({
    type: 'smartReply.request', requestId: randomUUID(), contextVersion: projection.o,
    conversationId, triggerMessageId: messages[count - 1].messageId, messages: messages.slice(0, count)
  });
  for (const count of [1, 8, 9, 18]) {
    const accepted = fixedParser(request(count));
    assert.equal(accepted?.messages.length, count, `native parser accepts ${count} messages`);
    const { handoffChatToGpt } = await import('../dist-electron/gpt-handoff.js');
    const events = [];
    await handoffChatToGpt({
      profileId: 'signal-test', platform: 'signal',
      messages: accepted.messages.map(m => ({ speaker: 'other', text: m.sourceText })),
      latestSpeaker: 'other', replyCount: 3, outputLanguage: 'en-US', allowSensitiveEcho: false
    }, {
      writeClipboard: text => { assert.ok(text.includes(`Message ${count} how`)); events.push('copy'); },
      showPrompt: async size => { assert.equal(size, count); events.push('prompt'); return true; },
      openExternal: async url => { assert.equal(url, 'https://chatgpt.com/'); events.push('open'); }
    });
    assert.deepEqual(events, ['copy', 'prompt', 'open']);
  }
  assert.equal(fixedParser(request(19)), undefined, 'nineteen messages remain rejected');
  assert.equal(fixedParser({ ...request(8), triggerMessageId: randomUUID() }), undefined);
  assert.equal(fixedParser({ ...request(8), unexpected: true }), undefined);
  if (prefix.includes('messages.length>8')) {
    assert.equal(originalParser(request(9)), undefined, 'reproduce the old silent rejection');
    assert.equal(originalParser(request(18)), undefined);
  } else {
    assert.equal(originalParser(request(18))?.messages.length, 18, 'packaged parser is fixed');
  }
  console.log('signal-gpt-request-runtime: native parser accepts 1/8/9/18 messages and reaches copy/prompt/open; invalid and oversized requests rejected');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

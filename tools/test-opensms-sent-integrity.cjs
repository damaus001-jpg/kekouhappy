const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/App.vue'), 'utf8');
const script = source.slice(source.indexOf('>') + 1, source.indexOf('</script>'));
const tree = ts.createSourceFile('App.ts', script, ts.ScriptTarget.Latest, true);
const node = tree.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'verifySentMessageIntegrity');
assert.ok(node);
const code = ts.transpileModule(node.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const expectedConversation = 'sms:ACCOUNT_A:chat-a';
const otherConversation = 'sms:ACCOUNT_A:chat-b';
const expectedText = 'Expected translated message';
const canonical = value => value.replace(/\s+/g, ' ').trim();

async function scenario({ switchAt = 0, accountSwitch = false, matches = false, noMessage = false, unavailable = false, switchAfterLastScan = false }) {
  let tick = 0, locks = 0, current = expectedConversation;
  const runtime = {
    async execute(command) {
      if (command.action === 'contact') return unavailable ? { id: '' } : { id: current };
      const candidates = noMessage ? [] : [{ key: 'new-key-' + current, contactId: current, direction: 'outgoing', messagePart: 'body', text: matches ? expectedText : 'Different historical message' }];
      if (command.action === 'sent-integrity-scan') {
        const snapshot = { sameConversation: !unavailable && current === command.expectedConversationSignature, conversationSignature: current, candidates };
        if (switchAfterLastScan && tick === 4) current = otherConversation;
        return snapshot;
      }
      return candidates;
    }
  };
  const window = {
    setTimeout(callback) { tick++; if (tick === switchAt) current = accountSwitch ? 'sms:ACCOUNT_B:chat-a' : otherConversation; callback(); },
    chatTranslator: { appendSignalDebugLog: async () => {} }
  };
  const verify = new Function('window', 'getRuntimeScriptExecutor', 'canonicalRenderedSendIntegrityText', 'hasMatchingRenderedSendIntegrityText', 'buildMessageScanScript', 'buildOpenSmsScript', 'appForPlatform', 'normalizeComposerConversationSignature', 'lockChatForSentIntegrityFailure', code + ';return verifySentMessageIntegrity;')(
    window, () => runtime, canonical, (expected, values) => values.some(value => canonical(value) === canonical(expected)),
    (_platform, options) => ({ action: 'scan', options }), command => command, value => value, canonical, async () => { locks++; }
  );
  await verify({ id: 'test-sms', platform: 'opensms' }, expectedText, new Set(['old-key']), Date.now(), expectedConversation);
  return locks;
}
(async () => {
  const cases = [
    ['switch-before-first-read', { switchAt: 1 }, 0],
    ['switch-after-partial-observation', { switchAt: 3 }, 0],
    ['switch-account-with-same-contact-id', { switchAt: 1, accountSwitch: true }, 0],
    ['switch-after-last-scan-before-lock', { switchAfterLastScan: true }, 0],
    ['original-conversation-mismatch-still-locks', {}, 1],
    ['original-conversation-match', { matches: true }, 0],
    ['no-new-message-does-not-lock', { noMessage: true }, 0],
    ['unavailable-conversation-does-not-lock', { unavailable: true }, 0]
  ];
  for (const [name, options, expected] of cases) {
    assert.equal(await scenario(options), expected, name);
    console.log('PASS ' + name);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

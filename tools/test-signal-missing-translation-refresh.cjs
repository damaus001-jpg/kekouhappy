const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const file = '.tmp/signal-source/v8.18.0/Signal-Desktop-8.18.0/ts/components/conversation/Message.dom.tsx';
const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('  public renderMaoyiTranslation():');
const end = source.indexOf('  public renderMaoyiSmartReply():', start);
assert.ok(start >= 0 && end > start);
const methods = source.slice(start, end);
const compiled = ts.transpileModule(`class Message { props: any; ${methods} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React }
}).outputText;
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
const Message = new Function('React', compiled + '\nreturn Message;')(React);
function buttons(node) {
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === 'button' ? [node] : []), ...(node.children || []).flatMap(buttons)];
}
for (const direction of ['incoming', 'outgoing']) {
  let refreshCount = 0;
  const message = new Message();
  message.props = { direction, i18n: () => 'Refresh translation', onMaoyiTranslationRefresh: () => { refreshCount += 1; } };
  let rendered = message.renderMaoyiTranslation();
  assert.equal(buttons(rendered).length, 1, `${direction} without a translation must retain retry`);
  buttons(rendered)[0].props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(refreshCount, 1);
  message.props.maoyiTranslationRefreshPending = true;
  rendered = message.renderMaoyiTranslation();
  assert.equal(buttons(rendered)[0].props.disabled, true);
  buttons(rendered)[0].props.onClick({ preventDefault() {}, stopPropagation() {} });
  assert.equal(refreshCount, 1);
  message.props.maoyiTranslationText = 'translated';
  assert.equal(buttons(message.renderMaoyiTranslation()).length, 1);
  message.props.maoyiTranslationText = undefined;
  message.props.onMaoyiTranslationRefresh = undefined;
  assert.equal(message.renderMaoyiTranslation(), null);
}
console.log('Signal incoming/outgoing without translations retain a working refresh button; pending and excluded-message behavior passed.');

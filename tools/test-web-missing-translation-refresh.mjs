import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');
const start = source.indexOf('  const ensureRefreshButton = (bubble,');
const end = source.indexOf("  if (platformApp === 'signal')", source.indexOf('    mount.appendChild(placeholder);', start));
assert.ok(start > 0 && end > start);
const helper = source.slice(start, end);
class Element {
  constructor() { this.dataset = {}; this.children = []; this.handlers = {}; this.attrs = {}; this.style = {}; }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.className === selector.slice(1) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    if (['.df-chat-translation', '.df-chat-refresh-placeholder'].includes(selector)) {
      return this.className === selector.slice(1) ? this : this.parent?.closest(selector) || null;
    }
    return this;
  }
  appendChild(node) { node.remove(); this.children.push(node); node.parent = this; }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  replaceChildren() { this.children.forEach(node => { node.parent = undefined; }); this.children = []; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = undefined; }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(type, handler) { this.handlers[type] = handler; }
}
const event = { preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} };
for (const platformApp of ['whatsapp', 'telegram']) {
  for (const direction of ['incoming', 'outgoing']) {
    for (const messagePart of ['body', 'quote']) {
      const window = {};
      const mount = new Element();
      const context = vm.createContext({ platformApp, window, document: { createElement: () => new Element(), createTextNode: () => new Element() }, findQuoteBlock: () => messagePart === 'quote' ? mount : null, readDirection: () => direction });
      vm.runInContext(helper + '\nthis.ensure = ensureRefreshButton;', context);
      const key = messagePart === 'quote' ? 'df-example-quote-abc' : 'df-example-body-abc';
      context.ensure(mount, mount, key, 'Hello customer', messagePart);
      const duplicate = new Element();
      duplicate.className = 'df-chat-refresh-translation';
      duplicate.dataset.dfRefreshKey = key;
      mount.appendChild(duplicate);
      const stale = new Element();
      stale.className = 'df-chat-refresh-translation';
      stale.dataset.dfRefreshKey = messagePart === 'quote' ? 'old-container-quote-abc' : 'old-container-body-abc';
      mount.appendChild(stale);
      context.ensure(mount, mount, key, 'Hello customer', messagePart);
      assert.equal(mount.querySelectorAll('.df-chat-refresh-translation').length, 1, 'scans must preserve one retry button');
      const button = mount.querySelectorAll('.df-chat-refresh-translation')[0];
      assert.match(button.parent.style.cssText, /color:#166534/);
      const originalStyle = button.style.cssText;
      assert.equal(button.dataset.dfRefreshKey, key);
      (button.handlers.pointerdown || button.handlers.click)(event);
      button.handlers.click(event);
      assert.equal(window.__dfTranslatorQueue.length, 1, 'one physical click queues one manual translation');
      const request = window.__dfTranslatorQueue[0];
      assert.equal(request.action, 'bubble-refresh');
      assert.deepEqual(JSON.parse(request.text), { key, text: 'Hello customer', direction, messagePart });
      assert.equal(button.disabled, true);
      const stateStart = source.indexOf('function buildWebBubbleRefreshStateScript(');
      const bodyStart = source.indexOf('(() => {', stateStart);
      const bodyEnd = source.indexOf('`;', bodyStart);
      const script = source.slice(bodyStart, bodyEnd).replace('${payload}', JSON.stringify({ key, state: 'idle' }));
      context.document.querySelectorAll = selector => mount.querySelectorAll(selector);
      assert.equal(vm.runInContext(script, context), true);
      assert.equal(button.disabled, false, 'failure or completion restores retry');
      button.handlers.click(event);
      assert.equal(window.__dfTranslatorQueue.length, 2);
      for (const [marker, endMarker, direct] of [
        ['  const renderWebTranslationWithRefresh = (node,', '  const mountFor =', false],
        ['  const renderWebTranslationWithRefresh = (targetNode)', '  const existingTranslations =', true]
      ]) {
        const rendererStart = source.indexOf(marker);
        const rendererEnd = source.indexOf(endMarker, rendererStart);
        context.payload = { app: platformApp, key, sourceText: 'Hello customer', translation: '你好' };
        context.container = mount;
        vm.runInContext('(() => {\n' + source.slice(rendererStart, rendererEnd) + '\nthis.render = renderWebTranslationWithRefresh; })();', context);
        const target = new Element();
        target.className = 'df-chat-translation';
        mount.appendChild(target);
        if (direct) context.render(target);
        else context.render(target, '你好', key, 'Hello customer', mount);
        assert.equal(mount.querySelectorAll('.df-chat-refresh-translation')[0], button, 'translation keeps the original button object');
        assert.equal(mount.querySelectorAll('.df-chat-refresh-translation').length, 1);
        assert.equal(mount.querySelectorAll('.df-chat-refresh-placeholder').length, 0);
        assert.equal(button.style.cssText, originalStyle, 'before/after translation uses the same button style');
        const duplicatePlaceholder = new Element();
        duplicatePlaceholder.className = 'df-chat-refresh-placeholder';
        const extra = new Element();
        extra.className = 'df-chat-refresh-translation';
        extra.dataset.dfRefreshKey = messagePart === 'quote' ? 'new-key-quote-abc' : 'new-key-body-abc';
        duplicatePlaceholder.appendChild(extra);
        mount.appendChild(duplicatePlaceholder);
        context.ensure(mount, mount, extra.dataset.dfRefreshKey, 'Hello customer', messagePart);
        assert.equal(mount.querySelectorAll('.df-chat-refresh-translation').length, 1, 'cached translation wins even when the later scan assigns a different key');
        assert.equal(mount.querySelectorAll('.df-chat-refresh-translation')[0], button);
        assert.equal(mount.querySelectorAll('.df-chat-refresh-placeholder').length, 0, 'duplicate standalone component is removed');
        assert.equal(mount.dataset.dfMsgTextKey, key, 'manual refresh keeps the cached button linked to its source');
        vm.runInContext(script, context);
        button.handlers.click(event);
      }
    }
  }
}
const findStart = source.indexOf('  const findBubble = (el) => platformApp');
const findEnd = source.indexOf('  const isLikelyMessageBubble', findStart);
const canonical = {};
const nested = {};
const context = vm.createContext({ platformApp: 'whatsapp' });
vm.runInContext(source.slice(findStart, findEnd) + '\nthis.find = findBubble;', context);
for (const selector of ['data-pre-plain-text', 'msg-container', 'message-in', 'message-out']) {
  const node = { closest: query => query === '[data-id^="true_"], [data-id^="false_"]' ? canonical : nested };
  assert.equal(context.find(node), canonical, `${selector} shares the outer message identity`);
}
assert.match(source, /const canonicalBubble = findBubble\(textNode\) \|\| container/);
assert.match(source, /const targetKey = canonicalBubble\.dataset\.dfMsgKey/);
console.log('WhatsApp/Telegram missing-translation retry: both directions, body/quote, dedupe, manual request and retry restoration passed.');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readComposerPlainTextFromDom,
  restoreComposerEnglishLayout
} from '../dist-electron/shared.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');

const textNode = (value) => ({ nodeType: 3, nodeValue: value });
const elementNode = (tagName, childNodes = [], attributes = {}) => ({
  nodeType: 1,
  tagName,
  childNodes,
  getAttribute: (name) => attributes[name] ?? null
});

const whatsappLikeComposer = elementNode('DIV', [
  elementNode('DIV', [textNode('你好杰克')]),
  textNode('\n  '),
  elementNode('DIV', [elementNode('BR')]),
  textNode('\n'),
  elementNode('DIV', [textNode('你吃饭了吗？')])
]);
assert.equal(
  readComposerPlainTextFromDom(whatsappLikeComposer),
  '你好杰克\n\n你吃饭了吗？',
  'structural DOM whitespace must not multiply a single visual blank line'
);

const inlineBreakComposer = elementNode('DIV', [
  textNode('你好杰克'),
  elementNode('BR'),
  elementNode('BR'),
  textNode('你吃饭了吗？')
]);
assert.equal(
  readComposerPlainTextFromDom(inlineBreakComposer),
  '你好杰克\n\n你吃饭了吗？',
  'two explicit BR elements must remain one intentional blank line'
);

const oneBlankLineSource = '你好杰克\n\n你吃饭了吗？';
assert.equal(
  restoreComposerEnglishLayout(oneBlankLineSource, 'Hi Jack\n\n\n\n\nHave you eaten?'),
  'Hi Jack\n\nHave you eaten?',
  'DeepSeek output must be restored to the exact source blank-line layout'
);

const twoBlankLinesSource = '你好杰克\n\n\n你吃饭了吗？';
assert.equal(
  restoreComposerEnglishLayout(twoBlankLinesSource, 'Hi Jack\nHave you eaten?'),
  'Hi Jack\n\n\nHave you eaten?',
  'intentional multiple blank lines must remain distinguishable'
);

assert.match(appSource, /function buildComposerPlainTextReaderSource\(\)/);
assert.match(appSource, /readComposerPlainTextFromDom\.toString\(\)/);
assert.ok(
  (appSource.match(/readComposerPlainText\(/g) || []).length >= 5,
  'composer reads, writes, probes, and Signal injection must share the visual text reader'
);
assert.match(appSource, /2026-10-11-telegram-stable-conversation-v60/);
assert.match(appSource, /2026-10-15-signal-emoji-scope-v22/);
assert.ok(
  (appSource.match(/shouldAllowShiftLineBreak\(event,/g) || []).length >= 3,
  'web and Signal beforeinput handlers must allow remembered Shift+Enter line breaks'
);
assert.match(appSource, /if \(rememberShiftEnter\(event, composer\)\) return;/);

console.log('composer-line-layout: visual blank lines and Shift+Enter contracts passed');

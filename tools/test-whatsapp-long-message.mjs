import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');

const readMoreSelector = '[data-testid="caption-read-more-button"]';
const selectorMatches = app.match(/caption-read-more-button/g) || [];
assert.ok(selectorMatches.length >= 3, 'scan, cache replay, and direct injection must all guard collapsed WhatsApp messages');
assert.match(app, /if \(action === 'whatsapp-long-message-expanded'\)[\s\S]*?scanAndTranslateMessages\(profileId\)/);
assert.match(app, /const expandCollapsedWhatsappBubble = \(bubble\) => \{[\s\S]*?platformApp !== 'whatsapp'[\s\S]*?readMoreButton\.click\(\)[\s\S]*?return true;/);
assert.match(app, /const expandCollapsedWhatsappBubble = \(bubble\) => \{[\s\S]*?payload\.app !== 'whatsapp'[\s\S]*?readMoreButton\.click\(\)[\s\S]*?return true;/);
assert.match(app, /if \(expandCollapsedWhatsappBubble\(bubble\)\) continue;[\s\S]*?const quoteBlock = findQuoteBlock\(textNode\)/, 'the live scanner must skip truncated text after requesting expansion');
assert.match(app, /if \(expandCollapsedWhatsappBubble\(bubble\)\) continue;[\s\S]*?const text = cleanMessageText\(textWithoutTranslatorUi\(textNode\)\)/, 'cache replay must expand before hashing or matching text');
assert.match(app, /if \(payload\.app === 'whatsapp'\) \{[\s\S]*?caption-read-more-button[\s\S]*?return false;/, 'direct injection must refuse a collapsed WhatsApp bubble');
assert.match(app, /runtimeVersion = '2026-07-20-whatsapp-long-message-v2'/, 'the updated cache runtime must replace already-installed page logic');
assert.doesNotMatch(app, /textContent\s*===?\s*['"](?:查看更多|Read more|See more)['"]/, 'expansion must not depend on the WhatsApp interface language');
assert.ok(app.includes(readMoreSelector), 'the exact WhatsApp data-testid supplied by the live page must be used');

console.log('whatsapp-long-message: full-text expansion gates scan, cache replay, and direct injection');

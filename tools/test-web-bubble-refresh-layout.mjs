import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8');

assert.match(appSource, /if \(platformApp === 'signal'\) \{[\s\S]*?injectedButton\.remove\(\);[\s\S]*?return;/);
assert.match(appSource, /document\.querySelectorAll\('\.df-chat-refresh-translation'\)/);
assert.match(appSource, /'height:24px'/);
assert.match(appSource, /'width:24px'/);
assert.match(appSource, /'font-size:15px'/);
assert.equal(
  (appSource.match(/'letter-spacing:0\.3px'/g) || []).length,
  2,
  'WhatsApp and Telegram cached/live bubble translations must share the 0.3px Chinese spacing'
);
assert.equal(
  (appSource.match(/'border-top:1px solid #d8c081'/g) || []).length,
  2,
  'WhatsApp and Telegram cached/live bubble translations must share the refresh-window text color separator'
);
assert.match(appSource, /'background:transparent'/);
assert.match(appSource, /'border:0'/);
assert.match(appSource, /'opacity:0\.72'/);
assert.match(appSource, /className = 'df-chat-translation-tail'/);
assert.match(appSource, /display:inline-flex;align-items:center;white-space:nowrap/);
assert.match(appSource, /'margin:0 0 0 3px'/);
assert.match(appSource, /renderWebTranslationWithRefresh/);
assert.equal((appSource.match(/const button = reusableButton \|\| document.createElement\('button'\)/g) || []).length, 2);
assert.match(appSource, /if \(payload\.app === 'signal'\)/);
assert.doesNotMatch(appSource, /\[data-testid="msg-meta"\]/);
assert.equal((appSource.match(/action: 'bubble-refresh'/g) || []).length, 3);
assert.equal((appSource.match(/addEventListener\('pointerdown', triggerRefresh, true\)/g) || []).length, 3);
assert.equal((appSource.match(/addEventListener\('click', triggerRefresh, true\)/g) || []).length, 3);
assert.equal((appSource.match(/now - lastRefreshTriggerAt < 500/g) || []).length, 2);
assert.match(appSource, /if \(action === 'bubble-refresh'\)/);
assert.match(appSource, /enqueueMessageTranslationTask\(profile,[\s\S]*?'manual-refresh'\)/);
assert.match(appSource, /buildWebBubbleRefreshStateScript/);
assert.match(appSource, /setManualRefreshState\('processing'\)[\s\S]*?window\.chatTranslator\.translate/);
assert.match(appSource, /setManualRefreshState\('idle'\)/);
assert.match(appSource, /button\.dataset\.dfRefreshKey/);
assert.match(appSource, /__dfBubbleRefreshPendingKeys/);
assert.match(appSource, /const matchingButtons = buttons\.filter/);
assert.match(appSource, /return matchingButtons\.length > 0/);
assert.match(appSource, /explicitHost = bubble\.closest\?\.\('\[data-id\^="true_"\]/);
assert.doesNotMatch(appSource, /button\.textContent = '\.\.\.';[\s\S]{0,160}setTimeout\([\s\S]{0,160}1600/);
assert.match(appSource, /color-mix\(in srgb, currentColor 12%, transparent\)/);
assert.doesNotMatch(appSource, /'right:' \+ \(platformApp === 'signal'/);

console.log('Web bubble refresh layout contract passed.');

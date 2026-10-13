import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.vue'), 'utf8');

assert.match(appSource, /activePanel === 'home'[\s\S]{0,2600}当前用户/);
assert.match(appSource, /remainingAuthorizationText/);
assert.match(appSource, /authorizationExpiryText/);
assert.match(appSource, /remainingMs < oneDayMs[\s\S]{0,100}不足 1 天/);
assert.match(appSource, /remainingMs[\s\S]{0,100}已过期/);

for (const content of [
  '<span>翻译字符</span>',
  '<strong>不限</strong>',
  '<span>防远程控制</span>',
  '<span>防聊天偷窥</span>',
  '<span>防聊天内容篡改</span>'
]) {
  assert.ok(appSource.includes(content), `Home dashboard is missing: ${content}`);
}

const protectionCards = appSource.match(/security-enabled-card/g) || [];
assert.equal(protectionCards.length, 3, 'Home dashboard must show exactly three enabled protection cards.');

console.log('home-dashboard: authorization summary and three enabled protection labels passed');

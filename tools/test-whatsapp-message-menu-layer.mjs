import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'src', 'App.vue'), 'utf8');
const start = app.indexOf('const installWhatsAppMessageMenuLayerGuard = () => {');
const end = app.indexOf('  const isVisible = (el) => {', start);
assert.ok(start >= 0 && end > start, 'WhatsApp message-menu layer guard must exist');
const guard = app.slice(start, end);

assert.match(guard, /hostname !== 'web\.whatsapp\.com'/, 'the guard must remain isolated to WhatsApp');
assert.match(guard, /button\[role="menuitem"\], \[role="menuitem"\]/, 'the menu must be identified by semantic menu items');
assert.match(guard, /\.join\('\\\\n'\)/, 'the generated injection must retain a valid escaped label separator');
assert.match(guard, /回复\|\\\\breply\\\\b/, 'the message-menu signature must include Reply');
assert.match(guard, /复制\|\\\\bcopy\\\\b/, 'the message-menu signature must include Copy');
assert.match(guard, /转发\|\\\\bforward\\\\b/, 'the message-menu signature must include Forward');
assert.match(guard, /const popup = list\.parentElement;/, 'the outer popup shown in the supplied HTML must be promoted');
assert.match(guard, /dfWhatsappMessageMenuLayer = '1'/, 'the promoted popup must receive a stable marker');
assert.match(guard, /setProperty\('z-index', '2147483600', 'important'\)/, 'the message menu must be above the composer');
assert.match(guard, /getComputedStyle\(popup\)\.position === 'static'/, 'static popups must be made z-index capable without changing positioned popups');
assert.match(guard, /requestAnimationFrame/, 'promotion must run after WhatsApp has opened the menu');
assert.match(guard, /setTimeout\(promoteMessageMenus, 80\)/, 'a bounded delayed pass must cover asynchronous menu mounting');
assert.match(guard, /document\.addEventListener\('click'/, 'mouse-opened menus must be covered');
assert.match(guard, /document\.addEventListener\('keyup'/, 'keyboard-opened menus must be covered');
assert.doesNotMatch(guard, /MutationObserver|setInterval/, 'the layer guard must not add a continuous page-wide scan');
assert.match(app, /installStyle\(\);\s*installWhatsAppMessageMenuLayerGuard\(\);/, 'the guard must install with the injected WhatsApp runtime');
assert.match(app, /\[data-df-whatsapp-message-menu-layer="1"\][\s\S]*?z-index: 2147483600 !important;/, 'the injected style must preserve the promoted layer');

console.log('whatsapp-message-menu-layer: semantic menu detection and bounded top-layer promotion contracts passed');

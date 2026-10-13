import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => readFileSync(path.join(projectRoot, ...parts), 'utf8');
const main = read('electron', 'main.ts');
const renderer = read('src', 'App.vue');
const preloadTs = read('electron', 'preload.ts');
const preloadCjs = read('electron', 'preload.cjs');
const shared = read('electron', 'shared.ts');

assert.match(main, /nativeImage,/);
assert.match(main, /const taskbarUnreadMaximum = 999_999;/);
assert.match(main, /function createTaskbarUnreadOverlay\(count: number\)/);
assert.match(main, /const label = count > 99 \? '99\+' : String\(count\);/);
assert.match(main, /nativeImage\.createFromBitmap\(bitmap, \{ width: 16, height: 16, scaleFactor: 1 \}\)/);
assert.match(main, /mainWindow\.setOverlayIcon\(null, '没有未读消息'\);/);
assert.match(main, /`总未读消息 \$\{taskbarUnreadCount\} 条`/);
assert.match(
  main,
  /typeof value !== 'number'[\s\S]*?!Number\.isSafeInteger\(value\)[\s\S]*?value < 0[\s\S]*?value > taskbarUnreadMaximum/,
  'taskbar unread IPC must reject non-integer, negative, and excessive values'
);
assert.match(main, /trustedHandle\('taskbar:set-unread-count', true,/);
assert.match(main, /function applyTaskbarUnreadAttention\(\)/);
assert.match(
  main,
  /mainWindow\.flashFrame\(taskbarUnreadCount > 0 && !mainWindow\.isFocused\(\)\);/,
  'a background main window must flash continuously while any unread message remains'
);
assert.match(
  main,
  /taskbarUnreadCount = value;\s*applyTaskbarUnreadOverlay\(\);\s*applyTaskbarUnreadAttention\(\);/,
  'every real unread total must update both the numeric overlay and flashing state'
);
assert.match(main, /mainWindow\.setMenuBarVisibility\(false\);\s*applyTaskbarUnreadOverlay\(\);\s*applyTaskbarUnreadAttention\(\);/);
assert.match(
  main,
  /app\.on\('browser-window-blur', \(_event, blurredWindow\) => \{\s*if \(blurredWindow === mainWindow\) applyTaskbarUnreadAttention\(\);\s*\}\);/,
  'application-level blur routing must target only the main window without changing Signal visibility policy'
);
assert.match(
  main,
  /app\.on\('browser-window-focus', \(_event, focusedWindow\) => \{\s*if \(focusedWindow === mainWindow\) applyTaskbarUnreadAttention\(\);\s*\}\);/,
  'application-level focus routing must stop native flashing without changing Signal focus recovery'
);

assert.match(
  renderer,
  /const totalUnreadCount = computed\(\(\) => \([\s\S]*?unreadCountsByApp\.value\.whatsapp \+ unreadCountsByApp\.value\.telegram \+ unreadCountsByApp\.value\.signal/,
  'the taskbar count must sum the existing WhatsApp, Telegram, and Signal unread totals'
);
assert.match(
  renderer,
  /watch\(totalUnreadCount, \(count\) => \{\s*void window\.chatTranslator\?\.setTaskbarUnreadCount\?\.\(count\)\.catch\(\(\) => undefined\);\s*\}, \{ immediate: true \}\);/,
  'the Windows taskbar overlay must follow real unread-count changes'
);
assert.match(renderer, /setTaskbarUnreadCount\?\.\(0\)/, 'renderer teardown must clear the taskbar overlay');
assert.match(renderer, /function unreadPollIntervalForProfile\(_profile: ChatProfile\) \{\s*return 3000;/, 'all three platforms must poll unread state every three seconds');
assert.match(renderer, /const platformOffset = app === 'whatsapp' \? 0 : app === 'telegram' \? 800 : 1600;/, 'platform unread scans must have staggered initial offsets');
assert.match(renderer, /const profileOffset = samePlatformProfiles\.length <= 1[\s\S]*?200 \+ Math\.round\(\(profileIndex \/ \(samePlatformProfiles\.length - 1\)\) \* 400\);/, 'profiles on the same platform must be distributed across the 200 to 600 millisecond window');
const telegramUnreadScript = renderer.match(/if \(platformApp === 'telegram'\) \{[\s\S]*?\n  \}\n  const selectorGroups/)?.[0] || '';
assert.match(telegramUnreadScript, /__dfTelegramUnarchivedUnreadStateV2/, 'Telegram unread state must use the unarchived-row contract');
assert.match(telegramUnreadScript, /archiveLabelPattern/, 'Telegram unread must identify the archive entry explicitly');
assert.match(telegramUnreadScript, /const isArchiveEntry = \(row\)/, 'Telegram archive entry must be excluded from row totals');
assert.match(telegramUnreadScript, /const isInsideArchiveContainer = \(row\)/, 'Telegram rows inside the archive view must be excluded');
assert.match(telegramUnreadScript, /const rowUnreadCounts = new Map\(\)/, 'Telegram unread badges must be deduplicated per contact row');
assert.match(telegramUnreadScript, /Array\.from\(rowUnreadCounts\.values\(\)\)\.reduce\(\(sum, count\) => sum \+ count, 0\)/, 'Telegram unread must sum every unarchived contact badge');
assert.match(telegramUnreadScript, /telegram-unarchived-badges-retained/, 'Telegram archive view must retain the last confirmed unarchived total');
assert.doesNotMatch(telegramUnreadScript, /unreadMessagesCount|dialogsStorage\.getFolder|folder_unread/, 'Telegram aggregate folder values must not override the visible unarchived badge sum');
assert.match(preloadTs, /setTaskbarUnreadCount: \(count: number\) => ipcRenderer\.invoke\('taskbar:set-unread-count', count\)/);
assert.match(preloadCjs, /setTaskbarUnreadCount: \(count\) => ipcRenderer\.invoke\('taskbar:set-unread-count', count\)/);
assert.match(shared, /setTaskbarUnreadCount: \(count: number\) => Promise<void>;/);

console.log('taskbar-unread: three-platform total, strict IPC, Windows overlay, and clear contracts passed');

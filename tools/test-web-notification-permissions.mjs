import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');

const permissionOrigin = main.match(/function isAllowedPlatformPermissionOrigin[\s\S]*?\n}\n/)?.[0] || '';
assert.match(permissionOrigin, /url\.protocol !== 'https:'/);
assert.match(permissionOrigin, /platform === 'whatsapp'[\s\S]*?url\.hostname === 'web\.whatsapp\.com'/);
assert.match(permissionOrigin, /platform === 'telegram-k' \|\| platform === 'telegram-a'/);
assert.match(permissionOrigin, /url\.hostname === 'web\.telegram\.org'/);
assert.match(permissionOrigin, /return false;/, 'non-chat origins and Signal must remain denied');

assert.match(
  main,
  /setPermissionCheckHandler\(\(_webContents, permission, requestingOrigin, details\) => \{\s*const requestingUrl = details\.requestingUrl \|\| requestingOrigin;\s*if \(!isAllowedPlatformPermissionOrigin\(profile\.platform, requestingUrl\)\) return false;\s*return permission === 'notifications' \|\| permission === 'media';/,
  'permission checks must use the actual requesting URL or its exact official origin'
);
assert.match(
  main,
  /setPermissionRequestHandler\(\(contents, permission, callback, details\) => \{\s*const requestingUrl = details\.requestingUrl \|\| contents\.getURL\(\);\s*const allowedOrigin = isAllowedPlatformPermissionOrigin\(profile\.platform, requestingUrl\);\s*const allowedPermission = permission === 'notifications' \|\| permission === 'media';\s*callback\(allowedOrigin && allowedPermission\);/,
  'permission requests must stay limited to notifications/media on official platform origins'
);
assert.doesNotMatch(
  main,
  /setPermissionCheckHandler\([\s\S]*?isAllowedPlatformUrl\(profile\.platform, requestingOrigin\)/,
  'Telegram permission checks must not require /k or /a in an origin-only value'
);

console.log('web-notifications: official WhatsApp/Telegram origins can request notifications without relaxing navigation policy');

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.vue'), 'utf8');

assert.match(appSource, /for \(let index = events\.length - 1; index >= 0; index -= 1\)/);
assert.match(appSource, /if \(events\[index\]\?\.action === 'typing'\)/);
assert.match(appSource, /const compactedEvents = events\.filter\(\(event, index\) => event\.action !== 'typing' \|\| index === lastTypingIndex\);/);
assert.match(appSource, /type: 'composer-event-failed'/);
assert.match(appSource, /try \{\s*await pollInjectedComposerEvents\(profileId\);\s*\} finally \{/);
assert.match(appSource, /const translatorEventQueueLimit = 256;/);
assert.match(appSource, /payload\.action === 'typing'/);
assert.match(appSource, /event\?\.action !== 'typing'/);
assert.match(appSource, /while \(window\.__dfTranslatorQueue\.length > translatorEventQueueLimit\)/);
assert.match(appSource, /event\?\.action === 'unread-peek-debug'/);

console.log('Composer event queue resilience contract passed.');

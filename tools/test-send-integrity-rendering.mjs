import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalRenderedSendIntegrityText,
  hasMatchingRenderedSendIntegrityText
} from '../dist-electron/shared.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const mainSource = fs.readFileSync(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');
const preloadSource = fs.readFileSync(path.join(projectRoot, 'electron', 'preload.cjs'), 'utf8');

const expected = 'Good morning, John\n\nDo you have any plans this morning?';

assert.equal(
  canonicalRenderedSendIntegrityText(expected),
  canonicalRenderedSendIntegrityText('Good morning, John Do you have any plans this morning?'),
  'Signal DOM whitespace collapsing must not trigger the post-send lock'
);
assert.equal(
  hasMatchingRenderedSendIntegrityText(expected, [
    'Good morning, John',
    'Good morning, John\n\nDo you have any plans this morning?'
  ]),
  true,
  'a partial Signal DOM candidate must not override another complete matching candidate'
);
assert.equal(
  hasMatchingRenderedSendIntegrityText(expected, [
    'Good morning, John',
    'Do you have any plans this morning?'
  ]),
  false,
  'separate partial candidates must not be concatenated into a false match'
);
assert.equal(
  canonicalRenderedSendIntegrityText('Good   morning, John\t\nDo you have any plans this morning?'),
  canonicalRenderedSendIntegrityText('Good morning, John Do you have any plans this morning?'),
  'tabs, line breaks, and repeated spaces must share one rendered representation'
);

for (const changed of [
  'Good morning, John Do you have any plans this morning',
  'Good morning, Jon Do you have any plans this morning?',
  'Good morning, John Do you have plans this morning?',
  'Good morning, John Do you have any plans this afternoon?',
  'Good morning, JohnDo you have any plans this morning?'
]) {
  assert.notEqual(
    canonicalRenderedSendIntegrityText(expected),
    canonicalRenderedSendIntegrityText(changed),
    `meaningful sent-content change must still fail integrity: ${changed}`
  );
}

assert.notEqual(
  canonicalRenderedSendIntegrityText('Visit https://example.com/pay?id=1024'),
  canonicalRenderedSendIntegrityText('Visit https://example.com/pay?id=1025'),
  'URL changes must still fail integrity'
);
assert.notEqual(
  canonicalRenderedSendIntegrityText('Send to 0x77820f8D481F71FD5faBc86eb2960d89f44aFc00'),
  canonicalRenderedSendIntegrityText('Send to 0x77820f8D481F71FD5faBc86eb2960d89f44aFc01'),
  'wallet-address changes must still fail integrity'
);

assert.ok(
  (appSource.match(/includeAlreadyTranslated: true/g) || []).length >= 2,
  'integrity snapshots and verification must include bubbles that already received a translation'
);
assert.match(
  appSource,
  /const newOutgoing = \(candidates \|\| \[\]\)\.filter/,
  'post-send integrity must evaluate every new outgoing Signal candidate'
);
assert.match(
  appSource,
  /if \(hasMatchingRenderedSendIntegrityText\(expected, newOutgoing\.map/,
  'any complete matching candidate must pass post-send integrity'
);
assert.match(
  appSource,
  /if \(!sawNewOutgoing\) return;/,
  'the lock must run only after the complete observation window saw stable mismatches'
);
assert.match(
  appSource,
  /const textSelectors = platformApp === 'signal'[\s\S]*?\? \[\s*'\.module-message__text',/,
  'Signal scans must prefer the complete native message body instead of a nested directional fragment'
);
assert.match(
  appSource,
  /textNode\.closest\('\.module-message__text'\) \|\| bubble\.querySelector\?\.\('\.module-message__text'\)/,
  'nested Signal text fragments must resolve back to the complete native message body'
);
assert.match(
  appSource,
  /\.module-message__maoyi-translation, \.module-message__maoyi-smart-reply/,
  'Signal source-native translations and smart replies must be excluded from integrity text'
);
assert.match(
  appSource,
  /if \(profile\.platform === 'signal'\) \{[\s\S]*?verifySignalSentMessage\([\s\S]*?if \(result\.status !== 'mismatch'\) return;/,
  'Signal post-send integrity must use the source-native authenticated message result and lock only on a proven mismatch'
);
assert.ok(
  (appSource.match(/profile\.platform === 'signal'[\s\S]{0,80}\? new Set<string>\(\)/g) || []).length >= 2,
  'normal and sensitive Signal sends must not use DOM bubble snapshots'
);
assert.match(
  mainSource,
  /message\.direction !== 'outgoing'[\s\S]*?signalOutgoingIntegrityObservations\.set/,
  'only source-native outgoing Signal projections may become integrity observations'
);
assert.match(
  mainSource,
  /recordSignalOutgoingIntegrityObservation\(appId, added\)/,
  'authenticated and validated Signal message.added events must feed native integrity verification'
);
assert.match(
  mainSource,
  /status: candidates\.length \? 'mismatch' as const : 'unavailable' as const/,
  'absence of an authenticated Signal observation must not be treated as content tampering'
);
assert.match(
  preloadSource,
  /verifySignalSentMessage: \(request\) => ipcRenderer\.invoke\('signal:verify-sent-integrity', request\)/,
  'the renderer must reach native Signal integrity verification only through the trusted preload bridge'
);

console.log('send-integrity-rendering: native Signal verification, web candidate settling, whitespace equivalence, and meaningful-change rejection passed');

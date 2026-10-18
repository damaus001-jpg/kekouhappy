import assert from 'node:assert/strict';
import { filterProfileScopedJsonl, profileLogIdentityHash } from '../dist-electron/profile-data-cleanup.js';

const removedId = '11111111-1111-4111-8111-111111111111';
const retainedId = '22222222-2222-4222-8222-222222222222';
const rows = [
  JSON.stringify({ profileId: removedId, sourceText: 'private source text' }),
  JSON.stringify({ userId: `df-${removedId}`, status: 'success' }),
  JSON.stringify({ appId: `Signal-${removedId}`, type: 'signal-status' }),
  JSON.stringify({ profileId: profileLogIdentityHash(removedId), textLength: 12 }),
  JSON.stringify({ profileId: retainedId, sourceText: 'other profile content' }),
  JSON.stringify({ status: 'global-event' })
].join('\n') + '\n';

const filtered = filterProfileScopedJsonl(rows, removedId);
assert.equal(filtered.removed, 4);
assert.equal(filtered.contents.split('\n').filter(Boolean).length, 2);
assert.ok(filtered.contents.includes(retainedId));
assert.ok(filtered.contents.includes('global-event'));
assert.ok(!filtered.contents.includes('private source text'));
assert.equal(filterProfileScopedJsonl('', removedId).removed, 0);

console.log('profile-data-cleanup: removes only matching profile log rows, including hashed diagnostic IDs');

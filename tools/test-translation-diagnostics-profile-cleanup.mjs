import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TranslationDiagnostics } from '../dist-electron/translation-diagnostics.js';
import { profileLogIdentityHash } from '../dist-electron/profile-data-cleanup.js';

const directory = await mkdtemp(join(tmpdir(), 'maoyi-profile-diag-cleanup-'));
try {
  const diagnostics = new TranslationDiagnostics(directory);
  const removedProfile = '11111111-1111-4111-8111-111111111111';
  const retainedProfile = '22222222-2222-4222-8222-222222222222';
  diagnostics.record('request:start', { profileId: removedProfile, textLength: 17 });
  diagnostics.record('request:start', { profileId: retainedProfile, textLength: 23 });
  await diagnostics.flush();
  await diagnostics.removeProfileRecords(profileLogIdentityHash(removedProfile));
  await diagnostics.flush();

  assert.equal(diagnostics.events.length, 1);
  assert.equal(diagnostics.events[0].profileId, profileLogIdentityHash(retainedProfile));
  const [file] = await readdir(directory);
  const contents = await readFile(join(directory, file), 'utf8');
  assert.ok(!contents.includes(profileLogIdentityHash(removedProfile)));
  assert.ok(contents.includes(profileLogIdentityHash(retainedProfile)));
  console.log('translation-diagnostics-profile-cleanup: removes one profile while retaining other profile events');
} finally {
  await rm(directory, { recursive: true, force: true });
}

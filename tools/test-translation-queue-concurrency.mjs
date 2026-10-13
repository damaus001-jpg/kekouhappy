import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(projectRoot, 'src', 'App.vue'), 'utf8');

assert.match(app, /const translationQueueGlobalConcurrency = 24;/);
assert.match(app, /const translationQueueInteractiveReservedConcurrency = 6;/);
assert.match(app, /const translationQueueInteractiveProfileConcurrency = 2;/);
assert.match(app, /'composer-enter': 0/);
assert.match(
  app,
  /if \(task\.reason === 'composer-enter'\) \{[\s\S]*?return interactiveTasks\.length < translationQueueInteractiveProfileConcurrency;/,
  'two independent composer requests in one profile must be allowed to run concurrently'
);
assert.doesNotMatch(
  app,
  /interactiveTasks\.length < translationQueueInteractiveProfileConcurrency &&\s*!interactiveTasks\.length/,
  'the old forced single-request composer queue must stay removed'
);
assert.match(
  app,
  /runningBackgroundCount >= translationQueueGlobalConcurrency - translationQueueInteractiveReservedConcurrency/,
  'background bubble work must preserve capacity for interactive Enter requests'
);
assert.match(
  app,
  /last\.text === textKey &&[\s\S]*?last\.composerKind === composerKind &&[\s\S]*?last\.requestId === requestId/,
  'event deduplication must apply only to the same text in the same request'
);
assert.match(
  app,
  /isTelegramPlatform\(currentProfile\.platform\) && activeProfileId\.value === profileId\s*\? 80/,
  'the active Telegram profile must deliver Enter events without the old coarse polling delay'
);
assert.match(
  app,
  /if \(profile\.platform === 'signal'\) await runtime\.execute\(buildEnterTranslateScript\(\)\);/,
  'the legacy Signal listener must not be installed in Telegram or WhatsApp'
);

console.log('translation-queue-concurrency: interactive reservation, per-request dedupe, and Telegram fast-poll contracts passed');

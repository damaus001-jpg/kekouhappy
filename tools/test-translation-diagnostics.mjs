import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TranslationDiagnostics } from '../dist-electron/translation-diagnostics.js';
const directory = path.resolve('.tmp/translation-diagnostics-test');
const logger = new TranslationDiagnostics(directory);
logger.record('request:failed', {
  requestId: 'private-request', profileId: 'private-profile', contactId: 'private-contact',
  sourceText: 'private-chat-body', translatedText: 'private-translation',
  key: 'private-api-secret', Authorization: 'Bearer private-api-secret',
  errorMessage: 'private-chat-body', model: 'deepseek-v4-flash', elapsedMs: 100, httpStatus: 503
});
await logger.flush();
const data = await fs.readFile(path.join(directory, `${logger.sessionId}.jsonl`), 'utf8');
for (const secret of ['private-request', 'private-profile', 'private-contact', 'private-chat-body', 'private-translation', 'private-api-secret']) assert.equal(data.includes(secret), false);
const event = JSON.parse(data.trim());
assert.equal(event.httpStatus, 503);
assert.equal(event.elapsedMs, 100);
assert.equal(event.profileId.length, 16);
assert.equal(logger.counts['request:failed'], 1);
console.log('translation-diagnostics: sensitive fields excluded, identities hashed, metrics persisted');

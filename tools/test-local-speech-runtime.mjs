import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.vue'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');

assert.match(appSource, /async function restoreSignalVoiceTranscripts/);
assert.match(appSource, /voiceTranscriptCacheIdentity\(candidate\)/);
assert.match(appSource, /voiceTranscript: true/);
assert.match(appSource, /if \(!candidate\.text\) \{[\s\S]*?saveAndTranscribeLocalSpeech/);
assert.match(appSource, /enqueueMessageTranslationTask\(profile, candidate, 'visible-message'\)/);
assert.match(appSource, /done\.has\(candidate\.key\) \|\| Boolean\(candidate\.text\)/);
assert.match(mainSource, /!request\.voiceTranscript && !isEnglishChatSource\(request\.sourceText\)/);

console.log('Voice transcript persistence and retry contracts passed.');

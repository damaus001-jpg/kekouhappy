import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

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

// Execute the actual background scanner to check errors, cleanup, and recovery.
const scanStart = appSource.indexOf('function scanSignalVoiceMessages(');
const scanEnd = appSource.indexOf('\nasync function transcribeVoiceMessageCandidates(', scanStart);
assert.ok(scanStart >= 0 && scanEnd > scanStart);
const scanScript = ts.transpileModule(appSource.slice(scanStart, scanEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
const inFlight = new Map();
const statuses = [];
const diagnostics = [];
const candidateUpdates = [];
let failScan = true;
let failRestore = false;
let hasVoice = true;
const candidate = { key: 'voice-1', voiceMessage: true };
const context = vm.createContext({
  signalVoiceScansInFlight: inFlight,
  activeProfileId: { value: 'signal-1' },
  activePanel: { value: 'session' },
  lockScreenVisible: { value: false },
  profiles: { value: [{ id: 'signal-1', platform: 'signal' }] },
  window: { chatTranslator: { transcribeLocalSpeech() {} } },
  getRuntimeScriptExecutor: () => ({ execute: async () => {
    if (failScan) throw new Error('Signal control channel disconnected');
    return hasVoice ? [candidate] : [];
  } }),
  buildVoiceMessageScanScript: () => 'scan',
  restoreSignalVoiceTranscripts: async () => {
    if (failRestore) throw new Error('Runtime replaced');
  },
  updateVoiceCandidates: (...args) => candidateUpdates.push(args),
  voiceCandidatesByProfile: { value: { 'signal-1': [candidate] } },
  voiceTranslationStatus: { value: { 'signal-1': '正在识别语音' } },
  setVoiceTranslationStatus: (...args) => statuses.push(args),
  diagnosticEvent: (...args) => diagnostics.push(args)
});
vm.runInContext(scanScript, context);
await context.scanSignalVoiceMessages('signal-1');
assert.equal(statuses.length, 0, 'background scan failure must preserve user action status');
assert.equal(inFlight.size, 0, 'failed scan must allow the next retry');
assert.equal(diagnostics.at(-1)[0], 'speech:scan-failed');
failScan = false;
failRestore = true;
await context.scanSignalVoiceMessages('signal-1');
assert.equal(statuses.length, 0, 'background processing failure must stay in diagnostics');
assert.equal(inFlight.size, 0);
assert.equal(diagnostics.at(-1)[0], 'speech:scan-processing-failed');
failRestore = false;
await context.scanSignalVoiceMessages('signal-1');
assert.equal(statuses.length, 0, 'discovering voice notes must stay silent');
assert.equal(candidateUpdates.at(-1)[1][0], candidate, 'voice actions must remain available');
assert.equal(inFlight.size, 0);
hasVoice = false;
await context.scanSignalVoiceMessages('signal-1');
assert.equal(statuses.length, 0, 'conversations without voice notes must stay silent');
assert.equal(candidateUpdates.at(-1)[1].length, 0);
assert.equal(inFlight.size, 0);

console.log('Voice transcript persistence and retry contracts passed.');

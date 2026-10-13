import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSmartReplyPromptBundle } from '../dist-electron/smart-reply-prompt-bundle.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = process.env.MAOYI_SMART_REPLY_PROMPT_SOURCE_PATH?.trim() ||
  path.join(root, 'config', 'smart-reply-prompt.default.txt');
const outputPath = path.join(root, '.package-secrets', 'smart-reply-prompt.dfp');
const suitePath = process.env.MAOYI_LICENSE_SUITE_PATH?.trim();
const signingPath = suitePath || path.join(root, '.package-secrets', 'developer-prompt-signing.json');
const signingConfig = JSON.parse(fs.readFileSync(signingPath, 'utf8').replace(/^\uFEFF/, ''));
const identity = suitePath ? signingConfig.promptSigning?.smartReply : signingConfig.smartReply;
if (!identity?.privateKeyPem) throw new Error('Smart-reply prompt signing identity is missing. Suites 006, 007, and 008 are not compatible with the v2 prompt format.');
const prompt = fs.readFileSync(sourcePath, 'utf8')
  .replace(/^\uFEFF/, '')
  .replace(/\r\n?/g, '\n')
  .trim();
const signed = createSmartReplyPromptBundle(identity, { prompt });
if (suitePath || process.env.MAOYI_DEVELOPMENT_PROMPTS_ONLY !== '1') {
  fs.writeFileSync(outputPath, signed, { encoding: 'utf8', mode: 0o600 });
}
if (!suitePath) {
  const developmentOutput = path.join(root, '.package-secrets', 'development', 'smart-reply-prompt.dfp');
  fs.mkdirSync(path.dirname(developmentOutput), { recursive: true });
  fs.writeFileSync(developmentOutput, signed, { encoding: 'utf8', mode: 0o600 });
}
console.log(`Signed smart-reply prompt bundle generated: ${path.basename(outputPath)}`);
console.log(`promptSuite=${identity.suiteId}`);
console.log(`promptKey=${identity.keyId}`);

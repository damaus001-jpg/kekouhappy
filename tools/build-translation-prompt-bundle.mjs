import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslationPromptBundle } from '../dist-electron/translation-prompt-bundle.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = process.env.MAOYI_TRANSLATION_PROMPTS_SOURCE_PATH?.trim() ||
  path.join(root, 'config', 'translation-prompts.default.json');
const outputPath = path.join(root, '.package-secrets', 'translation-prompts.dfp');
const suitePath = process.env.MAOYI_LICENSE_SUITE_PATH?.trim();
const signingPath = suitePath || path.join(root, '.package-secrets', 'developer-prompt-signing.json');
const signingConfig = JSON.parse(fs.readFileSync(signingPath, 'utf8').replace(/^\uFEFF/, ''));
const identity = suitePath ? signingConfig.promptSigning?.translation : signingConfig.translation;
if (!identity?.privateKeyPem) throw new Error('Translation prompt signing identity is missing. Suites 006, 007, and 008 are not compatible with the v2 prompt format.');
const prompts = JSON.parse(fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, ''));
const signed = createTranslationPromptBundle(identity, prompts);
if (suitePath || process.env.MAOYI_DEVELOPMENT_PROMPTS_ONLY !== '1') {
  fs.writeFileSync(outputPath, signed, { encoding: 'utf8', mode: 0o600 });
}
if (!suitePath) {
  const developmentOutput = path.join(root, '.package-secrets', 'development', 'translation-prompts.dfp');
  fs.mkdirSync(path.dirname(developmentOutput), { recursive: true });
  fs.writeFileSync(developmentOutput, signed, { encoding: 'utf8', mode: 0o600 });
}
console.log(`Signed translation prompt bundle generated: ${path.basename(outputPath)}`);
console.log(`promptSuite=${identity.suiteId}`);
console.log(`promptKey=${identity.keyId}`);

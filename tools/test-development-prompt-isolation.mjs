import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { generateSuiteKeyPair } from '../dist-electron/license-core.js';
import { createTranslationPromptBundle, verifyTranslationPromptBundle } from '../dist-electron/translation-prompt-bundle.js';
import { createSmartReplyPromptBundle, verifySmartReplyPromptBundle } from '../dist-electron/smart-reply-prompt-bundle.js';

const root = fs.mkdtempSync(path.resolve('.tmp/prompt-isolation-'));
fs.mkdirSync(path.join(root, '.package-secrets'));
fs.mkdirSync(path.join(root, 'config'));
const developer = generateSuiteKeyPair('123456789');
const production = generateSuiteKeyPair('987654321');
fs.writeFileSync(path.join(root, '.package-secrets/developer-prompt-signing.json'), JSON.stringify(developer.promptSigning));
const suitePath = path.join(root, 'production-suite.json');
fs.writeFileSync(suitePath, JSON.stringify(production));
fs.copyFileSync('config/translation-prompts.default.json', path.join(root, 'config/translation-prompts.default.json'));
fs.copyFileSync('config/smart-reply-prompt.default.txt', path.join(root, 'config/smart-reply-prompt.default.txt'));
for (const [builder, file, signingKey, createBundle, verifyBundle] of [
  ['build-translation-prompt-bundle.mjs', 'translation-prompts.dfp', 'translation', createTranslationPromptBundle, verifyTranslationPromptBundle],
  ['build-smart-reply-prompt-bundle.mjs', 'smart-reply-prompt.dfp', 'smartReply', createSmartReplyPromptBundle, verifySmartReplyPromptBundle]
]) {
  const source = fs.readFileSync(path.join('tools', builder), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^const root = .*;\r?\n/m, '');
  const execute = new Function('fs', 'path', 'root', 'process', 'console', 'createTranslationPromptBundle', 'createSmartReplyPromptBundle', source);
  const run = env => execute(fs, path, root, { env }, { log() {} }, createBundle, createBundle);
  run({});
  const devPath = path.join(root, '.package-secrets/development', file);
  const before = fs.readFileSync(devPath, 'utf8');
  verifyBundle(developer.promptSigning[signingKey], before);
  run({ MAOYI_LICENSE_SUITE_PATH: suitePath });
  assert.equal(fs.readFileSync(devPath, 'utf8'), before, 'packaging must not replace the running developer prompt');
  const packaged = fs.readFileSync(path.join(root, '.package-secrets', file), 'utf8');
  verifyBundle(production.promptSigning[signingKey], packaged);
  assert.throws(() => verifyBundle(developer.promptSigning[signingKey], packaged));
  run({ MAOYI_DEVELOPMENT_PROMPTS_ONLY: '1' });
  assert.equal(fs.readFileSync(path.join(root, '.package-secrets', file), 'utf8'), packaged, 'starting diagnostics must not overwrite production packaging prompts');
}
const main = fs.readFileSync('electron/main.ts', 'utf8');
assert.match(main, /'development', translationPromptBundleFileName/);
assert.match(main, /'development', smartReplyPromptBundleFileName/);
console.log('Developer translation/smart-reply prompts remain valid while production packaging writes its own signed bundles.');

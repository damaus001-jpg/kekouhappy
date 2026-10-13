import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSuiteKeyPair } from '../dist-electron/license-core.js';
import {
  createTranslationPromptBundle,
  verifyTranslationPromptBundle
} from '../dist-electron/translation-prompt-bundle.js';
import {
  defaultChineseToEnglishPrompt,
  defaultEnglishToChinesePrompt
} from '../dist-electron/shared.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const activeSuitePath = process.env.MAOYI_LICENSE_SUITE_PATH?.trim();
const publicDefaults = JSON.parse(
  fs.readFileSync(path.join(root, 'config', 'translation-prompts.default.json'), 'utf8').replace(/^\uFEFF/, '')
);
const defaults = activeSuitePath
  ? publicDefaults
  : {
      chineseToEnglish: defaultChineseToEnglishPrompt,
      englishToChinese: defaultEnglishToChinesePrompt
    };
const signingConfig = activeSuitePath
  ? JSON.parse(fs.readFileSync(activeSuitePath, 'utf8').replace(/^\uFEFF/, ''))
  : generateSuiteKeyPair('123456789');
const signing = signingConfig.promptSigning;
const encryptedDefaults = activeSuitePath
  ? fs.readFileSync(path.join(root, '.package-secrets', 'translation-prompts.dfp'), 'utf8')
  : createTranslationPromptBundle(signing.translation, defaults, '2026-07-24T00:00:00.000Z');
const main = fs.readFileSync(path.join(root, 'electron', 'prompt-generator.ts'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'prompt-generator-preload.cjs'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'prompt-generator', 'renderer.js'), 'utf8');
const generatorBuilder = fs.readFileSync(path.join(root, 'electron-builder.prompt-generator.cjs'), 'utf8');
const clientBuilder = fs.readFileSync(path.join(root, 'electron-builder.client-suite.cjs'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.equal(defaults.chineseToEnglish, defaultChineseToEnglishPrompt);
assert.equal(publicDefaults.chineseToEnglish, defaultChineseToEnglishPrompt);
assert.deepEqual(verifyTranslationPromptBundle(signing.translation, encryptedDefaults), defaults);
assert.equal(defaults.englishToChinese, defaultEnglishToChinesePrompt);
assert.equal(publicDefaults.englishToChinese, defaultEnglishToChinesePrompt);
assert.match(main, /prompt-generator:defaults/);
assert.match(preload, /getDefaults/);
assert.match(renderer, /loadDefaultPrompts/);
assert.doesNotMatch(renderer, /secret\.value|客户端当前密钥/);
assert.match(renderer, /defaultPrompts\.suiteId/);
assert.match(renderer, /zhEn\.value = defaultPrompts\.chineseToEnglish/);
assert.match(generatorBuilder, /config\/translation-prompts\.default\.json/);
assert.match(generatorBuilder, /translation-prompts\.source\.json/);
assert.match(generatorBuilder, /prompt-generator-signing\.json/);
assert.doesNotMatch(clientBuilder, /translation-prompts\.source\.json/);
assert.equal(JSON.stringify(packageJson.build.extraResources).includes('translation-prompts.source.json'), false);

console.log('prompt-generator-defaults: approved defaults preload in internal generator and stay out of customer packages');

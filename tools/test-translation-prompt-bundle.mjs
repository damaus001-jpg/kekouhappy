import assert from 'node:assert/strict';

import { generateSuiteKeyPair } from '../dist-electron/license-core.js';
import {
  createTranslationPromptBundle,
  verifyTranslationPromptBundle
} from '../dist-electron/translation-prompt-bundle.js';

const suite = generateSuiteKeyPair('123456789');
const otherSuite = generateSuiteKeyPair('987654321');
const prompts = {
  chineseToEnglish: '中译英测试规则，只输出译文',
  englishToChinese: '英译中测试规则，只输出译文'
};
const signed = createTranslationPromptBundle(
  suite.promptSigning.translation,
  prompts,
  '2026-07-20T00:00:00.000Z'
);

assert.equal(signed.includes(prompts.chineseToEnglish), false);
assert.equal(signed.includes(prompts.englishToChinese), false);
assert.deepEqual(verifyTranslationPromptBundle(suite.promptSigning.translation, signed), prompts);
assert.throws(
  () => verifyTranslationPromptBundle(otherSuite.promptSigning.translation, signed),
  /套装不匹配|密钥不匹配|签名无效/
);

const tampered = JSON.parse(signed);
tampered.payload = `${tampered.payload.slice(0, -2)}AA`;
assert.throws(
  () => verifyTranslationPromptBundle(suite.promptSigning.translation, JSON.stringify(tampered)),
  /签名无效|解析失败/
);

console.log('translation-prompt-bundle: suite signing, wrong-suite rejection, and tamper rejection passed');

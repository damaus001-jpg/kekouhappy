import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateSuiteKeyPair } from '../dist-electron/license-core.js';
import {
  createSmartReplyPromptBundle,
  smartReplyPromptBundleFileName,
  verifySmartReplyPromptBundle
} from '../dist-electron/smart-reply-prompt-bundle.js';
import { createTranslationPromptBundle } from '../dist-electron/translation-prompt-bundle.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const activeSuitePath = process.env.MAOYI_LICENSE_SUITE_PATH?.trim();
const suite = generateSuiteKeyPair('123456789');
const prompt = 'Generate exactly three distinct English chat replies and return strict JSON.';
const signed = createSmartReplyPromptBundle(
  suite.promptSigning.smartReply,
  { prompt },
  '2026-07-20T00:00:00.000Z'
);
const translationBundle = createTranslationPromptBundle(suite.promptSigning.translation, {
  chineseToEnglish: 'translate to English',
  englishToChinese: 'translate to Chinese'
});

assert.equal(smartReplyPromptBundleFileName, 'smart-reply-prompt.dfp');
assert.equal(signed.includes(prompt), false);
assert.deepEqual(verifySmartReplyPromptBundle(suite.promptSigning.smartReply, signed), { prompt });
assert.throws(() => verifySmartReplyPromptBundle(suite.promptSigning.smartReply, translationBundle));

const tampered = JSON.parse(signed);
tampered.signature = `${tampered.signature.slice(0, -4)}AAAA`;
assert.throws(
  () => verifySmartReplyPromptBundle(suite.promptSigning.smartReply, JSON.stringify(tampered)),
  /签名长度|签名无效|智能回复提示词/
);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const clientSuiteBuilder = fs.readFileSync(path.join(root, 'electron-builder.client-suite.cjs'), 'utf8');
const promptGeneratorBuilder = fs.readFileSync(path.join(root, 'electron-builder.prompt-generator.cjs'), 'utf8');
const buildScript = fs.readFileSync(path.join(root, 'tools', 'build-smart-reply-prompt-bundle.mjs'), 'utf8');
const approvedSourcePath = path.join(root, 'config', 'smart-reply-prompt.default.txt');

assert.ok(packageJson.build.files.includes('dist-electron/main.js'));
assert.ok(!packageJson.build.files.includes('dist-electron/smart-reply-prompt-bundle.js'));
assert.ok(packageJson.build.extraResources.some((entry) => entry.from === '.package-secrets/smart-reply-prompt.dfp' && entry.to === 'smart-reply-prompt.dfp'));
assert.match(clientSuiteBuilder, /dist-electron\/main\.js/);
assert.doesNotMatch(clientSuiteBuilder, /dist-electron\/smart-reply-prompt-bundle\.js/);
assert.match(clientSuiteBuilder, /\.package-secrets\/smart-reply-prompt\.dfp/);
assert.doesNotMatch(promptGeneratorBuilder, /smart-reply-prompt/i);
assert.match(buildScript, /config', 'smart-reply-prompt\.default\.txt/);
assert.match(buildScript, /smart-reply-prompt\.dfp/);
const approvedSource = fs.readFileSync(approvedSourcePath, 'utf8')
  .replace(/^\uFEFF/, '')
  .replace(/\r\n?/g, '\n');
assert.match(approvedSource, /三条回复都必须包含完整的“接、化、抛”/);
assert.match(approvedSource, /每条回复必须同时返回 english 和 chinese/);
assert.match(approvedSource, /df\.smart_reply\.output\.v1/);
assert.doesNotMatch(approvedSource, /reply_1 对应 continue|reply_2 对应 expand|reply_3 对应 opinion/);
const localSigningPath = activeSuitePath || path.join(root, '.package-secrets', 'developer-prompt-signing.json');
const localBundlePath = activeSuitePath
  ? path.join(root, '.package-secrets', smartReplyPromptBundleFileName)
  : path.join(root, '.package-secrets', 'development', smartReplyPromptBundleFileName);
if (fs.existsSync(localSigningPath) && fs.existsSync(localBundlePath)) {
  const localSigningConfig = JSON.parse(fs.readFileSync(localSigningPath, 'utf8').replace(/^\uFEFF/, ''));
  const localSigning = activeSuitePath ? localSigningConfig.promptSigning : localSigningConfig;
  const localBundle = fs.readFileSync(localBundlePath, 'utf8');
  assert.equal(verifySmartReplyPromptBundle(localSigning.smartReply, localBundle).prompt, approvedSource.trim());
}

console.log('smart-reply-prompt-bundle: independent suite signing, tamper rejection, and packaging isolation passed');

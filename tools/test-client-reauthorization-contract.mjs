import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSuiteKeyPair } from '../dist-electron/license-core.js';
import { createTranslationPromptBundle, verifyTranslationPromptBundle } from '../dist-electron/translation-prompt-bundle.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appSource = fs.readFileSync(path.join(root, 'src', 'App.vue'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
const licenseSource = fs.readFileSync(path.join(root, 'electron', 'client-license.ts'), 'utf8');

assert.match(appSource, /activePanel === 'account'[\s\S]{0,600}重新授权/);
assert.match(appSource, /reauthorizationDialogOpen[\s\S]{0,1800}<span>本机码<\/span>[\s\S]*<span>用户名<\/span>[\s\S]*<span>授权码<\/span>/);
assert.match(appSource, /copyReauthorizationMachineInfo/);
assert.match(appSource, /replaceClientLicense/);
assert.match(appSource, /reauthorizationMessage\.value = '已重新授权成功'/);
assert.match(appSource, /accountMessage\.value = '已重新授权成功'/);
assert.match(appSource, /:class="\{ error: reauthorizationMessageIsError \}"/);
assert.match(
  appSource,
  /:disabled="reauthorizationBusy \|\| reauthorizationSucceeded" @click="copyReauthorizationMachineInfo"/
);
const copyReauthorizationSource = appSource.slice(
  appSource.indexOf('async function copyReauthorizationMachineInfo()'),
  appSource.indexOf('async function confirmReauthorization()')
);
assert.doesNotMatch(
  copyReauthorizationSource,
  /reauthorizationSucceeded\.value = false/
);
assert.doesNotMatch(
  appSource.match(/activePanel === 'account'[\s\S]{0,700}/)?.[0] || '',
  /expiresAt|suiteId|授权有效期|套装编号/
);

const replaceStart = mainSource.indexOf("trustedHandle('client-license:replace'");
const replaceEnd = mainSource.indexOf("trustedHandle('client-license:copy-machine-info'", replaceStart);
const replacementSource = mainSource.slice(replaceStart, replaceEnd);
const prepareIndex = replacementSource.indexOf('prepareReplacement(');
const commitIndex = replacementSource.indexOf('commitReplacement(');
assert.ok(replaceStart >= 0 && replaceEnd > replaceStart && prepareIndex >= 0 && commitIndex > prepareIndex);
assert.doesNotMatch(replacementSource, /getServiceSecret|PromptPath|PromptBundle|pendingRaw|serviceSecret/);
assert.match(licenseSource, /prepareReplacement\([\s\S]*recordAuthorizationFailure\(\)/);

const suite = generateSuiteKeyPair('123456789');
const prompts = { chineseToEnglish: '中译英规则', englishToChinese: '英译中规则' };
const signedBundle = createTranslationPromptBundle(suite.promptSigning.translation, prompts);
assert.deepEqual(verifyTranslationPromptBundle(suite.promptSigning.translation, signedBundle), prompts);
assert.equal(signedBundle.includes('old-service-secret'), false);
assert.equal(signedBundle.includes('new-service-secret'), false);

console.log('client-reauthorization: UI, non-destructive replacement, and prompt-signing independence contracts passed');

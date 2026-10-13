import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  createTranslationPromptBundle,
  verifyTranslationPromptBundle
} from '../dist-electron/translation-prompt-bundle.js';
import {
  createSmartReplyPromptBundle,
  verifySmartReplyPromptBundle
} from '../dist-electron/smart-reply-prompt-bundle.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = relativePath =>
  fs.readFileSync(path.join(projectRoot, relativePath), 'utf8').replace(/^\uFEFF/, '');
const sha256 = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

const translationPrompts = JSON.parse(readText('config/translation-prompts.default.json'));
const smartReplyPrompt = readText('config/smart-reply-prompt.default.txt')
  .replace(/\r\n?/g, '\n')
  .trim();
const promptManifest = JSON.parse(readText('config/prompt-sources.manifest.json'));
assert.deepEqual(Object.keys(translationPrompts).sort(), ['chineseToEnglish', 'englishToChinese']);
assert.equal(sha256(translationPrompts.chineseToEnglish), promptManifest.chineseToEnglishSha256);
assert.equal(sha256(translationPrompts.englishToChinese), promptManifest.englishToChineseSha256);
assert.equal(sha256(smartReplyPrompt), promptManifest.smartReplySha256);
assert.equal(
  sha256(JSON.stringify({
    chineseToEnglish: translationPrompts.chineseToEnglish,
    englishToChinese: translationPrompts.englishToChinese,
    smartReply: smartReplyPrompt
  })),
  promptManifest.combinedSha256
);
assert.equal(promptManifest.containsDeepSeekApiKey, false);

const appSource = readText('src/App.vue');
const styleSource = readText('src/styles.css');
const sharedSource = readText('electron/shared.ts');
const mainSource = readText('electron/main.ts');
const packageJson = JSON.parse(readText('package.json'));
const clientBuilder = readText('electron-builder.client-suite.cjs');
const translationBuilder = readText('tools/build-translation-prompt-bundle.mjs');
const smartReplyBuilder = readText('tools/build-smart-reply-prompt-bundle.mjs');
assert.match(sharedSource, /export type AppTheme = 'pink' \| 'blackGold' \| 'murongPurple' \| 'clearWaterBlue';/);
for (const [theme, label] of [
  ['pink', '玫瑰粉'],
  ['blackGold', '高端金'],
  ['murongPurple', '慕容紫'],
  ['clearWaterBlue', '晴水蓝']
]) {
  assert.match(appSource, new RegExp(`setTheme\\('${theme}'\\)">${label}<\\/button>`));
}
for (const className of [
  'theme-pink',
  'theme-black-gold',
  'theme-murong-purple',
  'theme-clear-water-blue'
]) {
  assert.match(styleSource, new RegExp(`\\.${className}\\b`));
}
assert.equal(packageJson.build.appId, 'com.maoyi.translator');
assert.equal(packageJson.build.productName, '皮卡丘翻译器');
assert.equal(packageJson.productName, '皮卡丘翻译器');
assert.match(clientBuilder, /appId: 'com\.maoyi\.translator'/);
assert.match(clientBuilder, /productName: '皮卡丘翻译器'/);
assert.match(mainSource, /const appUserDataDirName = 'maoyi';/);
assert.match(mainSource, /const appDataFolderName = 'maoyi Data';/);
assert.match(translationBuilder, /config', 'translation-prompts\.default\.json'/);
assert.match(smartReplyBuilder, /config', 'smart-reply-prompt\.default\.txt'/);
for (const promptSource of [JSON.stringify(translationPrompts), smartReplyPrompt]) {
  assert.doesNotMatch(promptSource, /sk-[a-z0-9_-]{16,}/i);
  assert.doesNotMatch(promptSource, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
}

const excludedPublicScanDirectories = new Set([
  '.git',
  '.package-secrets',
  '.package-staging',
  '.pnpm-store',
  '.pnpm-store-complete',
  '.runtime',
  '.tmp',
  '.toolchains',
  'dist',
  'dist-electron',
  'node_modules',
  'release'
]);
const repositoryFiles = [];
function collectPublicSourceFiles(directory, relativeDirectory = '') {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  for (const entry of entries) {
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (
        (!relativeDirectory && excludedPublicScanDirectories.has(entry.name)) ||
        relativePath.startsWith('reference-sources/')
      ) {
        continue;
      }
      collectPublicSourceFiles(absolutePath, relativePath);
      continue;
    }
    if (!entry.isFile() || entry.name.endsWith('.log')) continue;
    if (relativePath.startsWith('internal-tools/') && entry.name.endsWith('.exe')) continue;
    repositoryFiles.push(relativePath);
  }
}
collectPublicSourceFiles(projectRoot);
assert.ok(repositoryFiles.includes('package.json'), 'public source scan must include package.json');
assert.equal(
  repositoryFiles.some(relativePath => relativePath.startsWith('.git/')),
  false,
  'public source scan must not depend on Git metadata'
);
const privateKeyHeader = Buffer.from(['-----BEGIN', ' PRIVATE KEY-----'].join(''), 'utf8');
for (const relativePath of repositoryFiles) {
  const absolutePath = path.join(projectRoot, relativePath);
  const stat = fs.statSync(absolutePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size > 5 * 1024 * 1024) continue;
  const content = fs.readFileSync(absolutePath);
  assert.equal(content.includes(privateKeyHeader), false, `private key entered public source: ${relativePath}`);
  const text = content.toString('utf8');
  assert.doesNotMatch(text, /sk-[a-z0-9_-]{16,}/i, `probable API key entered public source: ${relativePath}`);
}

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maoyi-new-suite-reproduction-'));
try {
  const isolatedTools = path.join(testRoot, 'tools');
  fs.mkdirSync(isolatedTools, { recursive: true });
  for (const name of ['create-license-suite.cjs', 'prepare-client-license-suite.cjs']) {
    fs.copyFileSync(path.join(projectRoot, 'tools', name), path.join(isolatedTools, name));
  }
  const createResult = spawnSync(process.execPath, [path.join(isolatedTools, 'create-license-suite.cjs')], {
    cwd: testRoot,
    encoding: 'utf8'
  });
  assert.equal(createResult.status, 0, createResult.stderr || createResult.stdout);
  const suiteId = /suiteId=(\d{9})/.exec(createResult.stdout)?.[1] || '';
  assert.match(suiteId, /^\d{9}$/);
  const secretsRoot = path.join(testRoot, '.package-secrets');
  const suitePath = path.join(secretsRoot, 'license-suites', `${suiteId}.json`);
  const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
  assert.equal(suite.suiteId, suiteId);
  assert.equal(suite.issuerId, 'maoyi-offline-issuer');
  assert.equal(suite.productId, 'maoyi');
  for (const identity of [
    suite,
    suite.promptSigning.translation,
    suite.promptSigning.smartReply
  ]) {
    assert.equal(
      crypto.createPublicKey(crypto.createPrivateKey(identity.privateKeyPem))
        .export({ type: 'spki', format: 'pem' })
        .toString(),
      identity.publicKeyPem
    );
    assert.equal(sha256(identity.publicKeyPem), identity.publicKeySha256);
    assert.equal(sha256(identity.privateKeyPem), identity.privateKeySha256);
  }
  const registry = JSON.parse(fs.readFileSync(path.join(secretsRoot, 'suite-id-registry.json'), 'utf8'));
  assert.equal(registry.ids.length, 10_000);
  assert.equal(registry.ids.filter(item => item.status === 'consumed').length, 1);
  assert.equal(registry.ids.find(item => item.status === 'consumed')?.suiteId, suiteId);

  const clientResult = spawnSync(
    process.execPath,
    [path.join(isolatedTools, 'prepare-client-license-suite.cjs')],
    {
      cwd: testRoot,
      env: { ...process.env, MAOYI_LICENSE_SUITE_PATH: suitePath },
      encoding: 'utf8'
    }
  );
  assert.equal(clientResult.status, 0, clientResult.stderr || clientResult.stdout);
  const clientSuite = JSON.parse(fs.readFileSync(path.join(secretsRoot, 'client-license-suite.json'), 'utf8'));
  assert.equal(clientSuite.suiteId, suiteId);
  assert.equal(JSON.stringify(clientSuite).includes('privateKeyPem'), false);

  const translationBundle = createTranslationPromptBundle(
    suite.promptSigning.translation,
    translationPrompts,
    '2026-07-25T00:00:00.000Z'
  );
  assert.deepEqual(
    verifyTranslationPromptBundle(clientSuite.promptSigning.translation, translationBundle),
    translationPrompts
  );
  const smartReplyBundle = createSmartReplyPromptBundle(
    suite.promptSigning.smartReply,
    { prompt: smartReplyPrompt },
    '2026-07-25T00:00:00.000Z'
  );
  assert.equal(
    verifySmartReplyPromptBundle(clientSuite.promptSigning.smartReply, smartReplyBundle).prompt,
    smartReplyPrompt
  );
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true });
}

console.log('public-reproduction: exact prompts, fresh suite identities, maoyi identity, and four themes passed');

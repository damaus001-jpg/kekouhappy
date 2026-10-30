import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
const clientLicense = fs.readFileSync(path.join(root, 'electron', 'client-license.ts'), 'utf8');
const runtimeSecurity = fs.readFileSync(path.join(root, 'electron', 'runtime-security.ts'), 'utf8');
const suiteCreator = fs.readFileSync(path.join(root, 'tools', 'create-license-suite.cjs'), 'utf8');
const clientPreparer = fs.readFileSync(path.join(root, 'tools', 'prepare-client-license-suite.cjs'), 'utf8');
const packager = fs.readFileSync(path.join(root, 'tools', 'package-license-suite.cjs'), 'utf8');

assert.doesNotMatch(suiteCreator, /MAOYI_SUITE_SEQUENCE === '009'/);
assert.doesNotMatch(suiteCreator, /upgradeFrom/);
assert.doesNotMatch(suiteCreator, /214951785|k_214951785_mrsksx86_0cabc370/);
assert.match(clientPreparer, /upgradeFrom/);
assert.match(clientLicense, /getRuntimeUpgradeSources\(\)/);

const cloneCheck = main.slice(
  main.indexOf('async function verifyRuntimeCloneState()'),
  main.indexOf('async function hasSignalStartupCorruption')
);
assert.match(cloneCheck, /inspectRuntimeBinding\(defaultRuntimeBindingPath\(\), \{[\s\S]*hardwareHash:[\s\S]*devicePublicKeyPem:/);
assert.match(cloneCheck, /source\.suiteId === localUpgradeSource\.payload\.suiteId/);
assert.match(cloneCheck, /source\.keyId === localUpgradeSource\.payload\.keyId/);
assert.match(cloneCheck, /await beginForeignCloneReset\(inspection\.file\)/);

const prepareRuntime = main.slice(
  main.indexOf('async function prepareAuthorizedRuntime()'),
  main.indexOf('async function runDevelopmentCacheSmokeCheck()')
);
assert.match(prepareRuntime, /migrateTranslationCacheSuiteBinding/);
assert.match(prepareRuntime, /upgradeRuntimeBinding/);
assert.ok(
  prepareRuntime.indexOf('migrateTranslationCacheSuiteBinding') < prepareRuntime.indexOf('upgradeRuntimeBinding'),
  'cache ownership must migrate before the runtime binding so interrupted upgrades can retry safely'
);
assert.match(runtimeSecurity, /createUpgradedRuntimeBindingPayload/);
assert.doesNotMatch(prepareRuntime, /rm\(translationCacheRoot/);

const sealIssuer = packager.slice(
  packager.indexOf('function sealIssuerSuite'),
  packager.indexOf('function copySingleExe')
);
assert.doesNotMatch(sealIssuer, /JSON\.stringify\(suite\)/);
assert.doesNotMatch(sealIssuer, /promptSigning/);
assert.match(packager, /prepare-prompt-generator-signing\.cjs/);

console.log('suite-upgrade: suite 009 rejects legacy-suite authorization while generic same-machine migration remains isolated');

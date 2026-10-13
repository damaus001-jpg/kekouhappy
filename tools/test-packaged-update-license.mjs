import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { extractFile } from '@electron/asar';

const root = process.cwd();
const oldManifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const resources = path.resolve(process.argv[3] || 'release/win-unpacked/resources');
const publicSuite = JSON.parse(fs.readFileSync(path.join(resources, 'license-suite-public.json'), 'utf8'));
const privateSuite = JSON.parse(fs.readFileSync(path.join(root, '.package-secrets/license-suites', `${oldManifest.suiteId}.json`), 'utf8'));
assert.equal(publicSuite.suiteId, oldManifest.suiteId);
assert.equal(publicSuite.keyId, oldManifest.keyId);
assert.equal(createHash('sha256').update(publicSuite.publicKeyPem).digest('hex'), oldManifest.publicKeySha256);
for (const kind of ['translation', 'smartReply']) {
  assert.equal(publicSuite.promptSigning[kind].publicKeySha256, oldManifest[`${kind}PromptPublicKeySha256`]);
}
// Execute the license verifier actually shipped inside the new application.
const code = extractFile(path.join(resources, 'app.asar'), 'dist-electron/license-core.js').toString();
const core = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const device = generateKeyPairSync('x25519');
const machineCode = core.createMachineCode({ suiteId: oldManifest.suiteId, hardwareHash: '1'.repeat(64), encryptionPublicKeyPem: device.publicKey.export({ type: 'spki', format: 'pem' }).toString() });
const username = 'offline-update-acceptance';
const license = core.issueLicenseCode({ suite: privateSuite, machineCode, username, serviceSecret: 'synthetic-test-secret', authorizedDays: 30, issuedAt: Date.parse(oldManifest.completedAt) });
const result = core.verifyLicenseCode({ code: license, suite: publicSuite, machineCode, username, deviceEncryptionPrivateKeyPem: device.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
assert.ok(result.ok, result.reason);
assert.equal(result.payload.serviceSecret, 'synthetic-test-secret');
console.log(`Packaged update identity and existing-suite license compatibility passed: suite ${publicSuite.suiteId}`);

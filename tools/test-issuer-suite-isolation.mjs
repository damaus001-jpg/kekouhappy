import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const issuerSource = fs.readFileSync(path.join(projectRoot, 'electron', 'license-issuer.ts'), 'utf8');
const clientLicenseSource = fs.readFileSync(path.join(projectRoot, 'electron', 'client-license.ts'), 'utf8');
const packageSource = fs.readFileSync(path.join(projectRoot, 'tools', 'package-license-suite.cjs'), 'utf8');
const rendererSource = fs.readFileSync(path.join(projectRoot, 'license-issuer', 'renderer.js'), 'utf8');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maoyi-issuer-suite-test-'));
const fixturePath = path.join(fixtureRoot, 'developer-license-suite.json');
const { publicKey } = generateKeyPairSync('ed25519');
fs.writeFileSync(fixturePath, JSON.stringify({
  suiteId: '123456789',
  issuerId: 'maoyi-offline-issuer',
  productId: 'maoyi',
  keyId: 'k_123456789_test',
  publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString()
}), { encoding: 'utf8', mode: 0o600 });

try {
  const developerSuite = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const contracts = [
    [issuerSource.includes("join(app.getPath('appData'), 'MAOYI AUTHORIZER', packagedIssuerIdentity.suiteId)"), 'packaged issuer user data is not namespaced by suite ID'],
    [issuerSource.includes('if (!isAbsolute(issuerUserDataOverride))'), 'issuer user-data override does not require an absolute path'],
    [issuerSource.includes('suite.suiteId !== packagedIssuerIdentity.suiteId'), 'vault suite ID is not bound to the packaged issuer'],
    [issuerSource.includes('suite.keyId !== packagedIssuerIdentity.keyId'), 'vault key ID is not bound to the packaged issuer'],
    [issuerSource.includes("(suite.publicKeySha256 || '').toLowerCase() !== packagedIssuerIdentity.publicKeySha256"), 'vault public-key fingerprint is not bound to the packaged issuer'],
    [packageSource.includes('suiteId: suite.suiteId'), 'issuer bootstrap metadata omits suite ID'],
    [packageSource.includes('keyId: suite.keyId'), 'issuer bootstrap metadata omits key ID'],
    [packageSource.includes('publicKeySha256: suite.publicKeySha256'), 'issuer bootstrap metadata omits public-key fingerprint'],
    [issuerSource.includes('function isSafeStorageDecryptionFailure(error: unknown)'), 'issuer does not recognize an unreadable DPAPI state file'],
    [issuerSource.includes('if (existsSync(issuerVaultPath())) {\n      // The password-encrypted vault remains authoritative.'), 'issuer does not preserve an existing encrypted vault during state recovery'],
    [issuerSource.includes('state.recoveryRequired = true;'), 'issuer does not mark incomplete state for password recovery'],
    [issuerSource.includes('unlocked = await unlockIssuerVault(password);'), 'issuer recovery does not prove the original password against the encrypted vault'],
    [issuerSource.includes('delete state.recoveryRequired;'), 'issuer does not clear recovery state after rebuilding the password verifier'],
    [clientLicenseSource.includes("'.package-secrets', 'developer-license-suite.json'"), 'developer client does not use its dedicated public suite identity'],
    [!clientLicenseSource.includes("'.package-secrets', 'current-license-suite.json'"), 'developer client still follows the mutable packaging suite identity'],
    [!packageSource.includes('developer-license-suite.json'), 'full-suite packaging is allowed to mutate the developer suite identity'],
    [rendererSource.includes("if (!status.initialized) {\n    show(setupPanel);"), 'fresh issuer state does not open the password setup panel']
  ];

  for (const [ok, message] of contracts) {
    if (!ok) throw new Error(message);
  }

  assertPublicDeveloperSuite(developerSuite);
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

function assertPublicDeveloperSuite(value) {
  const keys = Object.keys(value).sort();
  const expectedKeys = ['issuerId', 'keyId', 'productId', 'publicKeyPem', 'suiteId'].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error('developer suite identity must contain public fields only');
  }
  if (!/^\d{9}$/.test(value.suiteId) || !value.keyId || !value.publicKeyPem) {
    throw new Error('developer suite public identity is incomplete');
  }
}

console.log('issuer-suite-isolation: fresh setup, suite-scoped state, and vault identity binding contracts passed');

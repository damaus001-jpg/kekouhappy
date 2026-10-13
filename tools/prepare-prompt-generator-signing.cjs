const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = process.env.MAOYI_LICENSE_SUITE_PATH?.trim() ||
  path.join(root, '.package-secrets', 'developer-prompt-signing.json');
const outputPath = path.join(root, '.package-staging', 'prompt-generator-signing.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8').replace(/^\uFEFF/, ''));
const identity = process.env.MAOYI_LICENSE_SUITE_PATH?.trim()
  ? source.promptSigning?.translation
  : source.translation;

for (const field of [
  'suiteId',
  'keyId',
  'publicKeyPem',
  'privateKeyPem',
  'publicKeySha256',
  'privateKeySha256'
]) {
  if (typeof identity?.[field] !== 'string' || !identity[field]) {
    throw new Error(`Translation prompt signing identity is missing ${field}.`);
  }
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  suiteId: identity.suiteId,
  keyId: identity.keyId,
  identity
}, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(`promptGeneratorSigning=${outputPath}`);
console.log(`suiteId=${identity.suiteId}`);
console.log(`keyId=${identity.keyId}`);

const { mkdirSync, readFileSync, writeFileSync } = require('fs');
const { dirname, join } = require('path');

const root = join(__dirname, '..');
const sourcePath = process.env.MAOYI_LICENSE_SUITE_PATH || join(root, '.package-secrets', 'current-license-suite.json');
const outputPath = join(root, '.package-secrets', 'client-license-suite.json');

const suite = JSON.parse(readFileSync(sourcePath, 'utf8'));
const publicSuite = {
  suiteId: String(suite.suiteId || ''),
  issuerId: String(suite.issuerId || ''),
  productId: String(suite.productId || ''),
  keyId: String(suite.keyId || ''),
  publicKeyPem: String(suite.publicKeyPem || ''),
  promptSigning: {
    translation: {
      suiteId: String(suite.promptSigning?.translation?.suiteId || ''),
      keyId: String(suite.promptSigning?.translation?.keyId || ''),
      publicKeyPem: String(suite.promptSigning?.translation?.publicKeyPem || ''),
      publicKeySha256: String(suite.promptSigning?.translation?.publicKeySha256 || '')
    },
    smartReply: {
      suiteId: String(suite.promptSigning?.smartReply?.suiteId || ''),
      keyId: String(suite.promptSigning?.smartReply?.keyId || ''),
      publicKeyPem: String(suite.promptSigning?.smartReply?.publicKeyPem || ''),
      publicKeySha256: String(suite.promptSigning?.smartReply?.publicKeySha256 || '')
    }
  },
  upgradeFrom: Array.isArray(suite.upgradeFrom)
    ? suite.upgradeFrom.map((source) => ({
        suiteId: String(source?.suiteId || ''),
        keyId: String(source?.keyId || '')
      }))
    : undefined
};

if (publicSuite.upgradeFrom === undefined) delete publicSuite.upgradeFrom;

for (const [key, value] of Object.entries(publicSuite)) {
  if (!value) throw new Error(`Missing client license suite field: ${key}`);
}
for (const [kind, identity] of Object.entries(publicSuite.promptSigning)) {
  for (const [key, value] of Object.entries(identity)) {
    if (!value) throw new Error(`Missing ${kind} prompt signing field: ${key}`);
  }
  if (identity.suiteId !== publicSuite.suiteId) {
    throw new Error(`${kind} prompt signing suite ID does not match the client suite.`);
  }
}
if (publicSuite.upgradeFrom?.some((source) =>
  !/^\d{9}$/.test(source.suiteId) ||
  !/^k_[a-z0-9_]+$/i.test(source.keyId) ||
  source.suiteId === publicSuite.suiteId
)) throw new Error('Client suite upgrade source is invalid.');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(publicSuite, null, 2)}\n`, 'utf8');
console.log(`clientSuite=${publicSuite.suiteId}`);
console.log(`clientKey=${publicSuite.keyId}`);
console.log(`output=${outputPath}`);

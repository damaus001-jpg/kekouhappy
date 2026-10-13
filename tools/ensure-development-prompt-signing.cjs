const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const outputPath = path.join(root, '.package-secrets', 'developer-prompt-signing.json');

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function createIdentity(kind) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return {
    suiteId: 'development',
    keyId: `pk_development_${kind}_${crypto.randomBytes(8).toString('hex')}`,
    publicKeyPem,
    privateKeyPem,
    publicKeySha256: sha256Hex(publicKeyPem),
    privateKeySha256: sha256Hex(privateKeyPem)
  };
}

function validIdentity(value, kind) {
  return value?.suiteId === 'development' &&
    new RegExp(`^pk_development_${kind}_[a-f0-9]{16}$`).test(value.keyId || '') &&
    /^[a-f0-9]{64}$/.test(value.publicKeySha256 || '') &&
    /^[a-f0-9]{64}$/.test(value.privateKeySha256 || '') &&
    typeof value.publicKeyPem === 'string' &&
    typeof value.privateKeyPem === 'string';
}

if (fs.existsSync(outputPath)) {
  const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  if (!validIdentity(existing.translation, 'translation') || !validIdentity(existing.smartReply, 'smart-reply')) {
    throw new Error('Development prompt signing identity is invalid; refusing to replace it automatically.');
  }
  console.log(`developmentPromptSigning=${outputPath}`);
  console.log('status=existing');
  process.exit(0);
}

const signing = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  translation: createIdentity('translation'),
  smartReply: createIdentity('smart-reply')
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(signing, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
console.log(`developmentPromptSigning=${outputPath}`);
console.log('status=created');

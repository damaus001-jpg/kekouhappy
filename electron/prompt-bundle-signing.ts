import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from 'node:crypto';

export type PromptBundleKind = 'translation' | 'smart-reply';

export type PromptSigningPublicIdentity = {
  suiteId: string;
  keyId: string;
  publicKeyPem: string;
  publicKeySha256: string;
};

export type PromptSigningPrivateIdentity = PromptSigningPublicIdentity & {
  privateKeyPem: string;
  privateKeySha256: string;
};

export type SignedPromptBundle = {
  schemaVersion: 2;
  format: 'DF-PROMPT-SIGNED';
  algorithm: 'Ed25519';
  suiteId: string;
  keyId: string;
  kind: PromptBundleKind;
  payload: string;
  signature: string;
};

const maxBundleBytes = 192 * 1024;

function sha256Hex(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function assertIdentifier(value: string, label: string) {
  if (typeof value !== 'string' || !/^[a-z0-9._-]{1,128}$/i.test(value)) {
    throw new Error(`${label}无效`);
  }
  return value;
}

function validatePublicIdentity(identity: PromptSigningPublicIdentity) {
  assertIdentifier(identity?.suiteId, '提示词套装 ID');
  assertIdentifier(identity?.keyId, '提示词签名密钥 ID');
  if (!/^[a-f0-9]{64}$/i.test(identity?.publicKeySha256 || '')) {
    throw new Error('提示词签名公钥指纹无效');
  }
  const publicKey = createPublicKey(identity.publicKeyPem);
  if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('提示词签名公钥类型无效');
  const normalizedPublicKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  if (sha256Hex(normalizedPublicKey) !== identity.publicKeySha256.toLowerCase()) {
    throw new Error('提示词签名公钥指纹不匹配');
  }
  return { ...identity, publicKeyPem: normalizedPublicKey };
}

function validatePrivateIdentity(identity: PromptSigningPrivateIdentity) {
  const validated = validatePublicIdentity(identity);
  if (!/^[a-f0-9]{64}$/i.test(identity?.privateKeySha256 || '')) {
    throw new Error('提示词签名私钥指纹无效');
  }
  const privateKey = createPrivateKey(identity.privateKeyPem);
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('提示词签名私钥类型无效');
  const normalizedPrivateKey = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  if (sha256Hex(normalizedPrivateKey) !== identity.privateKeySha256.toLowerCase()) {
    throw new Error('提示词签名私钥指纹不匹配');
  }
  const derivedPublicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
  if (derivedPublicKey !== validated.publicKeyPem) throw new Error('提示词签名公私钥不匹配');
  return { ...identity, publicKeyPem: validated.publicKeyPem, privateKeyPem: normalizedPrivateKey };
}

function canonicalBundle(bundle: Omit<SignedPromptBundle, 'signature'>) {
  return JSON.stringify([
    'maoyi-prompt-bundle-signature-v2',
    bundle.schemaVersion,
    bundle.format,
    bundle.algorithm,
    bundle.suiteId,
    bundle.keyId,
    bundle.kind,
    bundle.payload
  ]);
}

function parseBundle(raw: string) {
  if (typeof raw !== 'string' || !raw.trim() || Buffer.byteLength(raw, 'utf8') > maxBundleBytes) {
    throw new Error('提示词文件大小或格式无效');
  }
  let bundle: SignedPromptBundle;
  try {
    bundle = JSON.parse(raw) as SignedPromptBundle;
  } catch {
    throw new Error('提示词文件不是有效 JSON');
  }
  const expectedKeys = ['algorithm', 'format', 'keyId', 'kind', 'payload', 'schemaVersion', 'signature', 'suiteId'];
  if (JSON.stringify(Object.keys(bundle || {}).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('提示词文件字段无效');
  }
  if (
    bundle.schemaVersion !== 2 ||
    bundle.format !== 'DF-PROMPT-SIGNED' ||
    bundle.algorithm !== 'Ed25519'
  ) throw new Error('提示词文件版本或签名算法无效');
  assertIdentifier(bundle.suiteId, '提示词文件套装 ID');
  assertIdentifier(bundle.keyId, '提示词文件密钥 ID');
  if (!['translation', 'smart-reply'].includes(bundle.kind)) throw new Error('提示词文件类型无效');
  if (!bundle.payload || Buffer.byteLength(bundle.payload, 'base64url') > maxBundleBytes) {
    throw new Error('提示词文件内容无效');
  }
  const signature = Buffer.from(bundle.signature || '', 'base64url');
  if (signature.length !== 64) throw new Error('提示词文件签名长度无效');
  return bundle;
}

export function signPromptBundle(
  identity: PromptSigningPrivateIdentity,
  kind: PromptBundleKind,
  payload: unknown
) {
  const validated = validatePrivateIdentity(identity);
  const unsigned: Omit<SignedPromptBundle, 'signature'> = {
    schemaVersion: 2,
    format: 'DF-PROMPT-SIGNED',
    algorithm: 'Ed25519',
    suiteId: validated.suiteId,
    keyId: validated.keyId,
    kind,
    payload: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  };
  const signature = sign(null, Buffer.from(canonicalBundle(unsigned), 'utf8'), validated.privateKeyPem);
  return `${JSON.stringify({ ...unsigned, signature: signature.toString('base64url') } satisfies SignedPromptBundle)}\n`;
}

export function verifyPromptBundle(
  identity: PromptSigningPublicIdentity,
  kind: PromptBundleKind,
  raw: string
) {
  const validated = validatePublicIdentity(identity);
  const bundle = parseBundle(raw);
  if (bundle.suiteId !== validated.suiteId) throw new Error('提示词文件与当前套装不匹配');
  if (bundle.keyId !== validated.keyId) throw new Error('提示词文件签名密钥不匹配');
  if (bundle.kind !== kind) throw new Error('提示词文件类型不匹配');
  const { signature, ...unsigned } = bundle;
  const valid = verify(
    null,
    Buffer.from(canonicalBundle(unsigned), 'utf8'),
    validated.publicKeyPem,
    Buffer.from(signature, 'base64url')
  );
  if (!valid) throw new Error('提示词文件签名无效，文件可能已被篡改');
  try {
    return JSON.parse(Buffer.from(bundle.payload, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw new Error('提示词文件内容解析失败');
  }
}

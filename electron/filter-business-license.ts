import {
  createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey,
  diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, randomInt, timingSafeEqual
} from 'node:crypto';

type SuiteIdentity = { suiteId: string; keyId: string; privateKeyPem: string };
export type FilterBusinessPublicIdentity = { suiteId: string; keyId: string; encryptionPublicKey: string };
const prefix = 'WNFB1.';
const purpose = 'whatsapp-number-filter';
const context = Buffer.from('maoyi/filter-business-license/v1');

function assertIdentity(value: { suiteId: string; keyId: string }) {
  if (!/^\d{9}$/.test(value.suiteId) || !/^k_[a-z0-9_]{1,120}$/i.test(value.keyId)) throw new Error('筛选业务套装身份无效');
}

function businessPrivateKey(suite: SuiteIdentity) {
  assertIdentity(suite);
  const signingKey = createPrivateKey(suite.privateKeyPem);
  if (signingKey.asymmetricKeyType !== 'ed25519') throw new Error('筛选业务套装密钥类型无效');
  const seed = createHash('sha256').update(context).update(suite.suiteId).update(suite.keyId)
    .update(signingKey.export({ type: 'pkcs8', format: 'der' })).digest();
  try {
    return createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  } finally { seed.fill(0); }
}

export function filterBusinessPublicIdentity(suite: SuiteIdentity): FilterBusinessPublicIdentity {
  return { suiteId: suite.suiteId, keyId: suite.keyId,
    encryptionPublicKey: createPublicKey(businessPrivateKey(suite)).export({ type: 'spki', format: 'der' }).toString('base64') };
}

function decode(value: unknown, maximum: number, exact?: number) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > maximum * 2) throw new Error('筛选本机码编码无效');
  const result = Buffer.from(value, 'base64');
  if (result.toString('base64') !== value || result.length > maximum || (exact !== undefined && result.length !== exact)) throw new Error('筛选本机码参数无效');
  return result;
}

function encryptionKey(privateKey: ReturnType<typeof createPrivateKey>, publicKeyBytes: Buffer, salt: Buffer) {
  const publicKey = createPublicKey({ key: publicKeyBytes, format: 'der', type: 'spki' });
  if (publicKey.asymmetricKeyType !== 'x25519') throw new Error('筛选本机码公钥无效');
  const shared = diffieHellman({ privateKey, publicKey });
  try { return Buffer.from(hkdfSync('sha256', shared, salt, context, 32)); }
  finally { shared.fill(0); }
}

// The four-digit secret is sealed to the issuer. A customer only keeps its
// verifier and the sealed machine challenge, never an issuer private key.
export function createFilterBusinessMachineCode(identity: FilterBusinessPublicIdentity, hardwareHash: string) {
  assertIdentity(identity);
  if (!/^[a-f0-9]{64}$/i.test(hardwareHash)) throw new Error('筛选本机标识无效');
  const pin = String(randomInt(10_000)).padStart(4, '0');
  const core = { version: 1, purpose, suiteId: identity.suiteId, keyId: identity.keyId,
    hardwareHash: hardwareHash.toLowerCase(), nonce: randomBytes(16).toString('hex') };
  const ephemeral = generateKeyPairSync('x25519');
  const salt = randomBytes(32), iv = randomBytes(12);
  const key = encryptionKey(ephemeral.privateKey, decode(identity.encryptionPublicKey, 128), salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(JSON.stringify(core)));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify({ pin, hardwareHash: core.hardwareHash, nonce: core.nonce })), cipher.final()]);
    const envelope = { ...core, ephemeralPublicKey: ephemeral.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
    const machineCode = prefix + Buffer.from(JSON.stringify(envelope)).toString('base64url');
    return { machineCode, verifier: pinVerifier(machineCode, pin) };
  } finally { key.fill(0); }
}

function pinVerifier(machineCode: string, pin: string) {
  return createHash('sha256').update(context).update(machineCode).update(pin).digest('hex');
}

export function verifyFilterBusinessCode(machineCode: string, verifier: string, pin: string) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin) || !/^[a-f0-9]{64}$/.test(verifier)) return false;
  return timingSafeEqual(Buffer.from(verifier, 'hex'), Buffer.from(pinVerifier(machineCode, pin), 'hex'));
}

export function issueFilterBusinessCode(suite: SuiteIdentity, machineCode: string) {
  assertIdentity(suite);
  if (typeof machineCode !== 'string' || machineCode.length > 4096 || !machineCode.startsWith(prefix)) throw new Error('请粘贴筛选器提供的业务本机码（WNFB1）');
  const encoded = machineCode.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('筛选本机码编码无效');
  let value: Record<string, unknown>;
  try { value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch { throw new Error('筛选本机码格式无效'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'ciphertext,ephemeralPublicKey,hardwareHash,iv,keyId,nonce,purpose,salt,suiteId,tag,version') throw new Error('筛选本机码字段无效');
  if (value.version !== 1 || value.purpose !== purpose || value.suiteId !== suite.suiteId || value.keyId !== suite.keyId) throw new Error('筛选本机码与当前套装不匹配');
  if (typeof value.hardwareHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.hardwareHash) || typeof value.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(value.nonce)) throw new Error('筛选本机码标识无效');
  const core = { version: 1, purpose, suiteId: suite.suiteId, keyId: suite.keyId, hardwareHash: value.hardwareHash, nonce: value.nonce };
  const key = encryptionKey(businessPrivateKey(suite), decode(value.ephemeralPublicKey, 128), decode(value.salt, 32, 32));
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, decode(value.iv, 12, 12));
    decipher.setAAD(Buffer.from(JSON.stringify(core)));
    decipher.setAuthTag(decode(value.tag, 16, 16));
    const payload = JSON.parse(Buffer.concat([decipher.update(decode(value.ciphertext, 1024)), decipher.final()]).toString('utf8'));
    if (!/^\d{4}$/.test(payload.pin) || payload.hardwareHash !== core.hardwareHash || payload.nonce !== core.nonce) throw new Error('筛选本机码内容无效');
    return { business: purpose, authorizationCode: payload.pin as string, suiteId: suite.suiteId, keyId: suite.keyId, hardwareHash: core.hardwareHash };
  } catch { throw new Error('筛选本机码验证失败，请确认本机码完整且属于当前套装'); }
  finally { key.fill(0); }
}

import { app, clipboard, nativeImage, safeStorage } from 'electron';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assistantMediaPath } from './assistant-library.js';
import type { AssistantContact, AssistantMaterial, AssistantStagedMaterial, AssistantUsage, AssistantUseRequest } from './assistant-material-types.js';
import { normalizeAssistantPhone } from './assistant-material-identity.js';

let staged: AssistantStagedMaterial | null = null;
let clipboardImageCheckedAt=0,clipboardImageMatches=false;
let queue: Promise<unknown> = Promise.resolve();
const receipts = new Map<string, AssistantUsage>();
const directory = () => join(app.getPath('userData'), 'assistant-library');
const filename = () => join(directory(), 'usage.enc');
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function bounded(value: unknown, max: number, label: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) throw new Error(`${label}无效`);
  return value;
}
async function readAllAssistantUsage(): Promise<AssistantUsage[]> {
  let bytes: Buffer;
  try { bytes = await readFile(filename()); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('素材使用记录保护不可用');
  const data = JSON.parse(safeStorage.decryptString(bytes));
  if (data.schemaVersion !== 1 || !Array.isArray(data.records)) throw new Error('素材使用记录损坏');
  return data.records;
}
async function saveAssistantUsage(records: AssistantUsage[]) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('素材使用记录保护不可用');
  await mkdir(directory(), { recursive: true });
  const temp = join(directory(), `usage-${randomUUID()}.tmp`);
  try { await writeFile(temp, safeStorage.encryptString(JSON.stringify({ schemaVersion: 1, records }))); await rename(temp, filename()); }
  finally { await unlink(temp).catch(() => {}); }
}
export async function readAssistantUsage(profileId: string, contact?: AssistantContact): Promise<AssistantUsage[]> {
  bounded(profileId, 128, '账号');
  const phone = normalizeAssistantPhone(contact?.phone);
  const operation = async () => {
    const records = await readAllAssistantUsage();
    // Older records only have the account/session ID. Bind them when that session's
    // actual receiver number is available; never guess a number from its display name.
    let changed = false;
    if (phone && contact?.id && /^sms:[^:\s]{1,720}:[^:\s]{1,384}$/.test(contact.id)) {
      for (const record of records) {
        if (record.platform === 'opensms' && record.contactId === contact.id && !record.phone) {
          record.phone = phone; changed = true;
        }
      }
    }
    if (changed) await saveAssistantUsage(records);
    return records.filter(r => profileId === '*' || r.profileId === profileId || (r.platform === 'opensms' && Boolean(r.phone)));
  };
  if (!phone) return operation();
  const next = queue.then(operation, operation); queue = next.catch(() => {}); return next;
}
export function removeAssistantUsageForProfile(profileId: string): Promise<void> {
  bounded(profileId, 128, '账号');
  const operation = async () => {
    const records = await readAllAssistantUsage();
    // SMS history belongs to the receiver number and survives closing/removing an account.
    const remaining = records.filter(record => record.profileId !== profileId || record.platform === 'opensms');
    for (const [token, receipt] of receipts) {
      if (receipt.profileId === profileId) receipts.delete(token);
    }
    if (remaining.length === records.length) return;
    await saveAssistantUsage(remaining);
  };
  const next = queue.then(operation, operation);
  queue = next.catch(() => {});
  return next;
}
export async function stageAssistantMaterial(material: AssistantMaterial): Promise<AssistantStagedMaterial> {
  bounded(material.id, 200, '素材编号');
  const value: AssistantStagedMaterial = { id: material.id, type: material.type, token: randomUUID(), expiresAt: Date.now() + 30 * 60 * 1000 };
  if (material.type === 'text') {
    if (typeof material.text !== 'string' || !material.text.trim() || material.text.length > 16000) throw new Error('文字素材为空或过长');
    value.text = material.text;
    value.id = `${material.id.split(':v:')[0]}:v:${hash(material.text)}`;
    clipboard.writeText(material.text);
  } else if (material.type === 'image') {
    const path = await assistantMediaPath(bounded(material.mediaId, 80, '图片编号'));
    const image = nativeImage.createFromPath(path);
    if (image.isEmpty()) throw new Error('图片无法复制');
    const png = image.toPNG();
    if (png.length > 25 * 1024 * 1024) throw new Error('图片复制大小超过25MB');
    value.mediaId = material.mediaId; value.name = (material.name || '素材.png').slice(0, 255);
    value.id = `image:${material.mediaId!.split('.')[0]}`; value.imageHash = hash(png);
    value.imageData = `data:image/png;base64,${png.toString('base64')}`;
    clipboard.writeImage(image);
  } else throw new Error('只支持文字和图片素材');
  staged = value;
  clipboardImageCheckedAt=0;
  return value;
}
export async function readAssistantImage(mediaId:string) {
  const image=nativeImage.createFromPath(await assistantMediaPath(bounded(mediaId,80,'图片编号')));
  if(image.isEmpty())throw new Error('图片无法预览');
  return image.toDataURL();
}
export function currentAssistantMaterial() {
  if (!staged || staged.expiresAt < Date.now()) { staged = null; return null; }
  if(staged.type==='image'&&Date.now()-clipboardImageCheckedAt>1000){clipboardImageMatches=hash(clipboard.readImage().toPNG())===staged.imageHash;clipboardImageCheckedAt=Date.now();}
  const matches = staged.type === 'text' ? clipboard.readText() === staged.text : clipboardImageMatches;
  return matches ? {...staged,imageData:undefined} : null;
}
export function clearAssistantMaterial() { staged = null; }
export function recordAssistantUse(request: AssistantUseRequest): Promise<AssistantUsage> {
  const operation = async () => {
    bounded(request.token, 80, '复制凭据'); bounded(request.profileId, 128, '账号');
    bounded(request.contactTitle || '未命名联系人', 200, '联系人');
    if (!['whatsapp', 'telegram', 'signal', 'opensms'].includes(request.platform)) throw new Error('平台无效');
    const valid = request.platform === 'opensms' ? /^sms:[^:\s]{1,720}:[^:\s]{1,384}$/ : request.platform === 'whatsapp' ? /^wa:[\w.+-]+@(c\.us|s\.whatsapp\.net|lid|g\.us)$/
      : request.platform === 'telegram' ? /^tg:-?\d+$/ : /^signal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!valid.test(request.contactId)) throw new Error('缺少稳定联系人编号，未记录');
    const phone = request.platform === 'opensms' ? normalizeAssistantPhone(request.phone) : '';
    if (request.platform === 'opensms' && !phone) throw new Error('缺少对方手机号，未记录素材使用');
    if (request.actualText !== undefined && (typeof request.actualText !== 'string' || request.actualText.length > 16000)) throw new Error('确认文字过长');
    const receipt = receipts.get(request.token);
    if (receipt) {
      if (receipt.profileId !== request.profileId || receipt.platform !== request.platform || receipt.contactId !== request.contactId || (phone && receipt.phone !== phone)) throw new Error('素材已在其他会话确认');
      return receipt;
    }
    if (!staged || staged.token !== request.token || staged.expiresAt < Date.now()) throw new Error('素材复制已失效，请重新复制');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('素材使用记录保护不可用');
    const records = await readAllAssistantUsage();
    const record: AssistantUsage = { profileId: request.profileId, platform: request.platform, contactId: request.contactId,
      contactTitle: request.contactTitle || '未命名联系人', materialId: staged.id, usedAt: new Date().toISOString(), confirmation: 'inserted',
      ...(phone ? { phone } : {}),
      ...(staged.type === 'text' ? { actualText: request.actualText || staged.text } : {}) };
    const index = records.findIndex(r => r.platform === record.platform && r.materialId === record.materialId && (phone ? r.phone === phone : r.profileId === record.profileId && r.contactId === record.contactId));
    if (index >= 0) records[index] = record; else records.push(record);
    if (records.length > 100000) throw new Error('素材使用记录超过上限，未保存');
    await saveAssistantUsage(records);
    receipts.set(request.token, record);
    if(staged?.token===request.token)staged=null;
    if (receipts.size > 1000) receipts.delete(receipts.keys().next().value!);
    return record;
  };
  const next = queue.then(operation, operation); queue = next.catch(() => {}); return next;
}

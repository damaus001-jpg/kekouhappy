import { app, safeStorage } from 'electron';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { normalizeAssistantPhone } from './assistant-material-identity.js';
import { customerRequiredFields, defaultCustomerStages, emptyCustomerRecord, type CustomerTarget, type CustomerRecord, type CustomerSettings, type CustomerSnapshot, type CustomerPackage } from './customer-follow-up-types.js';

type Database = { schemaVersion:1; settings:CustomerSettings; records:Record<string,CustomerRecord> };
const file = () => join(app.getPath('userData'),'customer-follow-up','records.enc');
let queue:Promise<unknown> = Promise.resolve();
function serial<T>(operation:()=>Promise<T>):Promise<T> { const result=queue.then(operation,operation);queue=result.catch(()=>{});return result; }
function text(value:unknown,max:number):string { if(typeof value!=='string'||value.length>max||value.includes('\0'))throw new Error('客户资料格式无效或内容过长');return value; }
export function customerKey(target:CustomerTarget):string {
  if(!target||!['opensms','apple','whatsapp','telegram','signal'].includes(target.platform))throw new Error('客户平台无效');
  const profile=text(target.profileId,128);if(!profile)throw new Error('客户账号无效');
  let identity:string[];
  if(target.platform==='opensms'||target.platform==='apple') { const phone=normalizeAssistantPhone(target.phone);if(!phone)throw new Error('无法识别实际收信手机号');identity=['opensms',phone]; }
  else { const id=text(target.contactId,256);if(!id)throw new Error('无法识别联系人');identity=[target.platform,profile,id]; }
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}
function validateSettings(value:CustomerSettings):CustomerSettings {
  if(!value||!Array.isArray(value.fields)||value.fields.length>40||!Array.isArray(value.stages)||!value.stages.length||value.stages.length>40)throw new Error('最多40个自定义字段及40个客户阶段，阶段至少保留一个');
  const ids=new Set<string>(),names=new Set<string>(customerRequiredFields);
  const fields=value.fields.map(f=>{const id=text(f.id,80),name=text(f.name,40).trim();if(!/^[a-zA-Z0-9-]+$/.test(id)||!name||ids.has(id)||names.has(name))throw new Error('自定义字段名称不能重复或为空');ids.add(id);names.add(name);return {id,name};});
  const stages=value.stages.map(s=>text(s,40).trim());if(stages.some(s=>!s)||new Set(stages).size!==stages.length)throw new Error('客户阶段不能重复或为空');
  return {fields,stages};
}
function timestamp(value:unknown,allowZero=false):number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<(allowZero?0:1)||value>8640000000000000)throw new Error('客户记录时间无效');return value;}
function validateRecord(value:CustomerRecord,previous?:CustomerRecord,preserveDates=false):CustomerRecord {
  if(!value||!value.values||typeof value.values!=='object'||Array.isArray(value.values)||Object.keys(value.values).length>100||!Array.isArray(value.entries)||value.entries.length>10000||!value.draft)throw new Error('客户资料格式无效');
  const values:Record<string,string>={};for(const [key,v] of Object.entries(value.values)){if(!customerRequiredFields.includes(key as typeof customerRequiredFields[number])&&!/^[a-zA-Z0-9-]+$/.test(key))throw new Error('客户字段无效');Object.defineProperty(values,key,{value:text(v,8000),enumerable:true,writable:true,configurable:true});}
  const now=Date.now(),ids=new Set<string>(),oldEntries=new Map(previous?.entries.map(e=>[e.id,e]));
  const entries=value.entries.map(e=>{const id=text(e.id,80);if(!/^[a-zA-Z0-9-]+$/.test(id)||ids.has(id))throw new Error('跟进记录编号无效');ids.add(id);const talked=text(e.talked,16000),next=text(e.next,16000);if(!talked.trim()||!next.trim())throw new Error('请填写今天聊了什么和下一步做什么');const old=oldEntries.get(id);const createdAt=preserveDates?timestamp(e.createdAt):old?.createdAt||now;const updatedAt=preserveDates?timestamp(e.updatedAt):old&&old.talked===talked&&old.next===next?old.updatedAt:Math.max(now,createdAt);if(updatedAt<createdAt)throw new Error('跟进修改时间早于创建时间');return {id,talked,next,createdAt,updatedAt};});
  const draft={talked:text(value.draft.talked,16000),next:text(value.draft.next,16000),editingId:text(value.draft.editingId,80)};
  if(preserveDates&&draft.editingId&&!ids.has(draft.editingId))throw new Error('跟进草稿对应的记录不存在');
  return {values,entries,draft,updatedAt:preserveDates?timestamp(value.updatedAt,true):now};
}
async function read():Promise<Database> {
  let bytes:Buffer;try{bytes=await readFile(file());}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {schemaVersion:1,settings:{fields:[],stages:[...defaultCustomerStages]},records:{}};throw e;}
  if(!safeStorage.isEncryptionAvailable())throw new Error('本机客户资料保护不可用');
  const db=JSON.parse(safeStorage.decryptString(bytes)) as Database;
  if(db.schemaVersion!==1||!db.records||typeof db.records!=='object'||Array.isArray(db.records))throw new Error('客户资料文件损坏，请保留文件');
  db.settings=validateSettings(db.settings);return db;
}
async function write(db:Database) {
  if(!safeStorage.isEncryptionAvailable())throw new Error('本机客户资料保护不可用');
  const dir=join(app.getPath('userData'),'customer-follow-up');await mkdir(dir,{recursive:true});
  const temp=join(dir,`${randomUUID()}.tmp`);
  try{await writeFile(temp,safeStorage.encryptString(JSON.stringify(db)));await rename(temp,file());}finally{await unlink(temp).catch(()=>{});}
}
export function readCustomer(target:CustomerTarget):Promise<CustomerSnapshot> { const key=customerKey(target);return serial(async()=>{const db=await read();return {key,record:db.records[key]||emptyCustomerRecord(),settings:db.settings};}); }
export function saveCustomer(target:CustomerTarget,value:CustomerRecord):Promise<CustomerRecord> {const key=customerKey(target);return serial(async()=>{const db=await read();const record=validateRecord(value,db.records[key]);db.records[key]=record;await write(db);return record;});}
export function saveCustomerSettings(value:CustomerSettings):Promise<CustomerSettings> {const settings=validateSettings(value);return serial(async()=>{const db=await read();db.settings=settings;await write(db);return settings;});}

export function validateCustomerPackage(input:unknown):CustomerPackage {
  const value=input as CustomerPackage;
  if(!value||value.format!=='pikaqiu-customer-follow-up'||value.schemaVersion!==1)throw new Error('不是支持的客户跟进 JSON 文件');
  try{
    const settings=validateSettings(value.settings),record=validateRecord(value.record,undefined,true);
    const allowed=new Set<string>([...customerRequiredFields,...settings.fields.map(f=>f.id)]);
    if(Object.keys(record.values).some(id=>!allowed.has(id)))throw new Error('存在缺少定义的自定义字段');
    return {format:'pikaqiu-customer-follow-up',schemaVersion:1,exportedAt:timestamp(value.exportedAt),settings,record};
  }catch(e){throw new Error('客户跟进文件内容无效：'+(e instanceof Error?e.message:String(e)));}
}
export function buildCustomerPackage(snapshot:CustomerSnapshot,now=Date.now()):CustomerPackage {
  const allowed=new Set<string>([...customerRequiredFields,...snapshot.settings.fields.map(f=>f.id)]);
  const record={...snapshot.record,values:Object.fromEntries(Object.entries(snapshot.record.values).filter(([id])=>allowed.has(id)))};
  return validateCustomerPackage({format:'pikaqiu-customer-follow-up',schemaVersion:1,exportedAt:now,settings:snapshot.settings,record});
}
export function customerExportFilename(target:CustomerTarget,record:CustomerRecord,date=new Date()):string {
  const part=(value:string,max=60)=>value.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim().replace(/[. ]+$/g,'').slice(0,max)||'未填写';
  const age=record.values['年龄']||'';
  const name=target.platform==='opensms'?normalizeAssistantPhone(target.phone):[part(record.values['姓名']||''),part(/^\d+$/.test(age)?`${age}岁`:age,20),part(record.values['城市']||'')].join('_');
  if(!name)throw new Error('无法识别实际收信手机号');
  const pad=(v:number)=>String(v).padStart(2,'0');
  const suffix=`${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${name}_${suffix}.json`;
}
export function replaceCustomerFromPackage(target:CustomerTarget,input:unknown,selectedStage?:string):Promise<CustomerSnapshot> {
  const key=customerKey(target),pack=validateCustomerPackage(input);
  return serial(async()=>{
    const db=await read(),settings=structuredClone(db.settings),mapping=new Map<string,string>();
    const stage=selectedStage===undefined?pack.record.values['客户阶段']||'':text(selectedStage,40);
    if(!settings.stages.includes(stage))throw new Error('请从本机全局客户阶段中重新选择，当前客户资料未修改');
    for(const field of pack.settings.fields){
      let local=settings.fields.find(f=>f.name===field.name);
      if(!local){local={id:settings.fields.some(f=>f.id===field.id)?randomUUID():field.id,name:field.name};settings.fields.push(local);}
      mapping.set(field.id,local.id);
    }
    const validatedSettings=validateSettings(settings);
    const record:CustomerRecord={...pack.record,values:Object.fromEntries(Object.entries(pack.record.values).map(([id,value])=>[mapping.get(id)||id,value]))};
    record.values['客户阶段']=stage;
    db.records[key]=record;db.settings=validatedSettings;
    await write(db);return {key,record,settings:validatedSettings};
  });
}

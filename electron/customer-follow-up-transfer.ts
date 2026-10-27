import { dialog } from 'electron';
import { open, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { buildCustomerPackage, customerExportFilename, customerKey, readCustomer, replaceCustomerFromPackage, validateCustomerPackage } from './customer-follow-up-store.js';
import type { CustomerImportPreview, CustomerPackage, CustomerSnapshot, CustomerTarget } from './customer-follow-up-types.js';

const maxBytes=4*1024*1024;
const previews=new Map<string,{key:string;pack:CustomerPackage;expiresAt:number}>();
export async function exportCustomerFile(target:CustomerTarget,check:()=>Promise<void>=async()=>{}):Promise<boolean> {
  const snapshot=await readCustomer(target),pack=buildCustomerPackage(snapshot);
  const content=JSON.stringify(pack,null,2)+'\n';
  if(Buffer.byteLength(content,'utf8')>maxBytes)throw new Error('客户跟进文件超过4MB，请减少记录后再导出');
  const result=await dialog.showSaveDialog({title:'导出当前客户跟进',defaultPath:customerExportFilename(target,pack.record,new Date(pack.exportedAt)),filters:[{name:'客户跟进 JSON',extensions:['json']}]});
  if(result.canceled||!result.filePath)return false;
  await check();await writeFile(result.filePath,content,'utf8');return true;
}
export async function previewCustomerFile(target:CustomerTarget,check:()=>Promise<void>=async()=>{}):Promise<CustomerImportPreview|null> {
  const key=customerKey(target);
  const result=await dialog.showOpenDialog({title:'导入客户跟进，覆盖当前联系人',properties:['openFile'],filters:[{name:'客户跟进 JSON',extensions:['json']}]});
  if(result.canceled||!result.filePaths.length)return null;
  await check();
  const handle=await open(result.filePaths[0],'r');let content:string;
  try{
    const info=await handle.stat();if(!info.isFile()||info.size>maxBytes)throw new Error('请选择不超过4MB的客户跟进 JSON 文件');
    const bytes=Buffer.alloc(maxBytes+1);let length=0;
    while(length<bytes.length){const {bytesRead}=await handle.read(bytes,length,bytes.length-length,length);if(!bytesRead)break;length+=bytesRead;}
    if(length>maxBytes)throw new Error('客户跟进文件超过4MB');
    content=bytes.subarray(0,length).toString('utf8').replace(/^\uFEFF/,'');
  }finally{await handle.close();}
  let value:unknown;try{value=JSON.parse(content);}catch{throw new Error('JSON 文件损坏，当前客户资料未修改');}
  const pack=validateCustomerPackage(value),now=Date.now();
  for(const [token,value] of previews)if(value.expiresAt<now)previews.delete(token);
  if(previews.size>=8)previews.delete(previews.keys().next().value!);
  const token=randomUUID();previews.set(token,{key,pack,expiresAt:now+10*60*1000});
  const localStages=(await readCustomer(target)).settings.stages;
  return {token,name:pack.record.values['姓名']||'未填写',entryCount:pack.record.entries.length,exportedAt:pack.exportedAt,importedStage:pack.record.values['客户阶段']||'',localStages};
}
export async function importCustomerFile(target:CustomerTarget,token:string,selectedStage?:string):Promise<CustomerSnapshot> {
  const preview=previews.get(token);
  if(!preview||preview.expiresAt<Date.now())throw new Error('导入预览已过期，请重新选择文件');
  if(preview.key!==customerKey(target))throw new Error('当前联系人已切换，请重新导入');
  previews.delete(token);
  return replaceCustomerFromPackage(target,preview.pack,selectedStage);
}

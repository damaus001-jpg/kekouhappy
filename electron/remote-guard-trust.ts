import { app, safeStorage } from 'electron';
import { readFile,writeFile,mkdir,rename,unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { remoteSourceKey } from './remote-guard-core.js';
import type { RemoteGuardConnection,RemoteGuardTrustedSource } from './shared.js';

const directory=()=>join(app.getPath('userData'),'remote-guard');
const filename=()=>join(directory(),'trusted-sources.enc');
let queue:Promise<unknown>=Promise.resolve();
function serial<T>(operation:()=>Promise<T>){const next=queue.then(operation,operation);queue=next.catch(()=>{});return next;}
export async function readRemoteGuardTrustedSources():Promise<RemoteGuardTrustedSource[]> {
  await queue;
  return read();
}
async function read():Promise<RemoteGuardTrustedSource[]>{
  let bytes:Buffer;try{bytes=await readFile(filename());}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
  if(!safeStorage.isEncryptionAvailable())throw new Error('可信来源的本机保护不可用');
  if(bytes.length>256*1024)throw new Error('可信来源文件过大');
  const data=JSON.parse(safeStorage.decryptString(bytes));
  if(data.schemaVersion!==1||!Array.isArray(data.sources)||data.sources.length>500)throw new Error('可信来源文件无效');
  const keys=new Set<string>();
  return data.sources.map((source:RemoteGuardTrustedSource)=>{
    const key=remoteSourceKey(source.kind,source.sourceAddress,source.servicePort);
    if(!key||key!==source.key||keys.has(key)||!Number.isSafeInteger(source.createdAt)||source.createdAt<=0)throw new Error('可信来源记录无效');
    keys.add(key);return {key,kind:source.kind,sourceAddress:source.sourceAddress,servicePort:source.servicePort,createdAt:source.createdAt};
  });
}
async function write(sources:RemoteGuardTrustedSource[]){
  if(!safeStorage.isEncryptionAvailable())throw new Error('可信来源的本机保护不可用');
  await mkdir(directory(),{recursive:true});const temporary=join(directory(),`${randomUUID()}.tmp`);
  try{await writeFile(temporary,safeStorage.encryptString(JSON.stringify({schemaVersion:1,sources})));await rename(temporary,filename());}finally{await unlink(temporary).catch(()=>{});}
}
export function rememberRemoteGuardSource(connection:RemoteGuardConnection){
  const key=remoteSourceKey(connection.kind,connection.sourceAddress,connection.localPort);
  if(!key||connection.trustKey!==key)throw new Error('未读取到可靠的实际来源，不能记住此连接');
  return serial(async()=>{const sources=await read();if(!sources.some(s=>s.key===key)){if(sources.length>=500)throw new Error('可信来源最多保存500条');sources.push({key,kind:connection.kind,sourceAddress:connection.sourceAddress,servicePort:connection.localPort!,createdAt:Date.now()});await write(sources);}return sources;});
}
export function forgetRemoteGuardSource(key:string){return serial(async()=>{const sources=await read();if(!sources.some(s=>s.key===key))throw new Error('该可信来源已不存在');const next=sources.filter(s=>s.key!==key);await write(next);return next;});}

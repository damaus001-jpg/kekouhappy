import { app, dialog, safeStorage, shell } from 'electron';
import { readFile, writeFile, mkdir, rename, stat, unlink, copyFile, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, basename, extname } from 'node:path';
import { createRequire } from 'node:module';
import { Transform, type Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { emptyAssistantLibrary, assistantKinds, type AssistantKind, type AssistantModule, type AssistantLibrary, type AssistantMedia } from './assistant-library-types.js';
import { assertAssistantKind, validateAssistantModule, safePackagePath, buildAssistantContext } from './assistant-library-core.js';

const unzipper = createRequire(import.meta.url)('unzipper') as {Open:{file:(path:string)=>Promise<{files: {path:string;type:string;uncompressedSize:number;externalFileAttributes:number;stream:()=>Readable}[]}>}};
const mimeTypes: Record<string,string> = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime'};
const root = () => join(app.getPath('userData'),'assistant-library');
let mutations: Promise<unknown> = Promise.resolve();
function serialize<T>(fn:()=>Promise<T>):Promise<T> { const next=mutations.then(fn,fn);mutations=next.catch(()=>{});return next; }
export async function readAssistantLibrary(): Promise<AssistantLibrary> {
  let raw:Buffer;
  try {raw=await readFile(join(root(),'library.enc'));} catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT')return emptyAssistantLibrary();throw e;}
  if(!safeStorage.isEncryptionAvailable())throw new Error('本机资料保护不可用');
  const parsed=JSON.parse(safeStorage.decryptString(raw)) as AssistantLibrary;
  if(parsed.schemaVersion!==1)throw new Error('本地资料版本不兼容');
  for(const kind of assistantKinds)parsed.modules[kind]=validateAssistantModule(parsed.modules[kind]);
  return parsed;
}
async function persist(library:AssistantLibrary) {
  if(!safeStorage.isEncryptionAvailable())throw new Error('本机资料保护不可用，未保存');
  await mkdir(root(),{recursive:true});
  const temp=join(root(),`library-${randomUUID()}.tmp`);
  try {await writeFile(temp,safeStorage.encryptString(JSON.stringify(library)));await rename(temp,join(root(),'library.enc'));}
  finally {await unlink(temp).catch(()=>{});}
  return library;
}
export async function saveAssistantModule(kind:AssistantKind,value:AssistantModule) {
  assertAssistantKind(kind);const module=validateAssistantModule(value);
  return serialize(async()=>{const library=await readAssistantLibrary();
    const known=new Set(library.modules[kind].entries.flatMap(e=>e.media.map(m=>m.id)));
    if(module.entries.some(e=>e.media.some(m=>!known.has(m.id))))throw new Error('请通过添加素材导入媒体');
    library.modules[kind]=module;return persist(library);});
}
async function collect(stream:Readable,maximum:number) {
  let size=0;const chunks:Buffer[]=[];
  for await(const chunk of stream){size+=chunk.length;if(size>maximum){stream.destroy();throw new Error('资料包展开大小超限');}chunks.push(Buffer.from(chunk));}
  return Buffer.concat(chunks);
}
async function storeMedia(stream:Readable,name:string,caption='',budget?:{remaining:number}):Promise<AssistantMedia> {
  const ext=extname(name).toLowerCase(),mime=mimeTypes[ext];
  if(!mime)throw new Error('只支持 JPG、PNG、WebP、GIF、MP4、WebM、MOV 素材');
  await mkdir(join(root(),'media'),{recursive:true});
  const temp=join(root(),'media',`${randomUUID()}.tmp`),hash=createHash('sha256');let size=0;
  const max=mime.startsWith('image')?25*1024*1024:250*1024*1024;
  const limiter=new Transform({transform(chunk,_encoding,callback){size+=chunk.length;
    if(budget)budget.remaining-=chunk.length;
    if(size>max || (budget && budget.remaining<0))return callback(new Error('素材或资料包展开大小超限'));
    hash.update(chunk);callback(null,chunk);}});
  try {await pipeline(stream,limiter,createWriteStream(temp));const id=hash.digest('hex')+ext;
    await rename(temp,join(root(),'media',id));return {id,name:basename(name).slice(0,255),mime,caption:caption.slice(0,2000)};
  } finally {await unlink(temp).catch(()=>{});}
}
export async function importAssistantModule(kind:AssistantKind,merge:boolean) {
  assertAssistantKind(kind);
  const selected=await dialog.showOpenDialog({title:`导入${kind==='persona'?'人物资料':kind==='schedule'?'一周行程':'案例金句'}`,properties:['openFile',...(kind==='persona'?['multiSelections' as const]:[])],filters:[{name:'资料文件',extensions:['zip','json','txt','md']}]});
  if(selected.canceled || !selected.filePaths.length)return null;
  return serialize(async()=>{
    const library=await readAssistantLibrary();let imported:AssistantModule;
    const first=selected.filePaths[0],extension=extname(first).toLowerCase();
    if(extension==='.zip') {
      if((await stat(first)).size>1024*1024*1024)throw new Error('压缩包超过1GB');
      const archive=await unzipper.Open.file(first);if(archive.files.length>2000)throw new Error('压缩包条目过多');
      const names=new Set<string>();let total=0;
      for(const file of archive.files){file.path=file.path.replace(/\\/g,'/');const name=file.path.replace(/\/$/,'');safePackagePath(name);
        if(names.has(name.toLowerCase()))throw new Error('压缩包路径重复');names.add(name.toLowerCase());
        const mode=(file.externalFileAttributes>>>16)&0xf000;if(mode===0xa000)throw new Error('不支持符号链接');
        if(file.type!=='Directory' && file.path!=='manifest.json' && (!file.path.startsWith('media/') || !mimeTypes[extname(file.path).toLowerCase()]))throw new Error('资料包含不支持的文件');
        if(!Number.isFinite(file.uncompressedSize)||file.uncompressedSize<0)throw new Error('展开大小无效');total+=file.uncompressedSize;
        if(total>2*1024*1024*1024)throw new Error('资料包展开大小超过2GB');}
      const manifest=archive.files.find(f=>f.path==='manifest.json');if(!manifest)throw new Error('资料包缺少manifest.json');
      const raw=JSON.parse((await collect(manifest.stream(),4*1024*1024)).toString('utf8'));
      if(raw.kind!==kind||raw.schemaVersion!==1)throw new Error('资料包模块或版本不匹配');
      const module=raw.module;
      if(!module || !Array.isArray(module.entries)||module.entries.length>2000)throw new Error('资料包条目无效');
      // Validate all text and records before persisting any imported media.
      validateAssistantModule({...module,enabled:false,entries:module.entries.map((e:Record<string,unknown>)=>({...e,media:[]}))});
      const mediaCache=new Map<string,AssistantMedia>(),budget={remaining:2*1024*1024*1024};
      for(const entry of module.entries){if(!Array.isArray(entry.media)||entry.media.length>100)throw new Error('素材条目无效');
        const refs:AssistantMedia[]=[];
        for(const reference of entry.media){if(typeof reference.path!=='string'||typeof reference.caption!=='string')throw new Error('素材说明无效');
          safePackagePath(reference.path);const file=archive.files.find(f=>f.path===reference.path&&f.type!=='Directory');
          if(!file||!reference.path.startsWith('media/'))throw new Error('资料包素材缺失');
          let media=mediaCache.get(reference.path);if(!media){media=await storeMedia(file.stream(),reference.path,'',budget);mediaCache.set(reference.path,media);}
          refs.push({...media,caption:reference.caption.slice(0,2000)});}
        entry.media=refs;}
      imported=validateAssistantModule({...module,enabled:false});
    } else {
      const texts:string[]=[];
      for(const path of selected.filePaths){if((await stat(path)).size>4*1024*1024)throw new Error('文字资料文件超过4MB');texts.push((await readFile(path,'utf8')).replace(/^\uFEFF/,''));}
      if(extension==='.json') {
        const raw=JSON.parse(texts[0]);if(raw.schemaVersion!==1||raw.kind!==kind)throw new Error('JSON模块或版本不匹配');
        imported=validateAssistantModule({...raw.module,enabled:false});
        if(imported.entries.some(e=>e.media.length))throw new Error('带媒体的资料请使用ZIP导入');
      } else {
        imported={...emptyAssistantLibrary().modules[kind],title:basename(first),text:texts.join('\n\n---\n\n')};
        if(kind!=='persona')imported.entries=[{id:randomUUID(),title:basename(first),text:imported.text,date:'',timeZone:'America/Los_Angeles',status:'planned',tags:[],media:[]}];
        imported=validateAssistantModule(imported);
      }
    }
    imported.importedAt=new Date().toISOString();
    if(merge && kind!=='persona') {const entries=new Map(library.modules[kind].entries.map(e=>[e.id,e]));
      for(const e of imported.entries)entries.set(e.id,e);imported.entries=[...entries.values()];}
    library.modules[kind]=validateAssistantModule(imported);return persist(library);
  });
}
export async function attachAssistantMedia(kind:AssistantKind,entryId:string) {
  assertAssistantKind(kind);
  const selected=await dialog.showOpenDialog({title:'上传卡片图片',properties:['openFile','multiSelections'],filters:[{name:'图片',extensions:['jpg','jpeg','png','webp','gif']}]});
  if(selected.canceled)return null;
  return serialize(async()=>{const library=await readAssistantLibrary(),entry=library.modules[kind].entries.find(e=>e.id===entryId);
    if(!entry || entry.media.length+selected.filePaths.length>100)throw new Error('请先保存条目，或减少素材数量');
    const {createReadStream}=await import('node:fs');
    for(const file of selected.filePaths) {
      const media = await storeMedia(createReadStream(file),basename(file));
      if (!media.mime.startsWith('image/')) throw new Error('卡片只支持上传图片');
      if (!entry.media.some(existing => existing.id === media.id)) entry.media.push(media);
    }
    validateAssistantModule(library.modules[kind]);return persist(library);});
}
export async function assistantMediaPath(id:string) {
  if(typeof id!=='string'||!/^[a-f0-9]{64}\.(jpg|jpeg|png|webp|gif|mp4|webm|mov)$/.test(id))throw new Error('素材无效');
  const library=await readAssistantLibrary();
  if(!assistantKinds.some(k=>library.modules[k].entries.some(e=>e.media.some(m=>m.id===id))))throw new Error('素材未关联');
  return join(root(),'media',id);
}
export async function revealAssistantMedia(id:string) {shell.showItemInFolder(await assistantMediaPath(id));}
export async function exportAssistantTemplate(kind:AssistantKind) {
  assertAssistantKind(kind);const path=await dialog.showSaveDialog({title:'保存资料模板',defaultPath:`${kind}-template.json`,filters:[{name:'JSON模板',extensions:['json']}]});
  if(path.canceled||!path.filePath)return false;
  const module=emptyAssistantLibrary().modules[kind];
  if(kind!=='persona')module.entries=[{id:randomUUID(),title:kind==='schedule'?'填写活动名称':'填写适用场景',text:'填写文字说明或对话案例',date:'',timeZone:'America/Los_Angeles',status:'planned',tags:[],media:[]}];
  await writeFile(path.filePath,JSON.stringify({schemaVersion:1,kind,module},null,2),'utf8');return true;
}
export async function exportAssistantModule(kind:AssistantKind) {
  assertAssistantKind(kind);
  const library=await readAssistantLibrary(),module=library.modules[kind];
  const withMedia=module.entries.some(e=>e.media.length>0);
  const selected=await dialog.showSaveDialog({title:'导出资料供团队分发',defaultPath:`${kind}-v${module.version.replace(/[^a-zA-Z0-9_-]/g,'_')}.${withMedia?'zip':'json'}`,filters:[{name:withMedia?'资料包':'资料JSON',extensions:[withMedia?'zip':'json']}]});
  if(selected.canceled||!selected.filePath)return false;
  if(!withMedia){await writeFile(selected.filePath,JSON.stringify({schemaVersion:1,kind,module:{...module,enabled:false}},null,2),'utf8');return true;}
  const stage=join(root(),`export-${randomUUID()}`);await mkdir(join(stage,'media'),{recursive:true});
  try {
    const exported=JSON.parse(JSON.stringify(module));exported.enabled=false;
    for(const entry of exported.entries)for(let i=0;i<entry.media.length;i++){
      const media=entry.media[i];await copyFile(await assistantMediaPath(media.id),join(stage,'media',media.id));
      entry.media[i]={path:`media/${media.id}`,caption:media.caption};
    }
    await writeFile(join(stage,'manifest.json'),JSON.stringify({schemaVersion:1,kind,module:exported},null,2),'utf8');
    const quote=(s:string)=>"'"+s.replace(/'/g,"''")+"'";
    const script=`$ErrorActionPreference='Stop'; Compress-Archive -LiteralPath ${quote(join(stage,'manifest.json'))},${quote(join(stage,'media'))} -DestinationPath ${quote(join(stage,'package.zip'))} -Force`;
    await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:120000});
    await copyFile(join(stage,'package.zip'),selected.filePath);return true;
  } finally {await rm(stage,{recursive:true,force:true});}
}
export async function assistantContext(messages:{text:string}[]) {return buildAssistantContext(await readAssistantLibrary(),messages);}

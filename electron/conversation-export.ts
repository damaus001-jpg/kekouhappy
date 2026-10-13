import { dialog } from 'electron';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { renderConversationExport } from './conversation-export-core.js';
import type { ConversationExportRequest, ConversationExportResult } from './conversation-export-types.js';

export async function exportConversationFile(request:ConversationExportRequest):Promise<ConversationExportResult>{
  const rendered=renderConversationExport(request);
  const name=(request.contactTitle||'当前会话').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,60);
  const selected=await dialog.showSaveDialog({title:'导出当前会话',defaultPath:`${name}-${request.mode==='english'?'英文':'中文'}-${new Date().toISOString().slice(0,10)}.txt`,filters:[{name:'聊天记录 TXT',extensions:['txt']}]});
  if(selected.canceled||!selected.filePath)return {saved:false,count:0,missing:0,redacted:0};
  const temp=selected.filePath+`.${randomUUID()}.tmp`;
  try{await writeFile(temp,rendered.content,'utf8');await rename(temp,selected.filePath);}
  finally{await unlink(temp).catch(()=>{});}
  return {saved:true,count:rendered.count,missing:rendered.missing,redacted:rendered.redacted};
}

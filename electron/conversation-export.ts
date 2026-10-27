import { dialog } from 'electron';
import { writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { renderConversationExport } from './conversation-export-core.js';
import { localConversationExportDate } from './conversation-export-dates.js';
import type { ConversationExportRequest, ConversationExportResult } from './conversation-export-types.js';

export async function exportConversationFile(request:ConversationExportRequest):Promise<ConversationExportResult>{
  const rendered=renderConversationExport(request);
  const name=(request.contactTitle||'当前联系人').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').trim().replace(/[. ]+$/g,'').slice(0,60)||'当前联系人';
  const date=(request.exportDate||localConversationExportDate()).replace(/-/g,'');
  const selected=await dialog.showSaveDialog({title:'导出当前会话',defaultPath:`${name}_${date}.txt`,filters:[{name:'聊天记录 TXT',extensions:['txt']}]});
  if(selected.canceled||!selected.filePath)return {saved:false,count:0,missing:0,redacted:0};
  const temp=selected.filePath+`.${randomUUID()}.tmp`;
  try{await writeFile(temp,rendered.content,'utf8');await rename(temp,selected.filePath);}
  finally{await unlink(temp).catch(()=>{});}
  return {saved:true,count:rendered.count,missing:rendered.missing,redacted:rendered.redacted};
}

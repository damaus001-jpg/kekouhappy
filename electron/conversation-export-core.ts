import { conversationExportDay, localConversationExportDate } from './conversation-export-dates.js';
import { inspectSensitiveSendText } from './payment-address.js';
import type { ConversationExportRequest, ConversationExportRow } from './conversation-export-types.js';

function paymentInformation(text:string) {
  if(/收款|银行账号|银行卡号|账户号码|收款码|钱包地址|\b(?:bank account|account number|routing number|swift code|iban|wallet address|payment address|payment qr)\b/i.test(text))return true;
  if(/\b0x[a-f\d]{40}\b/i.test(text)||/\bT[1-9A-HJ-NP-Za-km-z]{33}\b/.test(text))return true;
  const tokens=text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}|\d(?:[\d -]{10,40})\d/g)||[];
  return tokens.some(token=>inspectSensitiveSendText(token.replace(/-/g,'')).candidate);
}
function clean(value:unknown,max:number,label:string){if(typeof value!=='string'||value.length>max||value.includes('\0'))throw new Error(`${label}无效或过长`);return value;}
export function renderConversationExport(request:ConversationExportRequest) {
  if(!['english','chinese'].includes(request.mode)||!['history-top','partial'].includes(request.coverage))throw new Error('导出模式无效');
  if(request.scope!==undefined&&!['today','all'].includes(request.scope))throw new Error('导出范围无效');
  const exportDate=request.exportDate||localConversationExportDate();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(exportDate)||conversationExportDay(exportDate)!==exportDate)throw new Error('导出日期无效');
  clean(request.profileId,128,'账号');clean(request.contactId,256,'联系人编号');clean(request.contactTitle,200,'联系人');clean(request.coverageNote,1000,'导出范围');
  if(!Array.isArray(request.rows)||!request.rows.length||request.rows.length>20000)throw new Error('无聊天记录或超过20000条上限');
  let missing=0,redacted=0;const ids=new Set<string>();
  const messages=request.rows.flatMap((row:ConversationExportRow)=>{
    clean(row.id,256,'消息编号');if(!row.id||ids.has(row.id))throw new Error('消息编号缺失或重复');ids.add(row.id);
    clean(row.timestamp,200,'消息时间');clean(row.originalText,32000,'原文');clean(row.chineseText,32000,'译文');clean(row.mediaLabel,500,'媒体说明');
    if(row.dateOrder!==undefined&&!['mdy','dmy'].includes(row.dateOrder))throw new Error('消息日期格式无效');
    const day=conversationExportDay(row.timestamp,exportDate,row.dateOrder);
    if(request.scope==='today'&&!day)throw new Error('存在日期无法识别的消息，无法确定当天范围，请尝试全部会话');
    if(request.scope==='today'&&day!==exportDate)return [];
    if(!['incoming','outgoing','unknown'].includes(row.direction))throw new Error('消息方向无效');
    if(row.direction==='unknown')throw new Error('存在无法识别发送方的消息，请确认会话加载完成后重试');
    const speaker=row.direction==='incoming'?'对方':'我方';
    let text='';
    if(paymentInformation(row.originalText+'\n'+row.chineseText+'\n'+row.mediaLabel)){text='[收款信息已排除]';redacted++;}
    else if(request.mode==='english')text=row.originalText||row.mediaLabel||'[非文字消息]';
    else if(row.chineseText)text=row.chineseText;
    else if(row.originalText&&(
      (/[\u4e00-\u9fff]/.test(row.originalText)&&!/[A-Za-z]{2,}/.test(row.originalText))||
      !/\p{L}/u.test(row.originalText)
    ))text=row.originalText;
    else if(!row.originalText)text=row.mediaLabel||'[非文字消息]';
    else{text='[暂无译文]';missing++;}
    return [{day:day||'日期未提供',text:`${speaker}：${text}`}];
  });
  if(!messages.length)throw new Error(request.scope==='today'?'当天没有可导出的会话':'当前会话没有可导出的记录');
  const groups=new Map<string,string[]>();
  for(const message of messages){if(!groups.has(message.day))groups.set(message.day,[]);groups.get(message.day)!.push(message.text);}
  const body=[...groups].map(([day,texts])=>day+'\n\n\n'+texts.join('\n\n')).join('\n\n\n\n\n\n');
  const content='\uFEFF'+body+'\n';
  if(Buffer.byteLength(content,'utf8')>32*1024*1024)throw new Error('导出文件超过32MB，请缩小会话范围');
  return {content,count:messages.length,missing,redacted};
}

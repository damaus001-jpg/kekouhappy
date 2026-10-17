import { inspectSensitiveSendText } from './payment-address.js';
import type { ConversationExportRequest, ConversationExportRow } from './conversation-export-types.js';

function paymentInformation(text:string) {
  if(/收款|银行账号|银行卡号|账户号码|收款码|钱包地址|\b(?:bank account|account number|routing number|swift code|iban|wallet address|payment address|payment qr)\b/i.test(text))return true;
  if(/\b0x[a-f\d]{40}\b/i.test(text)||/\bT[1-9A-HJ-NP-Za-km-z]{33}\b/.test(text))return true;
  const tokens=text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}|\d(?:[\d -]{10,40})\d/g)||[];
  return tokens.some(token=>inspectSensitiveSendText(token.replace(/-/g,'')).candidate);
}
function clean(value:unknown,max:number,label:string){if(typeof value!=='string'||value.length>max||value.includes('\0'))throw new Error(`${label}无效或过长`);return value;}
function conversationDay(timestamp:string) {
  const canonical=(year:number,month:number,day:number)=>{
    const date=new Date(Date.UTC(year,month-1,day));
    return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day
      ?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:'';
  };
  const yearFirst=timestamp.match(/\b(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|(?=\D|$))/);
  if(yearFirst)return canonical(+yearFirst[1],+yearFirst[2],+yearFirst[3]);
  // Preserve the site's numeric date order when day/month would be ambiguous.
  const numeric=timestamp.match(/\b(\d{1,2})([/.\-])(\d{1,2})\2(\d{4})\b/);
  if(numeric){const a=+numeric[1],b=+numeric[3],year=+numeric[4];
    if(!canonical(year,a,b)&&!canonical(year,b,a))return '';
    return `${numeric[1]}${numeric[2]}${numeric[3]}${numeric[2]}${numeric[4]}`;
  }
  const months='jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
  const monthFirst=timestamp.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/);
  const dayFirst=timestamp.match(/\b(\d{1,2})\s+([A-Za-z]+)[,]?\s+(\d{4})\b/);
  const match=monthFirst||dayFirst;
  if(match){const month=months.indexOf((monthFirst?match[1]:match[2]).slice(0,3).toLowerCase())+1;
    return month?canonical(+match[3],month,+(monthFirst?match[2]:match[1])):'';
  }
  return '';
}
export function renderConversationExport(request:ConversationExportRequest) {
  if(!['english','chinese'].includes(request.mode)||!['history-top','partial'].includes(request.coverage))throw new Error('导出模式无效');
  clean(request.profileId,128,'账号');clean(request.contactId,256,'联系人编号');clean(request.contactTitle,200,'联系人');clean(request.coverageNote,1000,'导出范围');
  if(!Array.isArray(request.rows)||!request.rows.length||request.rows.length>20000)throw new Error('无聊天记录或超过20000条上限');
  let missing=0,redacted=0;const ids=new Set<string>();
  const messages=request.rows.map((row:ConversationExportRow)=>{
    clean(row.id,256,'消息编号');if(!row.id||ids.has(row.id))throw new Error('消息编号缺失或重复');ids.add(row.id);
    clean(row.timestamp,200,'消息时间');clean(row.originalText,32000,'原文');clean(row.chineseText,32000,'译文');clean(row.mediaLabel,500,'媒体说明');
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
    return {day:conversationDay(row.timestamp),text:`${speaker}：${text}`};
  });
  const multipleDays=new Set(messages.map(m=>m.day).filter(Boolean)).size>1;
  let body='',previousDay:string|undefined;
  for(const message of messages){
    if(multipleDays&&message.day!==previousDay){
      body+=(body?'\n\n\n':'')+(message.day||'日期未提供')+'\n\n\n';
    }else if(body)body+='\n\n';
    body+=message.text;previousDay=message.day;
  }
  const header=[`当前会话导出 · ${request.mode==='english'?'英文原文':'中文译文缓存'}`,`平台：${request.platform}`,`联系人：${request.contactTitle||request.contactId}`,
    `记录数：${request.rows.length}；缺少译文：${missing}；收款信息排除：${redacted}`,`范围：${request.coverageNote||'平台可加载的会话历史，完整性未验证'}`,
    '照片、视频等仅记录媒体说明，不包含附件文件。'];
  const content='\uFEFF'+header.join('\n')+(multipleDays?'\n\n\n':'\n\n')+body+'\n';
  if(Buffer.byteLength(content,'utf8')>32*1024*1024)throw new Error('导出文件超过32MB，请缩小会话范围');
  return {content,count:request.rows.length,missing,redacted};
}

import { readTelegramConversationIdFromDom } from '../electron/shared';
import type { ConversationExportRow } from '../electron/conversation-export-types';
export type ExportSnapshot = {contactId:string;contactTitle:string;rows:ConversationExportRow[];top:boolean;loading:boolean;earliestMarked:boolean;expandPending:boolean};
type ExportCommand={action:'begin'|'snapshot'|'older'|'restore';platform:'whatsapp'|'telegram'|'signal';expectedId?:string};
function conversationExportRuntime(command:ExportCommand,readTelegram:()=>string){
  const w=window as any;
  const platform=command.platform;
  function fail(code:string,message:string):never {throw Object.assign(new Error(message),{exportCode:code});}
  const visible=(n:Element)=>!!n.getClientRects().length&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden';
  const scope=platform==='whatsapp'?document.querySelector('#main'):platform==='telegram'?document.querySelector('#MiddleColumn,.chat.active,.middle-column'):document.querySelector('.module-conversation,.ConversationView')||document.querySelector('.CompositionArea')?.parentElement;
  if(!scope)fail('conversation-not-open','请先打开需要导出的联系人会话');
  let contactId='';
  if(platform==='telegram')contactId=readTelegram();
  else if(platform==='signal'){
    const id=document.querySelector('.CompositionArea[data-df-signal-conversation-id]')?.getAttribute('data-df-signal-conversation-id')||'';
    if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))contactId='signal:'+id.toLowerCase();
  }else{
    const canonicalJid=(value:string)=>value.replace('@s.whatsapp.net','@c.us');
    let id=scope.getAttribute('data-jid')||scope.querySelector('header [data-jid]')?.getAttribute('data-jid')||'';
    if(!id){const ids=new Set<string>();for(const n of scope.querySelectorAll('[data-id]')){if(!visible(n))continue;const m=n.getAttribute('data-id')?.match(/^(?:true|false)_([\w.+-]+@(?:c\.us|s\.whatsapp\.net|lid|g\.us))_/);if(m)ids.add(canonicalJid(m[1]));}if(ids.size===1)id=Array.from(ids)[0];}
    if(/^[\w.+-]+@(c\.us|s\.whatsapp\.net|lid|g\.us)$/.test(id))contactId='wa:'+id.replace('@s.whatsapp.net','@c.us');
  }
  if(!contactId)fail('contact-id-unavailable','无法可靠识别当前联系人，未开始导出');
  if(command.expectedId&&command.expectedId!==contactId)fail('contact-changed','联系人已切换，导出已停止');
  const heading=scope.querySelector('.chat-info .peer-title,.chat-info .title,.ChatInfo .title,.module-ConversationHeader__header__info__title,.module-conversation-header__title,header [title],header [dir="auto"]');
  const contactTitle=(heading?.getAttribute('title')||heading?.textContent||'当前联系人').replace(/\s+/g,' ').trim().slice(0,200);
  const selector=platform==='whatsapp'?'[data-id^="true_"],[data-id^="false_"]':platform==='telegram'?'.bubble[data-mid],.Message[data-message-id],.Message[data-id],.Message[id]':'.module-message';
  const candidates=Array.from(scope.querySelectorAll<HTMLElement>(selector)).filter(visible);
  const bubbles=candidates.filter(n=>!candidates.some(other=>other!==n&&other.contains(n)));
  const findScroller=()=>{
    let node:HTMLElement|null=bubbles[0]?.parentElement||null;
    while(node&&node!==document.body){const style=getComputedStyle(node);if(/auto|scroll/.test(style.overflowY)&&node.clientHeight>50&&node.scrollHeight>node.clientHeight+10)return node;node=node.parentElement;}
    return Array.from(scope.querySelectorAll<HTMLElement>('.scrollable,.scrollable-y,.bubbles,.module-timeline__messages__container,.module-timeline,[class*="scroll"]')).find(n=>visible(n)&&n.clientHeight>50&&/auto|scroll/.test(getComputedStyle(n).overflowY))||null;
  };
  const scroller=findScroller();
  if(command.action==='begin'){
    if(!scroller&&bubbles.length)w.__dfConversationExport={contactId,scroller:null,originalTop:0,originalHeight:0,distanceBottom:0};
    else if(scroller){w.__dfConversationExport={contactId,scroller,originalTop:scroller.scrollTop,originalHeight:scroller.scrollHeight,distanceBottom:scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop};scroller.scrollTop=scroller.scrollHeight;scroller.dispatchEvent(new Event('scroll',{bubbles:true}));}
    else fail('history-unavailable','没有可读取的聊天记录或历史滚动区域');
  }else if(command.action==='restore'){
    const state=w.__dfConversationExport;if(state?.contactId===contactId&&state.scroller?.isConnected){state.scroller.scrollTop=Math.max(0,state.scroller.scrollHeight-state.scroller.clientHeight-state.distanceBottom);state.scroller.dispatchEvent(new Event('scroll',{bubbles:true}));}delete w.__dfConversationExport;return true;
  }else if(command.action==='older'){
    if(!scroller)return false;
    scroller.scrollTop=Math.max(0,scroller.scrollTop-Math.max(200,scroller.clientHeight*.65));scroller.dispatchEvent(new Event('scroll',{bubbles:true}));return true;
  }
  const clean=(node:Element|null)=>{if(!node)return '';const clone=node.cloneNode(true) as HTMLElement;
    for(const ui of clone.querySelectorAll('.df-chat-translation,.df-chat-refresh-placeholder,.df-smart-reply-host,.df-smart-reply-panel,.df-translator-host,button,.time,.time-inner,[data-testid="msg-meta"],.module-message__metadata,[aria-hidden="true"]'))ui.remove();
    clone.querySelectorAll('br').forEach(n=>n.replaceWith(document.createTextNode('\n')));
    clone.querySelectorAll('img.emoji,img.emoticon,img.emoji-image').forEach(n=>n.replaceWith(document.createTextNode(n.getAttribute('alt')||'')));
    return (clone.innerText||clone.textContent||'').replace(/\u00a0/g,' ').trim();};
  let expandPending=false;
  const rows:ConversationExportRow[]=[];
  for(const bubble of bubbles){
    const more=bubble.querySelector<HTMLElement>('[data-testid="read-more"],[data-testid="expandable-text-read-more"],[data-testid="read-more-button"]');
    if(more&&visible(more)){more.click();expandPending=true;}
    const wrapper=platform==='signal'?bubble.closest('.module-message__wrapper[aria-labelledby]'):null;
    const accessibility=wrapper?.getAttribute('aria-labelledby')||bubble.getAttribute('aria-labelledby')||bubble.querySelector('[aria-labelledby^="message-accessibility-contents:"]')?.getAttribute('aria-labelledby')||'';
    const id=bubble.getAttribute('data-mid')||bubble.getAttribute('data-message-id')||bubble.getAttribute('data-id')||bubble.id||accessibility.match(/message-accessibility-(?:contents|label):([^\s]+)/)?.[1]||'';
    if(!id)fail('message-id-unavailable','发现没有稳定编号的消息，无法保证记录不重复，请保留会话反馈');
    const textSelectors=platform==='whatsapp'?'[data-pre-plain-text] .selectable-text,[data-testid="selectable-text"],.selectable-text':platform==='telegram'?'.bubble-content > .message > .translatable-message,.bubble-content > .message,.Message .text-content,.text-content':'.module-message__text,.module-message__text-container';
    const parts=Array.from(bubble.querySelectorAll(textSelectors)).filter(n=>!n.closest('[data-testid="quoted-message"],.reply,.quoted-message,.MessageReply,.module-quoted-message'));
    const topParts=parts.filter(n=>!parts.some(other=>other!==n&&other.contains(n)));
    const originalText=topParts.map(clean).filter(Boolean).join('\n');
    const chineseText=Array.from(bubble.querySelectorAll<HTMLElement>('.df-chat-translation,[data-df-signal-translation],.module-message__maoyi-translation:not(.module-message__maoyi-translation--missing)')).filter(n=>!n.closest('[data-testid="quoted-message"],.reply,.quoted-message,.MessageReply,.module-quoted-message')).map(n=>{const clone=n.cloneNode(true) as HTMLElement;clone.querySelectorAll('button,.df-smart-reply-host,.df-smart-reply-panel,.module-message__maoyi-smart-reply').forEach(b=>b.remove());return (clone.innerText||clone.textContent||'').trim();}).filter(Boolean).join('\n');
    const classes=bubble.className+' '+(bubble.parentElement?.className||'');const dataId=bubble.getAttribute('data-id')||'';
    const direction=/\b(?:is-out|own|outgoing|message-out|module-message--outgoing)\b/.test(classes)||dataId.startsWith('true_')?'outgoing':/\b(?:is-in|incoming|message-in|module-message--incoming)\b/.test(classes)||dataId.startsWith('false_')?'incoming':'unknown';
    const time=bubble.querySelector('time');
    const timestamp=time?.getAttribute('datetime')||time?.getAttribute('title')||bubble.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text')?.match(/^\[([^\]]+)\]/)?.[1]||bubble.querySelector('.time,.time-inner,.module-message__metadata__date,.module-message__metadata')?.getAttribute('title')||bubble.querySelector('.time,.time-inner,.module-message__metadata__date')?.textContent?.trim()||'';
    const mediaLabel=bubble.querySelector('video')?'[视频]':bubble.querySelector('audio')?'[语音/音频]':bubble.querySelector('img:not(.emoji):not(.emoticon):not(.emoji-image):not(.avatar)')?'[图片/贴纸]':!originalText?'[非文字消息]':'';
    if(originalText.length>32000||chineseText.length>32000)fail('message-too-large','存在超过32000字的消息，已停止导出以避免截断');
    rows.push({id,direction,timestamp:timestamp.slice(0,200),originalText,chineseText,mediaLabel});
  }
  const loading=Array.from(scope.querySelectorAll('[aria-busy="true"],.preloader,.spinner,.module-spinner')).some(visible);
  const marker=Array.from(scope.querySelectorAll('[data-history-start],.history-start,.chat-history-start,.module-timeline__messages--have-oldest')).find(visible);
  return {contactId,contactTitle,rows,top:!scroller||scroller.scrollTop<=2,loading,earliestMarked:!!marker,expandPending};
}
export function buildConversationExportScript(command:ExportCommand){return `(()=>{try{return {exportResult:true,ok:true,data:(${conversationExportRuntime.toString()})(${JSON.stringify(command)},${readTelegramConversationIdFromDom.toString()})};}catch(error){return {exportResult:true,ok:false,error:error instanceof Error?error.message:String(error),errorCode:error?.exportCode||'runtime-error'};}})()`;}
export function unwrapConversationExportResult<T>(result:unknown):T {
  const value=result as {exportResult?:boolean;ok?:boolean;data?:T;error?:string;errorCode?:string}|null;
  if(!value||value.exportResult!==true)throw new Error('会话导出未返回有效结果，请重试');
  if(!value.ok)throw Object.assign(new Error(typeof value.error==='string'?value.error:'读取会话失败'),{exportCode:value.errorCode||'runtime-error'});
  return value.data as T;
}
export function mergeConversationExportRows(current:ConversationExportRow[],page:ConversationExportRow[]) {
  const result=current.slice();let pending:ConversationExportRow[]=[],lastAnchor='';
  for(const row of page){const at=result.findIndex(r=>r.id===row.id);
    if(at>=0){if(pending.length){result.splice(at,0,...pending);pending=[];}const index=result.findIndex(r=>r.id===row.id);result[index]={...result[index],...row,chineseText:row.chineseText||result[index].chineseText};lastAnchor=row.id;}
    else if(!pending.some(r=>r.id===row.id))pending.push(row);
  }
  if(pending.length){const at=lastAnchor?result.findIndex(r=>r.id===lastAnchor)+1:0;result.splice(at,0,...pending);}
  return result;
}

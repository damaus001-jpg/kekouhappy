import { readTelegramConversationIdFromDom } from '../electron/shared';
import { conversationExportDay } from '../electron/conversation-export-dates';
import type { ConversationExportRow } from '../electron/conversation-export-types';
export type ExportSnapshot = {contactId:string;contactTitle:string;rows:ConversationExportRow[];top:boolean;loading:boolean;earliestMarked:boolean;expandPending:boolean};
type ExportCommand={action:'begin'|'snapshot'|'older'|'restore'|'contact';platform:'whatsapp'|'telegram'|'signal'|'opensms'|'apple';expectedId?:string};
function conversationExportRuntime(command:ExportCommand,readTelegram:()=>string,parseDay:typeof conversationExportDay){
  const w=window as any;
  const platform=command.platform;
  function fail(code:string,message:string):never {throw Object.assign(new Error(message),{exportCode:code});}
  if(platform==='apple'){
    if(!w.__dfApple)fail('runtime-unavailable','苹果页面尚未就绪，请稍后重试');
    return w.__dfApple.apply({action:'export',command});
  }
  const visible=(n:Element)=>!!n.getClientRects().length&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden';
  const scope=platform==='opensms'?document.querySelector('.im-chat'):platform==='whatsapp'?document.querySelector('#main'):platform==='telegram'?document.querySelector('#MiddleColumn,.chat.active,.middle-column'):document.querySelector('.module-conversation,.ConversationView')||document.querySelector('.CompositionArea')?.parentElement;
  if(!scope)fail('conversation-not-open','请先打开需要导出的联系人会话');
  const heading=scope.querySelector('.im-chat-top .info-other .info-value,.chat-info .peer-title,.chat-info .title,.ChatInfo .title,.module-ConversationHeader__header__info__title,.module-conversation-header__title,header [title],header [dir="auto"]');
  const contactTitle=(heading?.getAttribute('title')||heading?.textContent||'当前联系人').replace(/\s+/g,' ').trim().slice(0,200);
  let contactId='';
  if(platform==='opensms'){
    const container=scope.querySelector('#message-box');
    if(!container)fail('history-unavailable','未找到当前会话的 message-box 容器');
    // Export the open dialog directly; selected contact-list rows are not required.
    let state=w.__dfOpenSmsExportContainer;
    if(state?.container!==container)state=w.__dfOpenSmsExportContainer={container,token:crypto.randomUUID()};
    const identity=JSON.stringify([document.querySelector('.left-bar .avatar-name')?.textContent?.trim()||'',contactTitle]);
    let hash=2166136261;for(let i=0;i<identity.length;i++)hash=Math.imul(hash^identity.charCodeAt(i),16777619);
    contactId='sms-export:'+state.token+':'+(hash>>>0).toString(16);
  }
  else if(platform==='telegram')contactId=readTelegram();
  else if(platform==='signal'){
    const id=document.querySelector('.CompositionArea[data-df-signal-conversation-id]')?.getAttribute('data-df-signal-conversation-id')||'';
    if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))contactId='signal:'+id.toLowerCase();
  }else{
    const canonicalJid=(value:string)=>{
      const raw=value.trim().replace(/^(?:true|false)_/,'');
      const match=raw.match(/^([\w.+-]+)(?::\d+)?@(c\.us|s\.whatsapp\.net|lid|g\.us)(?=_|$)/i);
      return match?match[1]+'@'+(match[2].toLowerCase()==='s.whatsapp.net'?'c.us':match[2].toLowerCase()):'';
    };
    const explicit=[scope.getAttribute('data-jid')||'',...Array.from(scope.querySelectorAll('header[data-jid],header [data-jid],header[data-id],header [data-id]')).filter(visible).flatMap(n=>[n.getAttribute('data-jid')||'',n.getAttribute('data-id')||''])].map(canonicalJid).filter(Boolean);
    let id=new Set(explicit).size===1?explicit[0]:'';
    if(!id){
      const ids=new Set<string>();
      for(const n of scope.querySelectorAll('[data-id^="true_"],[data-id^="false_"]')){
        if(!visible(n)||n.closest('[data-testid="quoted-message"],.quoted-message,.reply,.MessageReply,[role="dialog"]'))continue;
        const outer=n.parentElement?.closest('[data-id^="true_"],[data-id^="false_"]');
        if(outer&&scope.contains(outer))continue;
        const jid=canonicalJid(n.getAttribute('data-id')||'');if(jid)ids.add(jid);
      }
      if(ids.size===1)id=Array.from(ids)[0];
    }
    if(id)contactId='wa:'+id;
  }
  if(!contactId)fail('contact-id-unavailable','无法可靠识别当前联系人，未开始导出');
  if(command.expectedId&&command.expectedId!==contactId)fail('contact-changed','联系人已切换，导出已停止');
  if(command.action==='contact')return {contactId,contactTitle};
  const selector=platform==='opensms'?'#message-box > ul > li.im-chat-mine,#message-box > ul > li.im-chat-other':platform==='whatsapp'?'[data-id^="true_"],[data-id^="false_"]':platform==='telegram'?'.bubble[data-mid],.Message[data-message-id],.Message[data-id],.Message[id]':'.module-message';
  if(platform==='opensms'&&!scope.querySelector('#message-box'))fail('history-unavailable','未找到当前会话的 message-box 容器');
  const candidates=Array.from(scope.querySelectorAll<HTMLElement>(selector)).filter(n=>(platform==='opensms'||visible(n))&&!n.closest('[data-testid="quoted-message"],.quoted-message,.reply,.MessageReply,.module-quoted-message'));
  const bubbles=candidates.filter(n=>!candidates.some(other=>other!==n&&other.contains(n)));
  const findScroller=()=>{
    if(platform==='opensms')return scope.querySelector<HTMLElement>('#message-box');
    let node:HTMLElement|null=bubbles[0]?.parentElement||null;
    while(node&&node!==document.body){const style=getComputedStyle(node);if(/auto|scroll/.test(style.overflowY)&&node.clientHeight>50&&node.scrollHeight>node.clientHeight+10)return node;node=node.parentElement;}
    return Array.from(scope.querySelectorAll<HTMLElement>('.scrollable,.scrollable-y,.bubbles,.module-timeline__messages__container,.module-timeline,[class*="scroll"]')).find(n=>visible(n)&&n.clientHeight>50&&/auto|scroll/.test(getComputedStyle(n).overflowY))||null;
  };
  const scroller=findScroller();
  if(command.action==='begin'){
    if(!scroller&&bubbles.length)w.__dfConversationExport={contactId,scroller:null,originalTop:0,originalHeight:0,distanceBottom:0};
    else if(scroller){w.__dfConversationExport={contactId,scroller,originalTop:scroller.scrollTop,originalHeight:scroller.scrollHeight,distanceBottom:scroller.scrollHeight-scroller.clientHeight-scroller.scrollTop};if(platform!=='opensms'){scroller.scrollTop=scroller.scrollHeight;scroller.dispatchEvent(new Event('scroll',{bubbles:true}));}}
    else fail('history-unavailable','没有可读取的聊天记录或历史滚动区域');
  }else if(command.action==='restore'){
    const state=w.__dfConversationExport;if(platform!=='opensms'&&state?.contactId===contactId&&state.scroller?.isConnected){state.scroller.scrollTop=Math.max(0,state.scroller.scrollHeight-state.scroller.clientHeight-state.distanceBottom);state.scroller.dispatchEvent(new Event('scroll',{bubbles:true}));}delete w.__dfConversationExport;return true;
  }else if(command.action==='older'){
    if(platform==='opensms'||!scroller)return false;
    scroller.scrollTop=Math.max(0,scroller.scrollTop-Math.max(200,scroller.clientHeight*.65));scroller.dispatchEvent(new Event('scroll',{bubbles:true}));return true;
  }
  const clean=(node:Element|null)=>{if(!node)return '';const clone=node.cloneNode(true) as HTMLElement;
    for(const ui of clone.querySelectorAll('.df-chat-translation,.df-chat-refresh-placeholder,.df-smart-reply-host,.df-smart-reply-panel,.df-translator-host,button,.time,.time-inner,[data-testid="msg-meta"],.module-message__metadata,[aria-hidden="true"]'))ui.remove();
    clone.querySelectorAll('br').forEach(n=>n.replaceWith(document.createTextNode('\n')));
    clone.querySelectorAll('img.emoji,img.emoticon,img.emoji-image').forEach(n=>n.replaceWith(document.createTextNode(n.getAttribute('alt')||'')));
    return (clone.innerText||clone.textContent||'').replace(/\u00a0/g,' ').trim();};
  let expandPending=false;
  const now=new Date(),referenceDay=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  let dateOrder:'mdy'|'dmy'='mdy';
  try{const parts=new Intl.DateTimeFormat(document.documentElement.lang||navigator.language).formatToParts(new Date(2026,10,23));if(parts.findIndex(p=>p.type==='day')<parts.findIndex(p=>p.type==='month'))dateOrder='dmy';}catch{}
  const dateMarkers=Array.from(scope.querySelectorAll('.time-divider,.date-divider,.date-separator,.bubble-date,.service-msg,.module-timeline__date-break'+(platform==='signal'?',time[datetime]':'')))
    .filter(node=>!node.closest('.module-message,.module-message__wrapper,.module-quoted-message,[data-testid="quoted-message"],.reply,.quoted-message,.MessageReply'))
    .filter(node=>!node.matches('time[datetime]')||/^\d{4}-\d{2}-\d{2}$/.test(node.getAttribute('datetime')||''))
    .map(node=>({node,day:parseDay(node.getAttribute('datetime')||node.getAttribute('data-date')||node.getAttribute('title')||node.textContent||'',referenceDay,dateOrder)})).filter(item=>item.day);
  const rows:ConversationExportRow[]=[];
  for(const bubble of bubbles){
    const more=bubble.querySelector<HTMLElement>('[data-testid="read-more"],[data-testid="expandable-text-read-more"],[data-testid="read-more-button"]');
    if(more&&visible(more)){more.click();expandPending=true;}
    const wrapper=platform==='signal'?bubble.closest('.module-message__wrapper[aria-labelledby]'):null;
    const accessibility=wrapper?.getAttribute('aria-labelledby')||bubble.getAttribute('aria-labelledby')||bubble.querySelector('[aria-labelledby^="message-accessibility-contents:"]')?.getAttribute('aria-labelledby')||'';
    const id=bubble.getAttribute('data-mid')||bubble.getAttribute('data-message-id')||bubble.getAttribute('data-id')||bubble.id||accessibility.match(/message-accessibility-(?:contents|label):([^\s]+)/)?.[1]||'';
    if(!id)fail('message-id-unavailable','发现没有稳定编号的消息，无法保证记录不重复，请保留会话反馈');
    const textSelectors=platform==='opensms'?'.im-chat-text > .message-content':platform==='whatsapp'?'[data-pre-plain-text] .selectable-text,[data-testid="selectable-text"],.selectable-text':platform==='telegram'?'.bubble-content > .message > .translatable-message,.bubble-content > .message,.Message .text-content,.text-content':'.module-message__text,.module-message__text-container';
    const parts=Array.from(bubble.querySelectorAll(textSelectors)).filter(n=>!n.closest('[data-testid="quoted-message"],.reply,.quoted-message,.MessageReply,.module-quoted-message'));
    const topParts=parts.filter(n=>!parts.some(other=>other!==n&&other.contains(n)));
    const originalText=topParts.map(clean).filter(Boolean).join('\n');
    const chineseText=Array.from(bubble.querySelectorAll<HTMLElement>('.df-chat-translation,[data-df-signal-translation],.module-message__maoyi-translation:not(.module-message__maoyi-translation--missing)')).filter(n=>!n.closest('[data-testid="quoted-message"],.reply,.quoted-message,.MessageReply,.module-quoted-message')).map(n=>{const clone=n.cloneNode(true) as HTMLElement;clone.querySelectorAll('button,.df-smart-reply-host,.df-smart-reply-panel,.module-message__maoyi-smart-reply').forEach(b=>b.remove());return (clone.innerText||clone.textContent||'').trim();}).filter(Boolean).join('\n');
    const classes=bubble.className+' '+(bubble.parentElement?.className||'');const dataId=bubble.getAttribute('data-id')||'';
    const direction=/\b(?:im-chat-mine|is-out|own|outgoing|message-out|module-message--outgoing)\b/.test(classes)||dataId.startsWith('true_')?'outgoing':/\b(?:im-chat-other|is-in|incoming|message-in|module-message--incoming)\b/.test(classes)||dataId.startsWith('false_')?'incoming':'unknown';
    const time=platform==='signal'
      ?bubble.querySelector('time.module-message__metadata__date')||Array.from(bubble.querySelectorAll('time')).find(node=>!node.closest('.module-quoted-message,[data-testid="quoted-message"],.reply,.quoted-message,.MessageReply'))
      :bubble.querySelector('time');
    const metadata=bubble.querySelector('.time,.time-inner,.module-message__metadata__date,.module-message__metadata');
    const stamps=[time?.getAttribute('datetime'),time?.getAttribute('title'),bubble.getAttribute('data-timestamp'),metadata?.getAttribute('data-timestamp'),bubble.querySelector('[data-pre-plain-text]')?.getAttribute('data-pre-plain-text')?.match(/^\[([^\]]+)\]/)?.[1],metadata?.getAttribute('title'),metadata?.textContent?.trim(),platform==='opensms'?bubble.querySelector('.im-chat-user .msg-time,.contact-time-only')?.textContent?.trim():''].filter((s):s is string=>!!s);
    let timestamp=stamps.find(s=>!!parseDay(s,referenceDay,dateOrder))||'';
    if(!timestamp){const group=bubble.closest('.bubbles-date-group,.bubble-date-group,.date-group,[data-date]');timestamp=parseDay(group?.getAttribute('data-date')||group?.querySelector('.bubble-date,.service-msg,.date')?.textContent||'',referenceDay,dateOrder);}
    if(!timestamp){for(const marker of dateMarkers){if(marker.node.compareDocumentPosition(bubble)&Node.DOCUMENT_POSITION_FOLLOWING)timestamp=marker.day;else break;}}
    if(!timestamp)timestamp=stamps[0]||'';
    const hasImage=Array.from(bubble.querySelectorAll('img:not(.emoji):not(.emoticon):not(.emoji-image):not(.avatar)')).some(n=>platform!=='opensms'||!n.closest('.im-chat-user'));
    const mediaLabel=bubble.querySelector('video')?'[视频]':bubble.querySelector('audio')?'[语音/音频]':hasImage?'[图片/贴纸]':!originalText?'[非文字消息]':'';
    if(originalText.length>32000||chineseText.length>32000)fail('message-too-large','存在超过32000字的消息，已停止导出以避免截断');
    rows.push({id,direction,timestamp:timestamp.slice(0,200),dateOrder,originalText,chineseText,mediaLabel});
  }
  const loading=Array.from(scope.querySelectorAll('[aria-busy="true"],.preloader,.spinner,.module-spinner')).some(visible);
  const marker=Array.from(scope.querySelectorAll('[data-history-start],.history-start,.chat-history-start,.module-timeline__messages--have-oldest')).find(visible);
  return {contactId,contactTitle,rows,top:!scroller||scroller.scrollTop<=2,loading,earliestMarked:!!marker,expandPending};
}
export function buildConversationExportScript(command:ExportCommand){return `(()=>{try{return {exportResult:true,ok:true,data:(${conversationExportRuntime.toString()})(${JSON.stringify(command)},${readTelegramConversationIdFromDom.toString()},${conversationExportDay.toString()})};}catch(error){return {exportResult:true,ok:false,error:error instanceof Error?error.message:String(error),errorCode:error?.exportCode||'runtime-error'};}})()`;}
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

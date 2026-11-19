import { normalizeAssistantPhone } from '../electron/assistant-material-identity';
import { openSmsAreaCodeInfo } from './phone-area-codes';
// Serialized into the isolated platform page. No backend access or site credentials.
export function openSmsRuntime(command: any, normalizePhone: typeof normalizeAssistantPhone, openSmsAreaCodeInfo: Record<string,[string,string,string]>) {
  const w = window as any;
  if (!['opensms.cc', 'www.opensms.cc'].includes(location.hostname)) return false;
  const version = '2026-11-15-opensms-incremental-v15';
  const startupGuardMarker = '2026-10-16-opensms-v1';
  if (w.__dfOpenSms?.version !== version) {
    w.__dfOpenSms?.dispose();
    const state: any = { version, signature: '', pending: null, ready: null, sensitive: null, sending: false, writing: false, cache: new Map(), enabled: true, topbarFolded: (()=>{try{return localStorage.getItem('df-opensms-topbar-folded-v1')==='1';}catch{return false;}})(), nightMode:(()=>{try{return localStorage.getItem('df-opensms-night-mode-v1')==='1';}catch{return false;}})() };
    const normalize = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
    const canonical = (s: string) => (s || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').normalize('NFC').trim();
    const hash = (s: string) => { let h=2166136261;for(const c of normalize(s)){h=Math.imul(h^c.charCodeAt(0),16777619);}return (h>>>0).toString(36); };
    const localDayKey = (date:Date) => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
    const todayKey = () => localDayKey(new Date());
    const dayKey = (value:string) => {
      const match=String(value||'').match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|\s|$)/);
      if(!match)return '';
      const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
      const date=new Date(year,month-1,day);
      return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?localDayKey(date):'';
    };
    // Offline, approximate NANP area-code reference. An area code reflects
    // number assignment, not a verified current location (numbers are portable).

    const timezoneFormatters=new Map<string,Intl.DateTimeFormat>();
    const timezoneOffsets=new Map<string,number>();
    let timezoneMinute=-1;
    const timezoneOffsetMinutes=(zone:string,at:Date)=>{
      const minute=Math.floor(at.getTime()/60000);
      if(minute!==timezoneMinute){timezoneMinute=minute;timezoneOffsets.clear();}
      const cached=timezoneOffsets.get(zone);if(cached!==undefined)return cached;
      let formatter=timezoneFormatters.get(zone);
      if(!formatter){formatter=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});timezoneFormatters.set(zone,formatter);}
      const values:any={};for(const part of formatter.formatToParts(at))if(part.type!=='literal')values[part.type]=Number(part.value);
      const offset=Math.round((Date.UTC(values.year,values.month-1,values.day,values.hour,values.minute,values.second)-at.getTime())/60000);
      timezoneOffsets.set(zone,offset);return offset;
    };
    const areaHintStates=new WeakMap<HTMLElement,{areaCode:string,minute:number,hint:HTMLElement}>();
    let areaHintMinute=-1;
    const phoneAreaCode=(text:string)=>{const digits=String(text||'').replace(/\D/g,'');if(digits.length===11&&digits[0]==='1')return digits.slice(1,4);if(digits.length===10)return digits.slice(0,3);return '';};
    const renderAreaCodeHint=()=>{
      const now=new Date();const minute=Math.floor(now.getTime()/60000);areaHintMinute=minute;
      const rows=Array.from(document.querySelectorAll<HTMLElement>('.chat-item .tag-receiver')).map(tag=>({tag,card:tag.closest<HTMLElement>('.chat-item'),number:tag.parentElement?.querySelector<HTMLElement>('.address-name')||null}));
      for(const {card,number} of rows){
        if(!card||!number)continue;
        const row=number.parentElement;if(!row)continue;
        const raw=number.getAttribute('title')||number.textContent||'';const areaCode=phoneAreaCode(raw);const info=openSmsAreaCodeInfo[areaCode];
        let hintNode=card.querySelector<HTMLElement>(':scope > .df-opensms-area-hint');
        if(!info){hintNode?.remove();areaHintStates.delete(card);continue;}
        const previous=areaHintStates.get(card);
        if(previous?.areaCode===areaCode&&previous.minute===minute&&previous.hint===hintNode&&row.nextElementSibling===hintNode)continue;
        if(!hintNode){
          hintNode=document.createElement('div');hintNode.className='df-opensms-area-hint';
          const label=document.createElement('span');label.className='df-opensms-area-hint-text';
          const tail=document.createElement('span');tail.setAttribute('aria-hidden','true');hintNode.append(label,tail);
        }
        if(!previous||previous.hint!==hintNode)hintNode.style.cssText='position:relative;display:block;width:fit-content;max-width:calc(100% - 54px);min-width:0;box-sizing:border-box;margin:4px 0 5px 54px;padding:4px 9px;border:1px solid #7dbb91;border-radius:11px;background:#f0fff4;color:#245b37;font:600 11px/1.4 sans-serif;box-shadow:0 2px 7px #164a2820;white-space:normal;overflow-wrap:anywhere;word-break:normal;text-align:center';
        const tailNode=hintNode.querySelector<HTMLElement>('[aria-hidden="true"]');
        if(tailNode&&(!previous||previous.hint!==hintNode))tailNode.style.cssText='position:absolute;left:12px;top:-5px;width:8px;height:8px;background:#f0fff4;border-left:1px solid #7dbb91;border-top:1px solid #7dbb91;transform:rotate(45deg)';
        if(hintNode.parentElement!==card||row.nextElementSibling!==hintNode)row.insertAdjacentElement('afterend',hintNode);
        const label=hintNode.querySelector<HTMLElement>('.df-opensms-area-hint-text')!;
        const [city,stateName,zone]=info;const delta=Math.round((timezoneOffsetMinutes(zone,now)-timezoneOffsetMinutes('America/Los_Angeles',now))/60);
        const text=`${city}-${stateName}-时差${delta>=0?'+':''}${delta}`;if(label.textContent!==text)label.textContent=text;
        const sameTimeAsLosAngeles=delta===0;label.style.setProperty('color',sameTimeAsLosAngeles?'#dc2626':'#245b37','important');label.style.setProperty('font-weight',sameTimeAsLosAngeles?'700':'600','important');
        const hintTitle='按号码区号推测的代表区域；号码携转后实际所在地可能不同';if(hintNode.title!==hintTitle)hintNode.title=hintTitle;if(hintNode.getAttribute('aria-label')!==text)hintNode.setAttribute('aria-label',text);
        areaHintStates.set(card,{areaCode,minute,hint:hintNode});
      }
    };
    const syncTopbarFold=()=>{
      const layout=document.querySelector<HTMLElement>('.main.content');
      const right=layout?.querySelector<HTMLElement>(':scope > .right');
      if(!right){document.documentElement.classList.remove('df-opensms-topbar-folded');return;}
      let style=document.getElementById('df-opensms-topbar-fold-style') as HTMLStyleElement|null;
      if(!style){
        style=document.createElement('style');style.id='df-opensms-topbar-fold-style';
        style.textContent='.df-opensms-topbar-fold{position:absolute;z-index:30000;top:8px;left:10px;min-height:30px;padding:4px 11px;border:1px solid #cbd5e1;border-radius:15px;background:#fff;color:#334155;font:600 12px/1.4 sans-serif;box-shadow:0 2px 8px #0f172a18;cursor:pointer}.df-opensms-topbar-fold:hover{background:#f1f5f9}.df-opensms-topbar-fold:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}.main.content > .right.df-opensms-topbar-is-folded > .im-top{height:0!important;min-height:0!important;max-height:0!important;flex:0 0 0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;visibility:hidden!important}.main.content > .right.df-opensms-topbar-is-folded > .im-chat{min-height:0!important;flex:1 1 auto!important}html.df-opensms-topbar-folded .ops-bell-root,html.df-opensms-topbar-folded .sound-alert-toggle{display:none!important}';
        (document.head||document.documentElement).appendChild(style);
      }
      right.style.setProperty('position','relative','important');
      let button=right.querySelector<HTMLButtonElement>(':scope > .df-opensms-topbar-fold');
      if(!button){
        button=document.createElement('button');button.type='button';button.className='df-opensms-topbar-fold';button.setAttribute('aria-controls','opensms-top-toolbar');
        right.prepend(button);
      }
      if(button.dataset.dfOpensmsFoldHandler!==version){button.onclick=()=>{state.topbarFolded=!state.topbarFolded;try{localStorage.setItem('df-opensms-topbar-folded-v1',state.topbarFolded?'1':'0');}catch{};syncTopbarFold();};button.dataset.dfOpensmsFoldHandler=version;}
      const toolbar=right.querySelector<HTMLElement>(':scope > .im-top');
      if(toolbar&&toolbar.id!=='opensms-top-toolbar')toolbar.id='opensms-top-toolbar';
      if(right.classList.contains('df-opensms-topbar-is-folded')!==Boolean(state.topbarFolded))right.classList.toggle('df-opensms-topbar-is-folded',Boolean(state.topbarFolded));
      document.documentElement.classList.toggle('df-opensms-topbar-folded',Boolean(state.topbarFolded));
      const label=state.topbarFolded?'展开顶部栏':'收起顶部栏';if(button.textContent!==label)button.textContent=label;
      const expanded=state.topbarFolded?'false':'true';if(button.getAttribute('aria-expanded')!==expanded)button.setAttribute('aria-expanded',expanded);
      const title=state.topbarFolded?'展开顶部功能区':'折叠顶部功能区，为会话腾出更多高度';if(button.title!==title)button.title=title;
    };
    const syncNightMode=()=>{
      const enabled=Boolean(state.nightMode);
      document.documentElement.classList.toggle('df-opensms-night-mode',enabled);
      let style=document.getElementById('df-opensms-night-mode-style') as HTMLStyleElement|null;
      if(!style){
        style=document.createElement('style');style.id='df-opensms-night-mode-style';
        style.textContent=`html.df-opensms-night-mode{color-scheme:dark!important;--el-bg-color:#18212a;--el-bg-color-page:#111820;--el-text-color-primary:#e5eaf0;--el-text-color-regular:#cbd5df;--el-text-color-secondary:#9aa8b7;--el-border-color:#3b4856;--el-border-color-light:#33404d;--el-fill-color-blank:#18212a;--el-fill-color-light:#25313d;--el-color-white:#18212a}html.df-opensms-night-mode,html.df-opensms-night-mode body,html.df-opensms-night-mode #app,html.df-opensms-night-mode .main,html.df-opensms-night-mode .main.content,html.df-opensms-night-mode .left,html.df-opensms-night-mode .left-bar,html.df-opensms-night-mode .right,html.df-opensms-night-mode .im-chat,html.df-opensms-night-mode .im-chat-top,html.df-opensms-night-mode .im-chat-footer,html.df-opensms-night-mode .im-chat-main-box,html.df-opensms-night-mode #message-box,html.df-opensms-night-mode .chat-list,html.df-opensms-night-mode .contact-list,html.df-opensms-night-mode .el-container,html.df-opensms-night-mode .el-aside,html.df-opensms-night-mode .el-header,html.df-opensms-night-mode .el-main{background-color:#161d25!important;color:#e5eaf0!important;border-color:#364351!important}html.df-opensms-night-mode .chat-item{background-color:#1b242e!important;color:#dce4ec!important;border-color:#303c49!important}html.df-opensms-night-mode .chat-item:hover{background-color:#25313d!important}html.df-opensms-night-mode .chat-item.active{background-color:#26384a!important;color:#f3f6fa!important}html.df-opensms-night-mode .chat-item.active>.df-opensms-area-hint{background:#315c46!important;color:#f0fff4!important;border-color:#71ce96!important;box-shadow:0 0 0 2px #4ade8040,0 3px 10px #050a0780!important}html.df-opensms-night-mode .chat-item.active>.df-opensms-area-hint [aria-hidden=true]{background:#315c46!important;border-color:#71ce96!important}html.df-opensms-night-mode .im-chat-other .im-chat-text,html.df-opensms-night-mode .im-chat-other .message-content{background-color:#26313d!important;color:#e5eaf0!important}html.df-opensms-night-mode .im-chat-mine .im-chat-text,html.df-opensms-night-mode .im-chat-mine .message-content{background-color:#24543d!important;color:#effaf3!important}html.df-opensms-night-mode .message-info,html.df-opensms-night-mode .msg-time,html.df-opensms-night-mode .info-other,html.df-opensms-night-mode .tag-receiver{color:#aab7c5!important}html.df-opensms-night-mode input,html.df-opensms-night-mode textarea,html.df-opensms-night-mode [contenteditable=true],html.df-opensms-night-mode .el-input__wrapper,html.df-opensms-night-mode .el-input__inner,html.df-opensms-night-mode .el-textarea__inner{background-color:#1d2732!important;color:#e5eaf0!important;border-color:#465363!important}html.df-opensms-night-mode input::placeholder,html.df-opensms-night-mode textarea::placeholder{color:#93a1b0!important}html.df-opensms-night-mode button,html.df-opensms-night-mode .el-button,html.df-opensms-night-mode .el-dialog,html.df-opensms-night-mode .el-message-box,html.df-opensms-night-mode .el-popover,html.df-opensms-night-mode .el-dropdown-menu,html.df-opensms-night-mode .el-select-dropdown,html.df-opensms-night-mode .el-picker-panel{background-color:#202a35!important;color:#e5eaf0!important;border-color:#465363!important}html.df-opensms-night-mode .im-chat-send button{background-color:#216342!important;color:#f2fff6!important;border-color:#28754d!important}html.df-opensms-night-mode .df-opensms-area-hint{background:#183126!important;color:#c8ead4!important;border-color:#347653!important}html.df-opensms-night-mode .df-opensms-area-hint [aria-hidden=true]{background:#183126!important;border-color:#347653!important}html.df-opensms-night-mode .df-opensms-night-toggle{background:#293541!important;color:#e5eaf0!important;border-color:#4b5968!important}html.df-opensms-night-mode ::-webkit-scrollbar-track{background:#17202a!important}html.df-opensms-night-mode ::-webkit-scrollbar-thumb{background:#465363!important;border-color:#17202a!important}.df-opensms-night-toggle{position:absolute;z-index:30000;top:8px;left:126px;min-height:30px;padding:4px 11px;border:1px solid #cbd5e1;border-radius:15px;background:#fff;color:#334155;font:600 12px/1.4 sans-serif;box-shadow:0 2px 8px #0f172a18;cursor:pointer}.df-opensms-night-toggle:hover{background:#f1f5f9}.df-opensms-night-toggle:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}`;
        (document.head||document.documentElement).appendChild(style);
        style.textContent+=`html.df-opensms-night-mode .im-chat-top .info-other .info-value{color:#fff!important}html.df-opensms-night-mode .chat-item.active{background-color:#1b242e!important;color:#dce4ec!important}html.df-opensms-night-mode .chat-item.active>.df-opensms-area-hint{background:#c7f4d5!important;color:#245b37!important;border-color:#4ca96c!important;box-shadow:0 0 0 2px #4ade8040,0 3px 10px #050a0780!important}html.df-opensms-night-mode .chat-item.active>.df-opensms-area-hint [aria-hidden=true]{background:#c7f4d5!important;border-color:#4ca96c!important}html.df-opensms-night-mode .chat-item.active .address-name{color:#f8fff9!important;font-weight:700!important;text-shadow:0 0 6px #86efac80!important}`;
      }
      const right=document.querySelector<HTMLElement>('.main.content > .right');if(!right)return;
      let button=right.querySelector<HTMLButtonElement>(':scope > .df-opensms-night-toggle');
      if(!button){button=document.createElement('button');button.type='button';button.className='df-opensms-night-toggle';button.setAttribute('aria-pressed','false');right.appendChild(button);}
      if(button.dataset.dfOpensmsNightHandler!==version){button.onclick=()=>{state.nightMode=!state.nightMode;try{localStorage.setItem('df-opensms-night-mode-v1',state.nightMode?'1':'0');}catch{};syncNightMode();};button.dataset.dfOpensmsNightHandler=version;}
      const label=enabled?'日间模式':'夜间模式';if(button.textContent!==label)button.textContent=label;
      const title=enabled?'切换到日间模式':'切换到夜间模式';if(button.title!==title)button.title=title;
      const pressed=enabled?'true':'false';if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);
    };
    const visible = (el: Element | null): el is HTMLElement => !!el && el.getClientRects().length>0 && getComputedStyle(el).display!=='none' && getComputedStyle(el).visibility!=='hidden';
    const contact = () => {
      const selected=Array.from(document.querySelectorAll('.chat-item.active[data-id]')).filter(visible);
      const account=normalize(document.querySelector('.left-bar .avatar-name')?.textContent || '');
      const id=selected.length===1?selected[0].getAttribute('data-id') || '':'';
      const open=location.hash.startsWith('#/index/chat')&&visible(document.querySelector('.im-chat #message-box'));
      const title=normalize(document.querySelector('.im-chat-top .info-other .info-value')?.textContent || '当前联系人').slice(0,200);
      const signature=`sms:${encodeURIComponent(account)}:${encodeURIComponent(id)}`;
      const number=selected.length===1?selected[0].querySelector('.tag-receiver')?.parentElement?.querySelector('.address-name'):null;
      const phone=normalizePhone(number?.getAttribute('title')||number?.textContent||'');
      return {id:open&&account&&/^[\w.-]{1,128}$/.test(id)&&signature.length<=240?signature:'',title,phone:open?phone:''};
    };
    const editor = () => {
      const caption=document.querySelector<HTMLElement>('.im-chat .mms-preview-bar .mms-title-input input');
      if(visible(caption))return caption;
      const nodes=Array.from(document.querySelectorAll<HTMLElement>('.im-chat .im-chat-footer #messageTextArea[contenteditable]:not([contenteditable="false"])')).filter(visible);
      return nodes.length===1?nodes[0]:null;
    };
    const read = (el: HTMLElement | null = editor()): string => {
      if(!el)return '';
      if(el instanceof HTMLInputElement)return canonical(el.value);
      // The site uses contenteditable DIV/BR blocks for pasted multi-line text.
      const walk=(node:Node):string=>{
        if(node.nodeType===Node.TEXT_NODE)return node.nodeValue || '';
        if(!(node instanceof Element))return '';
        if(node.tagName==='BR')return '\n';
        if(node.tagName==='IMG')return node.getAttribute('alt') || '';
        let out='';for(const child of Array.from(node.childNodes)){
          const block=child instanceof Element&&/^(DIV|P|LI|PRE)$/.test(child.tagName);
          if(block&&out&&!out.endsWith('\n'))out+='\n';
          out+=walk(child);if(block&&!out.endsWith('\n'))out+='\n';
        }return out;
      };return canonical(walk(el));
    };
    const emit = (action:string,text='',requestId='') => { w.__dfTranslatorQueue ||= [];w.__dfTranslatorQueue.push({action,text,requestId,conversationSignature:contact().id});if(w.__dfTranslatorQueue.length>100)w.__dfTranslatorQueue.splice(0,w.__dfTranslatorQueue.length-100); };
    const draftContext = () => editor() instanceof HTMLInputElement?document.querySelector('.im-chat .mms-preview-bar img')?.getAttribute('src') || 'mms':'sms';
    const hint = (text:string) => {const el=document.getElementById('df-opensms-status');if(el)el.textContent=text;};
    const reset = () => {
      state.pending=null;state.ready=null;state.sensitive=null;
      const input=editor();if(input){delete input.dataset.dfTranslatorRequestId;delete input.dataset.dfTranslatorReadyRequestId;}
    };
    const sync = (refreshAreaHints=false) => {
      const id=contact().id;const conversationChanged=id!==state.signature;if(conversationChanged){state.signature=id;reset();w.__dfConversationSignature=id;emit('conversation-change',id);hint('');}
      if(conversationChanged||refreshAreaHints||areaHintMinute!==Math.floor(Date.now()/60000))renderAreaCodeHint();
      syncTopbarFold();
      syncNightMode();
      // The preload guard intentionally blocks Enter until this exact marker
      // confirms that the page-world handler has installed successfully.
      document.documentElement.dataset.dfOpenSmsGuard=startupGuardMarker;
      const footer=document.querySelector('.im-chat-footer');
      if(footer&&!document.getElementById('df-opensms-status')){
        const status=document.createElement('div');status.id='df-opensms-status';status.setAttribute('role','status');status.style.cssText='padding:4px 12px;font:12px/1.6 sans-serif;color:#21894e;white-space:pre-wrap';footer.prepend(status);
      }
    };
    const source = (el: Element) => {const clone=el.cloneNode(true) as HTMLElement;clone.querySelectorAll('.df-chat-translation,.df-chat-refresh-translation,.df-smart-reply-host').forEach(n=>n.remove());return normalize(clone.innerText || clone.textContent || '');};
    // Cache only source metadata. Geometry is read afresh so scrolling, wrapping
    // and resized windows cannot leave stale translation candidates.
    const rowSources = new WeakMap<Element, { body: HTMLElement; text: string; key: string; signature: string; rowId: string }>();
    let decorationDirty = true;
    const isForeground=()=>state.foreground!==false&&!document.hidden;
    const rows = () => {
      processMutations(observer.takeRecords());
      const current=contact();if(!current.id)return [];
      const box=document.getElementById('message-box')!;
      const nearConversationEnd=box.scrollHeight-box.scrollTop-box.clientHeight<180,nearConversationStart=box.scrollTop<180;
      return Array.from(document.querySelectorAll<HTMLElement>('#message-box > ul > li[id^="m-"].im-chat-other,#message-box > ul > li[id^="m-"].im-chat-mine')).flatMap(row=>{
        const body=row.querySelector<HTMLElement>('.im-chat-text > .message-content');if(!body||!visible(body))return [];
        let cached=rowSources.get(row);
        if(!cached||cached.body!==body||cached.signature!==current.id||cached.rowId!==row.id){
          const text=source(body);const key=`sms-${hash(current.id)}-${hash(row.id)}-${hash(text)}`;
          cached={body,text,key,signature:current.id,rowId:row.id};rowSources.set(row,cached);
          body.dataset.dfMsgTextKey=key;row.dataset.dfMsgKey=key;
        }
        const {text,key}=cached;if(!text)return [];
        const rect=body.getBoundingClientRect();
        const timestamp=row.querySelector<HTMLElement>('.im-chat-user .msg-time,.contact-time-only')?.textContent||'';
        return [{key,text,timestamp,dayKey:dayKey(timestamp),contactId:current.id,contactKey:current.id,contactIdType:'platform',contactTitle:current.title,direction:row.classList.contains('im-chat-mine')?'outgoing':'incoming',messagePart:'body',rectTop:rect.top,rectBottom:rect.bottom,viewportHeight:innerHeight,scanBand:rect.bottom<0?'above':rect.top>innerHeight?'below':'visible',nearConversationEnd,nearConversationStart,row,body}];
      });
    };
    const paint = (entry:any,knownItem?:ReturnType<typeof rows>[number],preserveScroll=true) => {
      const item=knownItem||rows().find(r=>r.key===entry.key&&(!entry.sourceText||r.text===normalize(entry.sourceText)));if(!item||item.key!==entry.key||(entry.sourceText&&item.text!==normalize(entry.sourceText)))return false;
      const box=document.getElementById('message-box')!;
      const atBottom=preserveScroll&&box.scrollHeight-box.scrollTop-box.clientHeight<120;
      const beforeHeight=preserveScroll?box.scrollHeight:0,beforeTop=preserveScroll?box.scrollTop:0;
      const above=preserveScroll&&item.row.getBoundingClientRect().bottom<box.getBoundingClientRect().top;
      let translation=item.body.parentElement!.querySelector<HTMLElement>(':scope > .df-chat-translation');
      if(!translation){translation=document.createElement('div');translation.className='df-chat-translation';translation.style.cssText=`display:block;white-space:pre-wrap;font-size:13px;line-height:1.6;margin-top:7px;padding-top:6px;border-top:1px solid currentColor;color:${item.direction==='outgoing'?'#fff':'#247944'};overflow-wrap:anywhere`;item.body.after(translation);}
      if(translation.textContent!==entry.translation)translation.textContent=entry.translation;
      translation.dataset.dfTranslationSource=item.text;
      if(atBottom)box.scrollTop=box.scrollHeight;else if(above)box.scrollTop=beforeTop+box.scrollHeight-beforeHeight;
      return true;
    };
    const refresh = (key:string,processing:boolean) => {const item=rows().find(r=>r.key===key);const button=item?.row.querySelector<HTMLButtonElement>('.df-chat-refresh-translation');if(button){button.disabled=processing;button.textContent=processing?'…':'↻';}return !!button;};
    const decorate = () => {
      const items=rows();
      if(!decorationDirty||!isForeground())return items;
      decorationDirty=false;
      // Reuse the scan for every cached translation, then restore the viewport once.
      const box=document.getElementById('message-box');
      const atBottom=!!box&&box.scrollHeight-box.scrollTop-box.clientHeight<120;
      const boxTop=box?.getBoundingClientRect().top||0;
      const anchor=items.find(item=>item.rectBottom>=boxTop)?.row;
      const anchorTop=anchor?.getBoundingClientRect().top||0;
      let layoutChanged=false;
      for(const item of items){
        const old=item.row.querySelector<HTMLElement>('.df-chat-translation');if(old&&old.dataset.dfTranslationSource!==item.text){old.remove();layoutChanged=true;}
        const oldRefresh=item.row.querySelector<HTMLElement>('.df-chat-refresh-translation');if(oldRefresh&&oldRefresh.dataset.dfRefreshKey!==item.key){oldRefresh.remove();layoutChanged=true;}
        const cached=state.cache.get(hash(item.text));
        if(cached?.sourceText===item.text&&!item.row.querySelector('.df-chat-translation')){paint({key:item.key,translation:cached.translatedText,sourceText:item.text},item,false);layoutChanged=true;}
        if(!/[A-Za-z]{2,}/.test(item.text)||/[\u3400-\u9fff]/.test(item.text))continue;
        if(!item.row.querySelector('.df-chat-refresh-translation')){
          const button=document.createElement('button');button.type='button';button.className='df-chat-refresh-translation';button.dataset.dfRefreshKey=item.key;button.textContent='↻';button.title='刷新翻译';button.style.cssText='font:12px sans-serif;background:transparent;border:0;cursor:pointer;color:inherit';
          button.onclick=()=>{if(contact().id!==item.contactId||source(item.body)!==item.text)return;button.disabled=true;emit('bubble-refresh',JSON.stringify({key:item.key,text:item.text,direction:item.direction,messagePart:'body'}));};item.body.parentElement!.appendChild(button);layoutChanged=true;
        }
      }
      const eligible=items.filter(i=>i.direction==='incoming'&&i.text.length<=4000&&/[A-Za-z]{2,}/.test(i.text)&&!/[\u3400-\u9fff]/.test(i.text)).slice(-3);
      document.querySelectorAll<HTMLElement>('#message-box .df-smart-reply-host').forEach(n=>{if(!eligible.some(i=>i.key===n.dataset.smsKey)){n.remove();layoutChanged=true;}});
      for(const item of eligible){
        if(item.row.querySelector('.df-smart-reply-host'))continue;
        const button=document.createElement('button');button.type='button';button.className='df-smart-reply-host';button.dataset.smsKey=item.key;button.textContent='去GPT';button.title='以此气泡为终点，不限日期向上复制最多 18 条有效英文气泡（含双方消息和时间）';button.style.cssText='display:block;margin:5px 0;font:12px sans-serif;border:1px solid #80c79a;border-radius:6px;padding:3px 8px;background:#effbf3;color:#197745;cursor:pointer';
        button.onclick=()=>{
          const current=rows();const index=current.findIndex(r=>r.key===item.key);if(index<0||item.direction!=='incoming'||contact().id!==item.contactId)return;
          const messages=current.slice(0,index+1).filter(r=>/[A-Za-z]{2,}/.test(r.text)&&!/[\u3400-\u9fff]/.test(r.text)&&r.text.length<=4000).slice(-18).map(r=>({speaker:r.direction==='outgoing'?'self':'other',text:r.text,timestamp:normalize(r.timestamp).slice(0,256)}));
          while(new TextEncoder().encode(JSON.stringify(messages)).length>80_000&&messages.length>1)messages.shift();
          const activeCards=Array.from(document.querySelectorAll<HTMLElement>('.chat-item.active')).filter(visible);
          const activeNumber=activeCards.length===1?activeCards[0].querySelector<HTMLElement>('.tag-receiver')?.parentElement?.querySelector<HTMLElement>('.address-name'):null;
          const rawNumber=activeNumber?.getAttribute('title')||activeNumber?.textContent||'';
          const areaCode=phoneAreaCode(rawNumber);const area=areaCode?openSmsAreaCodeInfo[areaCode]:undefined;
          const openSmsAreaContext=area?{areaCode,state:area[1],city:area[0]}:undefined;
          if(messages.length&&new TextEncoder().encode(JSON.stringify(messages)).length<=80_000)emit('smart-reply-request',JSON.stringify({latestMessageKey:`smart-${hash(item.key)}-${hash(item.text)}`,messages,...(openSmsAreaContext?{openSmsAreaContext}:{})}),`sms-gpt-${Date.now().toString(36)}`);
        };item.body.parentElement!.appendChild(button);layoutChanged=true;
      }
      if(box&&layoutChanged){
        if(atBottom)box.scrollTop=box.scrollHeight;
        else if(anchor?.isConnected)box.scrollTop+=anchor.getBoundingClientRect().top-anchorTop;
      }
      return items;
    };
    // Resolve each command only after its translation was applied. Several
    // concurrent completions share one scan and one scroll-anchor restoration.
    let paintTimer:number|undefined;
    let pendingPaints:{entry:any;signature:string;resolve:(ok:boolean)=>void}[]=[];
    const queuePaint=(entry:any)=>new Promise<boolean>(resolve=>{
      pendingPaints.push({entry,signature:contact().id,resolve});
      if(paintTimer!==undefined)return;
      paintTimer=window.setTimeout(()=>{
        paintTimer=undefined;const batch=pendingPaints;pendingPaints=[];
        const items=rows(),byKey=new Map(items.map(item=>[item.key,item]));
        const box=document.getElementById('message-box');
        const atBottom=!!box&&box.scrollHeight-box.scrollTop-box.clientHeight<120;
        const boxTop=box?.getBoundingClientRect().top||0;
        const anchor=items.find(item=>item.rectBottom>=boxTop)?.row;
        const anchorTop=anchor?.getBoundingClientRect().top||0;
        const signature=contact().id;
        let changed=false;
        for(const request of batch){
          const item=byKey.get(request.entry.key);
          const ok=!!item&&request.signature===signature&&paint(request.entry,item,false);
          changed ||= ok;request.resolve(ok);
        }
        if(box&&changed){if(atBottom)box.scrollTop=box.scrollHeight;else if(anchor?.isConnected)box.scrollTop+=anchor.getBoundingClientRect().top-anchorTop;}
      },isForeground()?24:100);
    });
    const sensitive = (text:string) => text.length<=256&&!/[\r\n]/.test(text)&&(/^[0-9 ]{1,34}$/.test(text)||/^0x[0-9A-Za-z]{20,80}$/.test(text)||/^T[0-9A-Za-z]{33}$/.test(text)||/^[0-9A-Za-z]{32,44}$/.test(text));
    const directUrl = (text:string) => {
      if(/\s/.test(text)||!/^https?:\/\/|^www\./i.test(text))return false;
      try{const url=new URL(/^www\./i.test(text)?'https://'+text:text);return ['http:','https:'].includes(url.protocol)&&!!url.hostname;}catch{return false;}
    };
    const stop = (event:Event) => {event.preventDefault();event.stopImmediatePropagation();};
    const submit = (event:Event) => {
      sync();const input=editor();const text=read(input);const signature=contact().id;
      if(state.sending)return;
      if(!state.enabled||!signature||!input){stop(event);hint('尚未可靠识别账号或联系人，已阻止发送');return;}
      if(!text){stop(event);hint('请先填写并核对当前短信或彩信正文');return;}
      if(state.pending){stop(event);hint('正在翻译，请稍候');return;}
      if(state.sensitive?.text===text&&state.sensitive.signature===signature&&state.sensitive.input===input&&state.sensitive.context===draftContext()){stop(event);const approval=state.sensitive;state.sensitive=null;state.pending={signature,input,text,context:draftContext(),requestId:approval.token};emit('sensitive-send',text,approval.token);return;}
      if(sensitive(text)){stop(event);state.pending={signature,input,text,context:draftContext(),requestId:'sensitive'};emit('sensitive-prepare',text);return;}
      if(/[\u3400-\u9fff]/.test(text)&&!directUrl(text)){
        stop(event);const requestId=`sms-translate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
        state.pending={signature,input,text,context:draftContext(),requestId};input.dataset.dfTranslatorRequestId=requestId;emit('translate',text,requestId);hint('正在翻译…');return;
      }
      if(state.ready){
        stop(event);const ready=state.ready;
        if(ready.text!==text||ready.signature!==signature||ready.input!==input||ready.context!==draftContext()){reset();hint('内容或联系人已变化，请重新核对');return;}
        state.ready=null;state.pending={signature,input,text,context:draftContext(),requestId:ready.requestId};emit('send',text,ready.requestId);
      }
    };
    let spaceRun: { input: HTMLElement; signature: string; text: string; count: number } | null = null;
    let spaceComposing = false;
    const clearSpaceRun = () => { spaceRun = null; };
    const onSpaceComposition = (event: Event) => {
      if (event.target !== editor()) return;
      spaceComposing = event.type === 'compositionstart'; clearSpaceRun();
    };
    const onSpaceInput = (event: Event) => {
      if (event.target !== editor()) return;
      const inputEvent = event as InputEvent;
      if (inputEvent.inputType === 'insertText' && inputEvent.data === ' ') return;
      // Some editors re-emit input without InputEvent fields.
      if (!inputEvent.inputType && spaceRun && spaceRun.text === read(editor()).replace(/ /g, '')) return;
      clearSpaceRun();
    };
    const handleSpace = (event: KeyboardEvent) => {
      const input = editor();
      if (!input || !(event.target instanceof Node) || !(event.target === input || input.contains(event.target))) { clearSpaceRun(); return false; }
      if (event.key !== ' ' && event.code !== 'Space') { clearSpaceRun(); return false; }
      if (spaceComposing || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) { clearSpaceRun(); return true; }
      if (event.repeat) return true;
      const text = read(editor()), signature = contact().id + ':' + draftContext();
      if (!/[\u3400-\u9fff]/.test(text) || directUrl(text)) { clearSpaceRun(); return true; }
      const normalized = text.replace(/ /g, '');
      const count = spaceRun?.input === input && spaceRun.signature === signature && spaceRun.text === normalized ? spaceRun.count + 1 : 1;
      spaceRun = { input, signature, text: normalized, count };
      if (count >= 2) { stop(event); submit(event); }
      return true;
    };
    const onKey=(event:KeyboardEvent)=>{
      if (handleSpace(event)) return;
      if(event.key!=='Enter')return;
      const input=editor(),target=event.target instanceof Element?event.target:null;
      const targetMatches=!!input&&!!target&&(input===target||input.contains(target));
      const text=read(input),signature=contact().id;
      const trace=(decision:string)=>emit('debug',JSON.stringify({kind:'opensms-enter',decision,enabled:state.enabled,hasConversation:Boolean(signature),hasComposer:Boolean(input),targetMatches,textLength:text.length,hasChinese:/[\u3400-\u9fff]/.test(text),hasEnglish:/[A-Za-z]{2,}/.test(text),hasPending:Boolean(state.pending),hasReady:Boolean(state.ready),composing:event.isComposing,keyCode:event.keyCode,repeat:event.repeat,targetTag:target?.tagName||'',targetClass:String(target?.className||'').slice(0,100),activeTag:document.activeElement?.tagName||'',activeClass:String((document.activeElement as HTMLElement|null)?.className||'').slice(0,100),editorTag:input?.tagName||'',editorClass:String(input?.className||'').slice(0,100)}));
      if(state.sending){if(targetMatches)trace('send-in-progress');return;}
      if(!targetMatches){trace('target-mismatch');return;}
      if(event.isComposing||event.keyCode===229){trace('ime-composition');return;}
      if(event.repeat){trace('repeat-blocked');stop(event);return;}
      let sendKey='enter';try{sendKey=localStorage.getItem('sendKey') || 'enter';}catch{}
      if(input instanceof HTMLInputElement){if(event.shiftKey||event.ctrlKey||event.metaKey){trace('modified-enter-ignored');stop(event);return;}trace('submit-input');submit(event);return;}
      if(event.ctrlKey||event.metaKey){trace('modified-enter-blocked');stop(event);hint('请使用 Enter 或设置的 Alt+Enter 发送');return;}
      if(event.shiftKey){trace('shift-enter');if(event.altKey)stop(event);return;}
      if(sendKey==='alt+enter'&&!event.altKey&&!/[\u3400-\u9fff]/.test(text)){trace('waiting-for-alt-enter');return;}
      trace('submit-composer');
      submit(event);
    };
    const mainButton = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.im-chat .im-chat-send button')).filter(b=>visible(b)&&normalize(b.textContent || '')==='发送');
    const onPointer=(event:Event)=>{if(state.sending)return;const button=event.target instanceof Element?event.target.closest('button'):null;if(button&&mainButton().includes(button as HTMLButtonElement))submit(event);};
    const onInput=(event:Event)=>{
      const input=editor();if(state.writing||!input||event.target!==input)return;
      reset();emit('typing',read(input));hint(/[\u3400-\u9fff]/.test(read(input))?'按 Enter 或连续两次空格翻译，再按发送键发送英文':'');
    };
    const focus=()=>{const input=editor();if(!input)return false;const id=contact().id;input.focus();return input.isConnected&&editor()===input&&contact().id===id;};
    state.apply=(cmd:any):any=>{
      sync();
      if(cmd.action==='bootstrap'){renderAreaCodeHint();return true;}
      if(cmd.action==='contact')return contact();
      if(cmd.action==='sent-integrity-scan'){
        const signature=contact().id;
        if(!signature||signature!==cmd.expectedConversationSignature)return {sameConversation:false,conversationSignature:signature,candidates:[]};
        const candidates=state.apply({action:'scan',options:cmd.options});
        const current=contact().id;
        return {sameConversation:current===signature,conversationSignature:current,candidates:current===signature?candidates:[]};
      }
      if(cmd.action==='install'){processMutations(observer.takeRecords());if(decorationDirty&&isForeground())decorate();return true;}
      if(cmd.action==='enabled'){state.enabled=cmd.enabled;if(!cmd.enabled)reset();return true;}
      if(cmd.action==='text')return read();
      if(cmd.action==='focus'||cmd.action==='focusNative')return focus();
      if(cmd.action==='matches')return !!state.pending&&state.pending.requestId===cmd.requestId&&state.pending.signature===contact().id&&state.pending.input===editor()&&state.pending.context===draftContext()&&read()===state.pending.text;
      if(cmd.action==='probe'){
        const input=editor();
        const describe=(el:Element)=>{const rect=el.getBoundingClientRect(),style=getComputedStyle(el);return {tag:el.tagName,id:(el as HTMLElement).id||'',className:String((el as HTMLElement).className||'').slice(0,140),role:el.getAttribute('role')||'',contenteditable:el.getAttribute('contenteditable')||'',ariaLabel:el.getAttribute('aria-label')||'',placeholder:(el.getAttribute('placeholder')||'').slice(0,80),visible:visible(el as HTMLElement),width:Math.round(rect.width),height:Math.round(rect.height),display:style.display,tabIndex:(el as HTMLElement).tabIndex,parentTag:el.parentElement?.tagName||'',parentClass:String(el.parentElement?.className||'').slice(0,120)}};
        const editables=Array.from(document.querySelectorAll<HTMLElement>('.im-chat textarea,.im-chat input,.im-chat [contenteditable],.im-chat [role="textbox"]')).slice(0,20).map(describe);
        const sendButtons=Array.from(document.querySelectorAll<HTMLElement>('.im-chat button')).filter(el=>normalize(el.textContent||'').includes('发送')).slice(0,5).map(describe);
        const active=document.activeElement;
        return {guard:version,hasComposer:!!input,textLength:read().length,hasChinese:/[\u3400-\u9fff]/.test(read()),hasEnglish:/[A-Za-z]{2,}/.test(read()),queueLength:w.__dfTranslatorQueue?.length||0,translatedReady:!!state.ready,pending:!!state.pending,protectionReady:true,locationHash:location.hash.slice(0,80),active:active instanceof Element?describe(active):null,editor:input?describe(input):null,editableCandidates:editables,sendButtonCandidates:sendButtons,iframeCount:document.querySelectorAll('iframe').length};
      }
      if(cmd.action==='unread'){
        const badge=document.querySelector('.left-bar .nav-section a[href$="/index/chat"] .el-badge__content');
        const counts=Array.from(document.querySelectorAll('.chat-item .stat-unread .stat-value')).map(n=>Number(normalize(n.textContent||''))||0);
        const count=badge?(visible(badge)?parseInt(badge.textContent||'0',10)||0:0):counts.reduce((a,b)=>a+b,0);
        return {count:Math.min(999,Math.max(0,count)),ready:!!document.querySelector('.left-bar .avatar-name')};
      }
      if(cmd.action==='scan')return decorate().filter(r=>/[A-Za-z]{2,}/.test(r.text)&&!/[\u3400-\u9fff]/.test(r.text)&&r.text.length<=4000&&(cmd.options?.includeAlreadyTranslated||!r.row.querySelector('.df-chat-translation'))&&r.rectBottom>=-innerHeight*(cmd.options?.viewportScreensAbove||0)&&r.rectTop<=innerHeight*(1+(cmd.options?.viewportScreensBelow||0))).slice(-(cmd.options?.limit||12)).map(({row,body,...item}:any)=>item);
      if(cmd.action==='inject')return queuePaint(cmd);
      if(cmd.action==='cache'){for(const entry of cmd.entries||[])if(entry.sourceText)state.cache.set(hash(entry.sourceText),{...entry,sourceText:normalize(entry.sourceText)});while(state.cache.size>3000)state.cache.delete(state.cache.keys().next().value);decorationDirty=true;decorate();return true;}
      if(cmd.action==='refresh')return refresh(cmd.key,cmd.state==='processing');
      if(cmd.action==='smart'){processMutations(observer.takeRecords());if(decorationDirty&&isForeground())decorate();return true;}
      if(cmd.action==='state'){
        const value=cmd.state || {};const input=editor();
        if(value.conversationSignature&&value.conversationSignature!==contact().id)return false;
        if(value.expectedConversationSignature&&value.expectedConversationSignature!==contact().id)return false;
        if(Object.hasOwn(value,'sensitiveToken')){
          state.sensitive=value.sensitiveToken&&input?{token:value.sensitiveToken,text:value.sensitiveText,signature:contact().id,input,context:draftContext()}:null;state.pending=null;
        }
        if(Object.hasOwn(value,'translated')){
          if(value.translated&&input&&read(input)===canonical(value.translated)&&state.pending?.requestId===value.requestId&&state.pending.context===draftContext()){state.ready={text:canonical(value.translated),requestId:value.requestId,signature:contact().id,input,context:draftContext()};input.dataset.dfTranslatorReadyRequestId=value.requestId;state.pending=null;hint('翻译完成，请再次按发送键发送英文');}
          else if(!value.translated&&!state.pending){reset();hint(value.status || '');}
        }
        if(value.status){hint(value.status);if(/失败|超时|取消|重试/.test(value.status))reset();}
        return true;
      }
      if(cmd.action==='composer'){
        const p=cmd.payload;const input=editor();const id=contact().id;
        if(p.action==='pulse')return {ok:focus()};
        if(p.action==='clearProxy')return {ok:true};
        if(!input||!id)return {ok:false,reason:'sms-conversation-unavailable'};
        if(p.action==='write'){
          const pending=state.pending;
          if(!pending||pending.requestId!==p.requestId||pending.signature!==id||pending.input!==input||pending.context!==draftContext()||read(input)!==pending.text)return {ok:false,reason:'sms-draft-changed'};
          if(!focus()||contact().id!==id||state.pending!==pending||editor()!==input||read(input)!==pending.text||pending.context!==draftContext())return {ok:false,reason:'sms-focus-changed'};
          state.writing=true;try{if(input instanceof HTMLInputElement){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,p.text);}else{const range=document.createRange();range.selectNodeContents(input);const selection=getSelection();selection?.removeAllRanges();selection?.addRange(range);if(!document.execCommand('insertText',false,p.text))return {ok:false,reason:'sms-write-failed'};}input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:p.text}));}finally{state.writing=false;}
          return {ok:contact().id===id&&editor()===input&&read(input)===canonical(p.text)};
        }
        if(p.action==='send'||p.action==='sendExact'){
          const approval=state.pending;
          if(!approval||approval.input!==input||approval.signature!==id||approval.text!==read(input)||approval.context!==draftContext())return {ok:false,reason:'sms-draft-changed'};
          if(p.sendTarget?.conversationSignature!==id||canonical(p.text)!==read(input)||/[\u3400-\u9fff]/.test(read(input)))return {ok:false,reason:'sms-conversation-or-text-changed'};
          const buttons=mainButton();if(buttons.length!==1||buttons[0].disabled||!focus()||editor()!==input||contact().id!==id||read(input)!==canonical(p.text)||state.pending!==approval||approval.context!==draftContext())return {ok:false,reason:'sms-target-unavailable'};
          return (async()=>{
            state.sending=true;try{buttons[0].click();}finally{state.sending=false;}
            reset();await new Promise(resolve=>setTimeout(resolve,120));
            if(contact().id!==id)return {ok:false,reason:'sms-conversation-changed'};
            if(input.isConnected&&read(input)===canonical(p.text))return {ok:false,reason:'sms-native-not-accepted'};
            return {ok:true,method:'opensms-native-button'};
          })();
        }
      }
      return false;
    };
    document.addEventListener('input', onSpaceInput, true);
    for (const name of ['focusout', 'pointerdown']) document.addEventListener(name, clearSpaceRun, true);
    for (const name of ['compositionstart', 'compositionend']) document.addEventListener(name, onSpaceComposition, true);
    document.addEventListener('keydown',onKey,true);document.addEventListener('click',onPointer,true);document.addEventListener('input',onInput,true);
    let syncTimer:number|undefined;let decorateTimer:number|undefined;
    const scheduleSync=()=>{if(syncTimer!==undefined)return;syncTimer=window.setTimeout(()=>{syncTimer=undefined;sync(true);},120);};
    const scheduleDecorate=()=>{if(!isForeground()||decorateTimer!==undefined)return;decorateTimer=window.setTimeout(()=>{decorateTimer=undefined;decorate();},250);};
    // The host app already scans for translations periodically. Keep this as a
    // lightweight route/contact fallback instead of rescanning every bubble twice a second.
    const timer=setInterval(()=>sync(),1800);
    const processMutations=(records:MutationRecord[])=>{
      let needsSync=false;let needsDecorate=false;
      for(const record of records){
        const target=record.target instanceof Element?record.target:record.target.parentElement;
        const ownUi='.df-chat-translation,.df-chat-refresh-translation,.df-smart-reply-host,.df-opensms-area-hint';
        if(target?.closest(ownUi))continue;
        if(record.type==='childList'&&[...Array.from(record.addedNodes),...Array.from(record.removedNodes)].every(node=>node instanceof Element&&node.matches(ownUi)))continue;
        if(target?.closest('#message-box')){
          const row=target.closest('li[id^="m-"]');
          const cached=row&&rowSources.get(row);
          if(row&&cached&&(target===cached.body||cached.body.contains(target)||(record.type==='attributes'&&record.attributeName==='id'&&target===row)))rowSources.delete(row);
          // A removed/reinserted row may retain its element identity.
          if(record.type==='childList')for(const node of [...Array.from(record.addedNodes),...Array.from(record.removedNodes)])if(node instanceof Element){rowSources.delete(node);node.querySelectorAll('li[id^="m-"]').forEach(row=>rowSources.delete(row));}
          needsDecorate=true;
        }else needsSync=true;
      }
      if(needsSync){decorationDirty=true;scheduleSync();}if(needsDecorate){decorationDirty=true;scheduleDecorate();}
    };
    const observer=new MutationObserver(processMutations);observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','data-id','title','id']});
    const onVisibility=()=>{if(!document.hidden){decorationDirty=true;scheduleSync();scheduleDecorate();}};
    // CSS visibility on an embedded webview does not reliably describe whether
    // its host workspace is active. The host supplies that state on short calls.
    state.setForeground=(foreground:boolean)=>{if(state.foreground===foreground)return;state.foreground=foreground;if(foreground){decorationDirty=true;scheduleSync();scheduleDecorate();}};
    document.addEventListener('visibilitychange',onVisibility);
    state.dispose=()=>{document.removeEventListener('visibilitychange',onVisibility);if(paintTimer!==undefined)clearTimeout(paintTimer);for(const request of pendingPaints)request.resolve(false);pendingPaints=[];document.removeEventListener('input', onSpaceInput, true); for (const name of ['focusout', 'pointerdown']) document.removeEventListener(name, clearSpaceRun, true); for (const name of ['compositionstart', 'compositionend']) document.removeEventListener(name, onSpaceComposition, true); observer.disconnect();clearInterval(timer);if(syncTimer!==undefined)clearTimeout(syncTimer);if(decorateTimer!==undefined)clearTimeout(decorateTimer);document.removeEventListener('keydown',onKey,true);document.removeEventListener('click',onPointer,true);document.removeEventListener('input',onInput,true);delete document.documentElement.dataset.dfOpenSmsGuard;};
    state.editor=editor;w.__dfOpenSms=state;
  }
  return w.__dfOpenSms.apply(command);
}
export function buildOpenSmsScript(command:any) {return `(${openSmsRuntime.toString()})(${JSON.stringify(command)},${normalizeAssistantPhone.toString()},${JSON.stringify(openSmsAreaCodeInfo)})`;}
export function buildOpenSmsRuntimeCheck() {return `window.__dfOpenSms?.version==="2026-11-15-opensms-incremental-v15"`;}
export function buildOpenSmsCommandScript(command:any) {return `(()=>{if(!(${buildOpenSmsRuntimeCheck()}))throw new Error("OpenSMS runtime unavailable");return window.__dfOpenSms.apply(${JSON.stringify(command)});})()`;}


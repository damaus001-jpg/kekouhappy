import type { AssistantCatalog, AssistantMaterial, AssistantStagedMaterial, AssistantUsage } from '../electron/assistant-material-types';
export type AssistantRuntimeConfig = {
  platform: 'whatsapp'|'telegram'|'signal'; catalog: AssistantCatalog;
  colors: Record<string,string>; icon: string; usages: AssistantUsage[]; enabled: boolean; showButton?:boolean;
};
export type AssistantRuntimeEvent = {
  action: 'copy'|'used'|'preview'; material?: AssistantMaterial; token?: string; mediaId?:string;
  contactId?: string; contactTitle?: string; actualText?: string;
};
export type AssistantRuntimeSnapshot = { events: AssistantRuntimeEvent[]; contact: {id:string;title:string} };
type Command = {command:'install';config:AssistantRuntimeConfig} | {command:'stage';pending:AssistantStagedMaterial|null}
  | {command:'result';token:string;error?:string;usage?:AssistantUsage} | {command:'poll'}
  | {command:'image-chunk';id:string;chunk:string;start:boolean;end:boolean};

// This function is serialized and executed inside the platform window. Keep all
// DOM helpers inside it; no renderer imports or platform internals are required.
function assistantRuntime(command: Command) {
  const w = window as any;
  if (!w.__dfMaterialRuntime) {
    const state: any = {config:null,queue:[],pending:null,tab:'persona',expanded:new Set(),modal:null,consumed:new Set(),lastContact:''};
    const visible = (node: Element|null): node is HTMLElement => !!node && !!node.getClientRects().length && getComputedStyle(node).visibility!=='hidden';
    const scope = () => state.config?.platform==='whatsapp' ? document.querySelector('#main')
      : state.config?.platform==='telegram' ? document.querySelector('#MiddleColumn,.chat.active,.chat:not(.hidden),.middle-column') : document.querySelector('.module-conversation,.ConversationView,.CompositionArea')?.parentElement;
    const readContact = () => {
      const platform = state.config?.platform;
      let id=''; const root = scope();
      if (platform==='signal') {
        const value = document.querySelector('.CompositionArea[data-df-signal-conversation-id]')?.getAttribute('data-df-signal-conversation-id')||'';
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) id=`signal:${value.toLowerCase()}`;
      } else if (platform==='telegram') {
        const header = root?.querySelector('.chat-info,.ChatInfo,.chat-header,.middle-header,header');
        const value = header?.getAttribute('data-peer-id') || header?.querySelector('[data-peer-id]')?.getAttribute('data-peer-id')
          || root?.getAttribute('data-peer-id') || location.hash.match(/^#(-?\d+)(?:_|$)/)?.[1] || '';
        if (/^-?\d+$/.test(value)) id=`tg:${value}`;
      } else if (platform==='whatsapp' && root) {
        const explicit = root.getAttribute('data-jid') || root.querySelector('header [data-jid]')?.getAttribute('data-jid') || '';
        let jid=/^[\w.+-]+@(c\.us|s\.whatsapp\.net|lid|g\.us)$/.test(explicit)?explicit:'';
        if (!jid) {
          // Read identities from messages in the OPEN chat, never from contact names or sidebar rows.
          const identities = new Set<string>();
          for (const node of root.querySelectorAll('[data-id]')) {
            const match = node.getAttribute('data-id')?.match(/^(?:true|false)_([\w.+-]+@(?:c\.us|s\.whatsapp\.net|lid|g\.us))_/);
            if (match) identities.add(match[1]);
          }
          if (identities.size===1) jid=Array.from(identities)[0];
        }
        if(jid)id=`wa:${jid.replace('@s.whatsapp.net','@c.us')}`;
      }
      const titleNode = root?.querySelector('header [title],header [dir="auto"],.chat-info .peer-title,.ChatInfo .title,.chat-info .title,.module-conversation-header__title,.ConversationHeader__title');
      const title = (titleNode?.getAttribute('title') || titleNode?.textContent || root?.querySelector('.peer-title')?.textContent || '当前联系人').replace(/\s+/g,' ').trim().slice(0,200);
      return {id,title};
    };
    const composer = () => {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(
        '#main footer [contenteditable="true"],#main footer [contenteditable="plaintext-only"],.CompositionArea .ql-editor[contenteditable],.CompositionArea [contenteditable="true"],#MiddleColumn [contenteditable="true"],.chat-input-main [contenteditable="true"],.new-message-wrapper [contenteditable="true"],.composer_rich_textarea[contenteditable],.input-message-input[contenteditable],.editable-message-text[contenteditable],#editable-message-text[contenteditable]'));
      return candidates.filter(n=>visible(n)&&!n.closest('#df-material-root')&&!n.classList.contains('input-message-input-fake')).sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0]||null;
    };
    const root = document.createElement('div'); root.id='df-material-root';
    // A shadow root prevents platform selectors and theme styles from interfering with the assistant.
    const shadow=root.attachShadow({mode:'open'}); document.body.appendChild(root);
    const style=document.createElement('style');
    style.textContent=`
      :host{all:initial;font-family:Arial,"Microsoft YaHei",sans-serif;color:var(--text);font-size:12px}
      *{box-sizing:border-box}button{font:inherit;color:var(--text);border:1px solid var(--line);background:var(--panel-muted);border-radius:8px;padding:7px 11px;cursor:pointer}button:hover{border-color:var(--accent);color:var(--accent-bright)}button:disabled{opacity:.5;cursor:wait}button:focus-visible,textarea:focus-visible{outline:2px solid var(--accent)}
      .float{position:fixed;right:12px;top:55%;width:64px;padding:0;border:0;background:transparent;z-index:2147483000;touch-action:none;cursor:grab}.float img{width:58px;height:76px;object-fit:contain;filter:drop-shadow(0 3px 5px #0005);pointer-events:none}.float span{display:block;background:var(--panel-strong);border:1px solid var(--line);border-radius:8px;padding:3px;color:var(--accent-bright);font-size:11px}
      .panel{position:fixed;right:8px;top:8px;bottom:8px;width:min(472px,calc(100vw - 24px));z-index:2147483001;border:1px solid var(--line-strong);border-radius:18px;background:var(--panel-strong);box-shadow:0 12px 40px #0004;display:flex;flex-direction:column;overflow:hidden}header{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}header img{width:40px;height:50px;object-fit:contain}header strong{color:var(--accent-bright);font-size:18px}header small{display:block;margin-top:5px;color:var(--muted)}header>div{flex:1}header button{font-size:22px}nav{display:flex;gap:6px;padding:10px 12px}nav button{flex:1}.active{border-color:var(--accent);color:var(--accent-bright)}.scroll{flex:1;min-height:0;overflow:auto;padding:24px 20px}.name{color:var(--muted);letter-spacing:1px;margin:0 0 26px 24px}
      ol{list-style:none;padding:0 0 0 10px;margin:0}li{position:relative;padding:0 0 22px 25px;border-left:1px solid var(--line-strong)}li:last-child{border-left-color:transparent}li:before{content:'';position:absolute;left:-5px;top:17px;width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--panel-strong)}article{padding:15px 17px 17px;background:linear-gradient(135deg,var(--panel-muted),var(--bg-soft));border:1px solid var(--line);border-radius:14px}.date{margin:0 0 8px;font-size:11px;letter-spacing:1px;color:var(--accent-bright);font-weight:600}h3{margin:0 0 8px;font-size:15px;line-height:1.5}footer{display:flex;justify-content:flex-end;margin-top:12px}.materials{display:flex;flex-direction:column;gap:12px;margin-top:12px}.material{display:flex;flex-direction:column;gap:10px;align-items:flex-start;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel-strong)}.material p{margin:0;white-space:pre-wrap;font-size:12px;line-height:1.9;color:var(--muted-strong)}.material img{max-width:100%;max-height:240px;object-fit:contain;border-radius:8px}.material button{align-self:flex-end}.used{color:var(--muted)}.empty{color:var(--muted);line-height:1.8}.toast{position:fixed;bottom:24px;right:24px;max-width:400px;z-index:2147483005;background:var(--panel-strong);border:1px solid var(--accent);border-radius:12px;padding:14px;color:var(--text)}
      .mask{position:fixed;inset:0;z-index:2147483003;background:#0008;display:grid;place-items:center;padding:20px;pointer-events:none}.dialog{pointer-events:auto;width:min(460px,100%);max-height:85vh;overflow:auto;border:1px solid var(--line-strong);border-radius:18px;padding:24px;background:var(--panel-strong);box-shadow:0 12px 60px #0005}.dialog h2{font-size:18px;margin:0 0 14px}.target{color:var(--accent-bright);line-height:1.7}.dialog textarea{width:100%;min-height:160px;max-height:45vh;resize:vertical;background:var(--bg-soft);border:1px solid var(--line);border-radius:10px;color:var(--text);font:inherit;font-size:14px;line-height:1.8;padding:12px}.dialog img{display:block;max-width:100%;max-height:40vh;object-fit:contain;margin:auto}.dialog .hint{color:var(--muted);line-height:1.7}.dialog .error{color:#e56565;line-height:1.6}.primary{background:var(--accent);color:var(--bg);font-weight:600}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
    `;
    shadow.appendChild(style);
    const node = (tag:string,className='',text='') => {const el=document.createElement(tag);el.className=className;if(text)el.textContent=text;return el;};
    const button = (label:string,click:()=>void) => {const el=node('button','',label) as HTMLButtonElement;el.type='button';el.onclick=click;return el;};
    const toast = (message:string) => {shadow.querySelector('.toast')?.remove();const el=node('div','toast',message);el.setAttribute('role','status');shadow.appendChild(el);setTimeout(()=>el.remove(),4000);};
    const used = (id:string) => state.config.usages.some((u:AssistantUsage)=>u.contactId===readContact().id&&u.materialId===id);
    const renderPanel = () => {
      const old=shadow.querySelector('.panel');const scrollTop=old?.querySelector('.scroll')?.scrollTop||0;old?.remove();
      if(!state.open || !state.config.enabled)return;
      const panel=node('aside','panel'); panel.setAttribute('aria-label','小智加持资料助手');
      const heading=node('header');const logo=node('img') as HTMLImageElement;logo.src=state.config.icon;logo.alt='';heading.appendChild(logo);
      const titles=node('div');titles.appendChild(node('strong','','小智加持'));titles.appendChild(node('small','',readContact().title));heading.append(titles,button('×',()=>{state.open=false;renderPanel();}));
      panel.appendChild(heading);const nav=node('nav');
      for(const [key,label]of Object.entries({persona:'人物资料',schedule:'一周行程',quotes:'案例金句'})){
        const tab=button(label,()=>{state.tab=key;renderPanel();});if(state.tab===key)tab.className='active';nav.appendChild(tab);
      }
      panel.appendChild(nav);const scroll=node('div','scroll');if(state.tab==='persona')scroll.appendChild(node('p','name','Lucy · 黄诗婷'));
      const list=node('ol');const cards=state.config.catalog[state.tab]||[];
      if(!cards.length)scroll.appendChild(node('p','empty','暂无素材'));
      for(const card of cards){
        const item=node('li'),article=node('article');if(card.date)article.appendChild(node('p','date',card.date));article.appendChild(node('h3','',card.title));
        if(state.expanded.has(card.id)){
          const materials=node('div','materials');if(!card.materials.length)materials.appendChild(node('p','empty','暂无素材'));
          for(const material of card.materials){
            const entry=node('section','material');
            if(material.type==='text')entry.appendChild(node('p','',material.text));else{
              const image=node('img') as HTMLImageElement;image.alt=material.name||'图片素材';image.src=state.images?.[material.mediaId]||'';
              if(!image.src || !state.images?.[material.mediaId]){image.removeAttribute('src');entry.appendChild(node('p','empty',material.name||'图片素材'));state.requestedImages ||= new Set();if(!state.requestedImages.has(material.mediaId)){state.requestedImages.add(material.mediaId);state.queue.push({action:'preview',mediaId:material.mediaId});}}
              else entry.appendChild(image);
            }
            const copy=button(used(material.id)?'已使用':'复制',()=>{state.queue.push({action:'copy',material});toast('正在复制素材…');});
            if(used(material.id))copy.className='used';entry.appendChild(copy);materials.appendChild(entry);
          }
          article.appendChild(materials);
        }
        const footer=node('footer');const expand=button(state.expanded.has(card.id)?'收起':'展开',()=>{state.expanded.has(card.id)?state.expanded.delete(card.id):state.expanded.add(card.id);renderPanel();});expand.setAttribute('aria-expanded',String(state.expanded.has(card.id)));footer.appendChild(expand);article.appendChild(footer);item.appendChild(article);list.appendChild(item);
      }
      scroll.appendChild(list);panel.appendChild(scroll);shadow.appendChild(panel);scroll.scrollTop=scrollTop;
    };
    const floating=button('',()=>{});floating.className='float';floating.setAttribute('aria-label','打开小智加持');
    let drag:any=null;
    floating.onpointerdown=e=>{if(e.button!==0)return;drag={y:e.clientY,top:floating.getBoundingClientRect().top,moved:false};floating.setPointerCapture(e.pointerId);};
    floating.onpointermove=e=>{if(!drag)return;if(Math.abs(e.clientY-drag.y)>6)drag.moved=true;if(drag.moved)floating.style.top=`${Math.max(12,Math.min(innerHeight-100,drag.top+e.clientY-drag.y))}px`;};
    floating.onpointerup=()=>{if(!drag)return;if(!drag.moved){state.open=!state.open;renderPanel();}else localStorage.setItem('df-material-button-y',floating.style.top);drag=null;};
    floating.onpointercancel=()=>{drag=null;};floating.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();state.open=!state.open;renderPanel();}};
    const savedY=localStorage.getItem('df-material-button-y');if(savedY&&/^\d+px$/.test(savedY))floating.style.top=savedY;
    shadow.appendChild(floating);
    const closeModal = () => {state.modal?.mask.remove();state.modal=null;};
    const updateTarget = () => {
      const contact=readContact();if(state.modal&&!state.modal.busy){state.modal.target.textContent=`用于：${contact.title}${contact.id?'':'（尚未识别联系人）'}${state.modal.materialId&&used(state.modal.materialId)?' · 此素材已使用':''}`;state.modal.confirm.disabled=!contact.id;}
      if(contact.id!==state.lastContact){state.lastContact=contact.id;renderPanel();}
      floating.hidden=state.config?.showButton===false || !state.config?.enabled || !visible(composer());
    };
    const insertText = (text:string,contactId:string) => {
      const input=composer();if(!input || readContact().id!==contactId)return false;
      input.focus();const selection=getSelection();const range=document.createRange();range.selectNodeContents(input);range.collapse(false);selection?.removeAllRanges();selection?.addRange(range);
      const before=input.innerText||input.textContent||'';
      if(!document.execCommand('insertText',false,text))return false;
      input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:text}));
      const after=input.innerText||input.textContent||'';
      const normalizeLines=(value:string)=>value.replace(/\r\n?/g,'\n');
      return readContact().id===contactId && after!==before && normalizeLines(after).includes(normalizeLines(text));
    };
    const insertImage = async (pending:AssistantStagedMaterial,contactId:string) => {
      const input=composer();if(!input||readContact().id!==contactId||!pending.imageData)return false;
      const bytes=Uint8Array.from(atob(pending.imageData.split(',')[1]),c=>c.charCodeAt(0));
      const transfer=new DataTransfer();transfer.items.add(new File([bytes],pending.name||'素材.png',{type:'image/png'}));
      input.focus();
      const previewSelector=state.config.platform==='signal'?'.module-attachment-list,.module-attachment,.module-draft-attachment,.CompositionArea img[src^="blob:"]':state.config.platform==='telegram'?'.popup-send-photo,.popup-send-file,.media-container,.MediaPreview,.AttachmentModal':'[data-testid="media-editor"],[data-testid="media-caption-input-container"],div[role="dialog"] img[src^="blob:"]';
      const before=new Set(Array.from(document.querySelectorAll(previewSelector)));
      input.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));
      for(let i=0;i<30;i++){
        await new Promise(r=>setTimeout(r,100));
        if(readContact().id!==contactId)throw new Error('图片填入期间聊天已切换，请在目标会话检查草稿；未记录使用');
        if(Array.from(document.querySelectorAll(previewSelector)).some(n=>visible(n)&&!before.has(n)))return true;
      }
      return false;
    };
    const showModal = (pending:AssistantStagedMaterial) => {
      if(state.modal)return;const mask=node('div','mask'),dialog=node('section','dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','false');dialog.setAttribute('aria-label','确认使用素材');
      dialog.appendChild(node('h2','','确认使用素材'));const target=node('p','target');dialog.appendChild(target);
      let editor:HTMLTextAreaElement|null=null;
      if(pending.type==='text'){editor=node('textarea') as HTMLTextAreaElement;editor.value=pending.text||'';editor.maxLength=16000;editor.setAttribute('aria-label','修改素材文字');dialog.appendChild(editor);}
      else {const img=node('img') as HTMLImageElement;img.src=pending.imageData||'';img.alt=pending.name||'图片素材';dialog.appendChild(img);}
      dialog.appendChild(node('p','hint','确认后填入当前会话，标记为已使用，由你自行发送。切换聊天后，使用对象随当前会话更新。'));
      const error=node('p','error');error.setAttribute('role','alert');dialog.appendChild(error);
      const actions=node('div','actions');const cancel=button('取消',()=>{if(!state.modal.busy)closeModal();});
      const confirm=button('确认使用',()=>{void (async()=>{
        const modal=state.modal;if(!modal||modal.busy)return;
        const contact=readContact();if(!contact.id){error.textContent='无法可靠识别当前联系人';return;}
        const text=editor?.value||'';if(pending.type==='text'&&!text.trim()){error.textContent='请填写文字';return;}
        modal.busy=true;confirm.disabled=true;cancel.disabled=true;error.textContent='';
        try {
          if(pending.expiresAt<Date.now())throw new Error('复制已过期，请重新复制');
          const inserted=pending.type==='text'?insertText(text,contact.id):await insertImage(pending,contact.id);
          if(!inserted)throw new Error('未确认素材已进入输入框，请检查聊天草稿后重试；未记录使用');
          // Keep the target captured at successful insertion, even if the UI changes while persistence finishes.
          modal.inserted=true;modal.token=pending.token;
          state.queue.push({action:'used',token:pending.token,contactId:contact.id,contactTitle:contact.title,...(pending.type==='text'?{actualText:text}:{})});
          confirm.textContent='保存使用记录…';
        } catch(e){error.textContent=e instanceof Error?e.message:String(e);modal.busy=false;confirm.disabled=false;cancel.disabled=false;}
      })();});confirm.className='primary';actions.append(cancel,confirm);dialog.appendChild(actions);mask.appendChild(dialog);shadow.appendChild(mask);
      state.modal={mask,target,confirm,cancel,error,editor,materialId:pending.id,busy:false};updateTarget();editor?.focus();
    };
    const onPaste = (event:ClipboardEvent) => {
      const pending=state.pending;if(!pending||state.consumed.has(pending.token)||pending.expiresAt<Date.now()||!state.config?.enabled||!event.isTrusted)return;
      const input=composer();if(!input || !(event.target instanceof Node) || !(input===event.target||input.contains(event.target)))return;
      if(pending.type==='text'){
        if(event.clipboardData?.getData('text/plain').replace(/\r\n?/g,'\n')!==pending.text?.replace(/\r\n?/g,'\n'))return;
        event.preventDefault();event.stopImmediatePropagation();showModal(pending);
      } else {
        const file=Array.from(event.clipboardData?.files||[]).find(f=>f.type.startsWith('image/'));if(!file)return;
        event.preventDefault();event.stopImmediatePropagation();
        const replayTarget=input;
        // Chromium can re-encode a clipboard PNG. Compare decoded pixels rather
        // than file bytes, so ordinary images still bypass the material dialog.
        const pixelHash=async(blob:Blob)=>{const image=await createImageBitmap(blob);try{
          const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
          const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
          const pixels=context.getImageData(0,0,image.width,image.height).data;
          const digest=await crypto.subtle.digest('SHA-256',pixels);
          return `${image.width}x${image.height}:`+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        }finally{image.close();}};
        const referenceBytes=Uint8Array.from(atob((pending.imageData||'').split(',')[1]||''),c=>c.charCodeAt(0));
        void Promise.all([pixelHash(file),pixelHash(new Blob([referenceBytes],{type:'image/png'}))]).then(([actual,expected])=>{
          if(actual===expected)showModal(pending);
          else {const transfer=new DataTransfer();transfer.items.add(file);replayTarget.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));}
        }).catch(()=>toast('无法识别剪贴板图片，请重新复制'));
      }
    };
    document.addEventListener('paste',onPaste,true);
    const timer=setInterval(updateTarget,200);
    state.apply = (cmd:Command) => {
      if(cmd.command==='install'){
        const previous=JSON.stringify(state.config?.catalog);state.config=cmd.config;
        for(const [key,value]of Object.entries(cmd.config.colors))root.style.setProperty(key,value);
        const image=document.createElement('img');image.src=cmd.config.icon;image.alt='';floating.replaceChildren(image,node('span','','小智加持'));
        if(!cmd.config.enabled){state.open=false;state.pending=null;closeModal();}
        if(previous!==JSON.stringify(cmd.config.catalog)||state.open)renderPanel();updateTarget();return true;
      }
      if(cmd.command==='stage'){
        if(cmd.pending&&state.consumed.has(cmd.pending.token))return true;
        state.pending=cmd.pending?{...cmd.pending,imageData:cmd.pending.imageData||state.images?.[cmd.pending.mediaId!]}:null;
        if(cmd.pending?.type==='image'&&cmd.pending.imageData){state.images ||= {};state.images[cmd.pending.mediaId!]=cmd.pending.imageData;renderPanel();}
        if(cmd.pending)toast('已复制，粘贴到聊天输入框后确认使用');return true;
      }
      if(cmd.command==='image-chunk'){
        state.imageChunks ||= {};if(cmd.start)state.imageChunks[cmd.id]='';
        state.imageChunks[cmd.id]=(state.imageChunks[cmd.id]||'')+cmd.chunk;
        if(cmd.end){state.images ||= {};state.images[cmd.id]=state.imageChunks[cmd.id];delete state.imageChunks[cmd.id];renderPanel();}
        return true;
      }
      if(cmd.command==='result'){
        if(cmd.usage){state.config.usages=state.config.usages.filter((u:AssistantUsage)=>!(u.contactId===cmd.usage!.contactId&&u.materialId===cmd.usage!.materialId));state.config.usages.push(cmd.usage);state.consumed.add(cmd.token);if(state.pending?.token===cmd.token)state.pending=null;closeModal();renderPanel();toast('已填入当前会话并标记为已使用');}
        else if(cmd.error){
          if(state.modal?.token===cmd.token){state.modal.error.textContent=`素材已填入，使用记录保存失败：${cmd.error}`;state.modal.busy=false;state.modal.cancel.disabled=false;
            // Retrying persistence must never insert the material a second time.
            state.modal.confirm.textContent='重试保存记录';state.modal.confirm.disabled=false;
            state.modal.confirm.onclick=()=>{state.modal.busy=true;state.modal.confirm.disabled=true;state.queue.push(state.lastUse);};
          } else toast(cmd.error);
        }
        return true;
      }
      const events=state.queue.splice(0,20);const lastUse=[...events].reverse().find((e:AssistantRuntimeEvent)=>e.action==='used');if(lastUse)state.lastUse=lastUse;
      return {events,contact:readContact()};
    };
    state.dispose=()=>{clearInterval(timer);document.removeEventListener('paste',onPaste,true);root.remove();};
    w.__dfMaterialRuntime=state;
  }
  return w.__dfMaterialRuntime.apply(command);
}
export function buildAssistantRuntimeScript(command:Command) {
  if(command.command!=='install')return `window.__dfMaterialRuntime?.apply(${JSON.stringify(command)})`;
  const source=assistantRuntime.toString();let version=2166136261;
  for(let i=0;i<source.length;i++)version=Math.imul(version^source.charCodeAt(i),16777619);
  return `(()=>{const fresh=window.__dfMaterialRuntime?.version!==${version};if(fresh){window.__dfMaterialRuntime?.dispose();delete window.__dfMaterialRuntime;}(${source})(${JSON.stringify(command)});window.__dfMaterialRuntime.version=${version};return {fresh};})()`;
}

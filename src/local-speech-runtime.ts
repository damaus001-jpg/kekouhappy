export type LocalSpeechPlatform = 'whatsapp' | 'telegram' | 'signal';

export function buildVoiceConversationSignatureScript(platform: LocalSpeechPlatform) {
  return `(()=>{const p=${JSON.stringify(platform)};if(p==='signal')return document.querySelector('.CompositionArea[data-df-signal-conversation-id]')?.getAttribute('data-df-signal-conversation-id')||'';const h=(document.querySelector('header')?.innerText||document.querySelector('header')?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,180);return location.href+'|'+h;})()`;
}

export function buildVoiceMessageActionButtonStateScript(key: string, label: string, busy: boolean) {
  return `(()=>{const key=${JSON.stringify(key)},label=${JSON.stringify(label)},busy=${JSON.stringify(busy)};const row=Array.from(document.querySelectorAll('.df-voice-action-row')).find(el=>el.dataset.dfVoiceKey===key);const button=row?.querySelector('button');if(!button)return false;button.textContent=label;button.disabled=busy;return true;})()`;
}

export function buildVoiceMessageScanScript(platform: LocalSpeechPlatform) {
  return `
(() => {
  const platform = ${JSON.stringify(platform)};
  const visible = el => { const r=el.getBoundingClientRect(),s=getComputedStyle(el); return r.width>12&&r.height>8&&s.display!=='none'&&s.visibility!=='hidden'; };
  const hash = value => { let h=2166136261; for(const c of String(value||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);} return (h>>>0).toString(36); };
  const signature=platform==='signal'?document.querySelector('.CompositionArea[data-df-signal-conversation-id]')?.getAttribute('data-df-signal-conversation-id')||'':location.href+'|'+String(document.querySelector('header')?.innerText||document.querySelector('header')?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,180);
  if(!signature)return [];
  const bubbleFor = audio => platform==='signal'
    ? (audio.closest('[class*="module-message__wrapper"]')||audio.closest('[class*="module-message"]')?.parentElement||audio.closest('[class*="module-message"]'))
    : platform==='telegram'
      ? audio.closest('.bubble[data-mid], .bubble, .bubble-content-wrapper, .Message')
      : audio.closest('[data-testid="msg-container"], [data-pre-plain-text], [data-id^="true_"], [data-id^="false_"], .message-in, .message-out');
  const audioNodes = Array.from(document.querySelectorAll(platform==='signal'?'.module-message__audio-attachment':'audio, [data-testid*="voice"] audio, [class*="voice"] audio')).reverse();
  const found=[];
  for(const audio of audioNodes){
    const bubble=bubbleFor(audio);
    if(!bubble||!visible(bubble)||bubble.closest('footer,header,nav,aside,[contenteditable="true"]'))continue;
    const next=bubble.nextElementSibling;
    if(next?.classList.contains('df-chat-translation')&&next.dataset.dfVoiceTranslationKey===bubble.dataset.dfVoiceKey)continue;
    const media=audio.matches('audio')?audio:audio.querySelector('audio');
    const source=audio.getAttribute('data-df-audio-url')||media?.currentSrc||media?.src||media?.querySelector('source[src]')?.src||media?.querySelector('source[src]')?.getAttribute('src')||'';
    if(audio.closest('video'))continue;
    const identity=audio.getAttribute('data-df-audio-message-id')||bubble.getAttribute('data-mid')||bubble.getAttribute('data-message-id')||bubble.id||source||String(found.length);
    const key=bubble.dataset.dfVoiceKey||('df-voice-'+hash(identity+'|'+signature));
    bubble.dataset.dfVoiceKey=key;
    bubble.dataset.dfMsgKey=key;
    const directionNode=bubble.matches('.module-message__container--incoming,.module-message__container--outgoing,.module-message--incoming,.module-message--outgoing')?bubble:(bubble.querySelector('.module-message__container--incoming,.module-message__container--outgoing,.module-message--incoming,.module-message--outgoing')||bubble.closest('.module-message__container--incoming,.module-message__container--outgoing,.module-message--incoming,.module-message--outgoing')||bubble);
    const classText=String(bubble.className||'')+' '+String(directionNode.className||'');
    const explicit=String(bubble.getAttribute('data-id')||'')+' '+classText;
    const direction=/message-out|outgoing|is-out|from-me|sent/i.test(explicit)?'outgoing':/message-in|incoming|is-in|from-them|received/i.test(explicit)?'incoming':(bubble.getBoundingClientRect().left+bubble.getBoundingClientRect().width/2>innerWidth/2?'outgoing':'incoming');
    if(direction!=='incoming'){Array.from(bubble.querySelectorAll('.df-voice-action-row')).find(row=>row.dataset.dfVoiceKey===key)?.remove();continue;}
    let voiceControls=platform==='signal'?Array.from(bubble.querySelectorAll('.df-voice-controls')).find(row=>row.dataset.dfVoiceControlsKey===key):null;
    let actionRow=Array.from(bubble.querySelectorAll('.df-voice-action-row')).find(row=>row.dataset.dfVoiceKey===key);
    if(platform==='signal'&&!voiceControls){
      voiceControls=document.createElement('div');voiceControls.className='df-voice-controls';voiceControls.dataset.dfVoiceControlsKey=key;
      voiceControls.style.cssText='display:flex;flex-direction:column;align-items:flex-start;align-self:stretch;width:100%;max-width:100%;margin:4px 0 0;pointer-events:auto';
    }
    if(actionRow){
      actionRow.style.justifyContent='flex-start';
      if(platform==='signal'){
        actionRow.style.margin='0';
        if(actionRow.parentElement!==voiceControls)voiceControls.appendChild(actionRow);
      }
    }
    if(!actionRow){
      actionRow=document.createElement('div');actionRow.className='df-voice-action-row';actionRow.dataset.dfVoiceKey=key;
      actionRow.style.cssText='display:flex;justify-content:flex-start;margin:'+(platform==='signal'?'0':'3px 10px 6px')+';pointer-events:auto';
      const button=document.createElement('button');button.type='button';button.textContent='翻译';button.title='下载并识别这条语音，然后显示译文';
      button.style.cssText='appearance:none;border:1px solid rgba(181,130,35,.72);border-radius:6px;background:rgba(181,130,35,.12);color:inherit;padding:3px 12px;font:inherit;font-size:12px;line-height:1.5;cursor:pointer';
      let lastClick=0;button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(button.disabled||Date.now()-lastClick<600)return;lastClick=Date.now();button.disabled=true;button.textContent='正在识别语音';window.__dfTranslatorQueue=Array.isArray(window.__dfTranslatorQueue)?window.__dfTranslatorQueue:[];window.__dfTranslatorQueue.push({action:'voice-translate',text:JSON.stringify({key,conversationSignature:signature}),conversationSignature:signature,at:Date.now()});});
      actionRow.appendChild(button);
      if(platform==='signal')voiceControls.appendChild(actionRow);else bubble.insertAdjacentElement('afterend',actionRow);
    }
    if(platform==='signal'&&voiceControls.parentElement!==audio)audio.appendChild(voiceControls);
    const rect=bubble.getBoundingClientRect();let scroller=bubble.parentElement;
    while(scroller&&scroller!==document.body){const style=getComputedStyle(scroller);if(/(auto|scroll|overlay)/.test(style.overflowY)&&scroller.scrollHeight>scroller.clientHeight+40)break;scroller=scroller.parentElement;}
    const nearEnd=!scroller||scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<=Math.max(160,scroller.clientHeight*0.18);
    found.push({key,text:bubble.dataset.dfVoiceTranscript||'',voiceMessage:true,direction,contactId:'',contactIdType:'unknown',conversationSignature:signature,rectTop:Math.round(rect.top),rectBottom:Math.round(rect.bottom),viewportHeight:Math.round(innerHeight),scanBand:'visible',nearConversationEnd:nearEnd,nearConversationStart:false});
  }
  return found;
})()`;
}

export function buildVoiceMessageAudioChunkScript(
  platform: LocalSpeechPlatform,
  key: string,
  action: 'prepare' | 'chunk' | 'clear',
  offset = 0,
  chunkSize = 240 * 1024,
  expectedSignature = ''
) {
  return `
(async()=>{
  const platform=${JSON.stringify(platform)},key=${JSON.stringify(key)},action=${JSON.stringify(action)},expected=${JSON.stringify(expectedSignature)};
  const state=window.__dfLocalSpeechAudio||(window.__dfLocalSpeechAudio=Object.create(null));
  if(action==='clear'){delete state[key];return true;}
  const signature=()=>platform==='signal'?document.querySelector('.CompositionArea[data-df-signal-conversation-id]')?.getAttribute('data-df-signal-conversation-id')||'':location.href+'|'+String(document.querySelector('header')?.innerText||document.querySelector('header')?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,180);
  if(expected&&signature()!==expected)return {ok:false,error:'会话已切换，语音识别已取消'};
  const offset=${Math.max(0, Math.floor(offset))},chunkSize=${Math.max(16 * 1024, Math.min(256 * 1024, Math.floor(chunkSize)))};
  if(action==='chunk')return state[key]&&state[key].signature===expected?{ok:true,totalChars:state[key].audio.length,chunk:state[key].audio.slice(offset,offset+chunkSize)}:{ok:false,error:'会话已切换或语音数据已失效'};
  const bubble=Array.from(document.querySelectorAll('[data-df-voice-key]')).find(el=>el.dataset.dfVoiceKey===key);
  const signalAudio=bubble?.querySelector('.module-message__audio-attachment');
  const audio=bubble?.querySelector('audio');
  let src=signalAudio?.getAttribute('data-df-audio-url')||audio?.currentSrc||audio?.src||audio?.querySelector('source[src]')?.src||audio?.querySelector('source[src]')?.getAttribute('src')||'';
  if(!src&&platform==='signal'&&signalAudio){
    const downloadButton=signalAudio.querySelector('button');
    const buttonClass=String(downloadButton?.className||'');
    if(downloadButton&&!/downloading|pending|computing/i.test(buttonClass))downloadButton.click();
    for(let attempt=0;attempt<60&&!src;attempt++){
      await new Promise(resolve=>setTimeout(resolve,250));
      if(expected&&signature()!==expected)throw new Error('会话已切换，语音识别已取消');
      src=signalAudio.getAttribute('data-df-audio-url')||'';
    }
  }
  if(!src)return {ok:false,error:platform==='signal'?'Signal 尚未下载这条语音；请稍后重试':'当前平台没有提供可读取的语音附件'};
  try{
    const response=await fetch(src,{credentials:'include'});
    if(!response.ok)throw new Error('语音附件读取失败');
    const encoded=await response.arrayBuffer();
    if(encoded.byteLength>32*1024*1024)throw new Error('语音附件超过32MiB');
    let binary='';const bytes=new Uint8Array(encoded);for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+32768,bytes.length)));
    if(expected&&signature()!==expected)throw new Error('会话已切换，语音识别已取消');
    state[key]={audio:btoa(binary),signature:expected||signature()};
    return {ok:true,totalChars:state[key].audio.length,chunk:state[key].audio.slice(0,chunkSize)};
  }catch(error){return {ok:false,error:error instanceof Error?error.message:'语音附件下载失败'};}
})()`;
}

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { AssistantKind, AssistantLibrary, AssistantEntry, AssistantMedia } from '../../electron/assistant-library-types';
import { assistantLabels, emptyAssistantLibrary } from '../../electron/assistant-library-types';
import type { AssistantCard, AssistantCatalog, AssistantMaterial } from '../../electron/assistant-material-types';
import { buildAssistantCard, buildAssistantCatalog } from '../assistant-material-catalog';
import icon from '../assets/xiaozhi-assistant-transparent.png';
import ConversationExportControl from './ConversationExportControl.vue';
import type { ConversationExportMode } from '../../electron/conversation-export-types';

const props = defineProps<{open:boolean;workspace:boolean;collapsed:boolean;usedIds?:string[];copyBusy?:boolean;copyStatus?:string;contactTitle?:string;exportBusy?:boolean;exportStatus?:string}>();
const emit = defineEmits<{'update:open':[value:boolean];copy:[request:{material:AssistantMaterial;cardTitle:string}];changed:[];export:[mode:ConversationExportMode];cancelExport:[]}>();
const library=ref<AssistantLibrary>(emptyAssistantLibrary());
const catalog=ref<AssistantCatalog>({persona:[],schedule:[],quotes:[]});
const kind=ref<AssistantKind>('persona');
const busy=ref(false),error=ref(''),notice=ref(''),search=ref('');
const personaDraft=ref(''),personaEditing=ref(true);
const draft=ref<AssistantEntry|null>(null);
const expanded=ref(new Set<string>());
const draggedCardId=ref<string|null>(null);
const expandedStorageKey='assistant-card-expanded-v1';
const textUpload=ref<HTMLInputElement|null>(null);
const titleInput=ref<HTMLInputElement|null>(null);
const preview=ref<AssistantMedia|null>(null);
const module=computed(()=>library.value.modules[kind.value]);
const cards=computed(()=>kind.value==='persona'?[]:catalog.value[kind.value].filter(c=>`${c.title} ${c.materials.map(m=>m.text||m.name||'').join(' ')}`.toLowerCase().includes(search.value.toLowerCase())));
const panelTop=computed(()=>props.workspace&&!props.collapsed?'112px':'8px');
const buttonY=ref(Math.min(window.innerHeight-100,Math.max(120,Number(localStorage.getItem('assistant-button-y'))||window.innerHeight*.55)));
const exportButtonTop=computed(()=>Math.min(buttonY.value+100,window.innerHeight-60));
let drag:{y:number;initial:number;moved:boolean}|null=null;
function pointerDown(e:PointerEvent){if(e.button!==0)return;drag={y:e.clientY,initial:buttonY.value,moved:false};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}
function pointerMove(e:PointerEvent){if(!drag)return;if(Math.abs(e.clientY-drag.y)>6)drag.moved=true;if(drag.moved)buttonY.value=Math.max(12,Math.min(window.innerHeight-100,drag.initial+e.clientY-drag.y));}
function pointerUp(){if(!drag)return;if(!drag.moved)emit('update:open',!props.open);localStorage.setItem('assistant-button-y',String(buttonY.value));drag=null;}
async function replace(value:AssistantLibrary,refresh?:{kind:'schedule'|'quotes';id:string}){
  library.value=value;
  if(refresh){
    const entry=value.modules[refresh.kind].entries.find(item=>item.id===refresh.id);
    const cards=[...catalog.value[refresh.kind]];
    const index=cards.findIndex(card=>card.id===refresh.id);
    if(entry){const card=await buildAssistantCard(refresh.kind,entry);if(index<0)cards.push(card);else cards[index]=card;}
    else if(index>=0)cards.splice(index,1);
    catalog.value={...catalog.value,[refresh.kind]:cards};
  }else catalog.value=await buildAssistantCatalog(value);
  if(!refresh&&kind.value!=='persona')restoreExpanded(kind.value);
  personaDraft.value=value.modules.persona.text;
}
async function run(task:()=>Promise<void>){if(busy.value)return;busy.value=true;error.value='';notice.value='';try{await task();}catch(e){error.value=e instanceof Error?e.message:String(e);}finally{busy.value=false;}}
async function load(){await run(async()=>{await replace(await window.chatTranslator.getAssistantLibrary());personaEditing.value=!personaDraft.value.trim();});}
function changed(){emit('changed');}
function canLeave(){return !(draft.value||(personaEditing.value&&personaDraft.value!==library.value.modules.persona.text))||window.confirm('有未保存的修改，是否放弃这些修改？');}
function switchKind(next:AssistantKind){if(next===kind.value||busy.value||!canLeave())return;draft.value=null;personaDraft.value=library.value.modules.persona.text;kind.value=next;if(next!=='persona')restoreExpanded(next);search.value='';error.value='';notice.value='';preview.value=null;}
function close(){if(!busy.value&&canLeave()){draft.value=null;personaDraft.value=library.value.modules.persona.text;emit('update:open',false);}}
async function focusTitle(select=false){await nextTick();titleInput.value?.focus();if(select)titleInput.value?.select();}
function newCard(){if(!canLeave())return;draft.value={id:crypto.randomUUID(),title:'',text:'',date:'',timeZone:'America/Los_Angeles',status:'planned',tags:[],media:[]};void focusTitle();}
function editCard(id:string){if(!canLeave())return;const entry=module.value.entries.find(e=>e.id===id);if(entry){draft.value=structuredClone(JSON.parse(JSON.stringify(entry)));void focusTitle(true);}}
async function persistDraft(){
  if(!draft.value||kind.value==='persona')return;
  if(!draft.value.title.trim())throw new Error('请填写卡片名称');
  const value=JSON.parse(JSON.stringify(module.value));
  const entry=JSON.parse(JSON.stringify(draft.value));
  const index=value.entries.findIndex((e:AssistantEntry)=>e.id===entry.id);
  if(index<0)value.entries.push(entry);else value.entries[index]=entry;
  value.version=new Date().toISOString();
  const savedKind=kind.value as 'schedule'|'quotes';
  await replace(await window.chatTranslator.saveAssistantModule(savedKind,value),{kind:savedKind,id:entry.id});
  changed();
}
async function saveCard(){await run(async()=>{const id=draft.value?.id;const savedKind=kind.value;await persistDraft();draft.value=null;if(id){expanded.value.add(id);persistExpanded(savedKind,expanded.value);}notice.value='卡片已保存到本机';});}
async function savePersona(){await run(async()=>{const value=JSON.parse(JSON.stringify(library.value.modules.persona));value.text=personaDraft.value;value.version=new Date().toISOString();await replace(await window.chatTranslator.saveAssistantModule('persona',value));personaEditing.value=false;changed();notice.value='人物资料已保存';});}
async function attach(){await run(async()=>{await persistDraft();if(!draft.value)return;const id=draft.value.id;const savedKind=kind.value as 'schedule'|'quotes';const value=await window.chatTranslator.attachAssistantMedia(savedKind,id);if(value){await replace(value,{kind:savedKind,id});draft.value=JSON.parse(JSON.stringify(value.modules[savedKind].entries.find(e=>e.id===id)));changed();notice.value='图片已上传到这张卡片';}});}
async function importText(e:Event){const input=e.target as HTMLInputElement;const file=input.files?.[0];if(!file||!draft.value)return;await run(async()=>{if(file.size>128000)throw new Error('文字文件过大，请保留在16,000字以内');const value=(await file.text()).replace(/^\uFEFF/,'');if(value.length>16000)throw new Error('卡片文字最多16,000字');draft.value!.text=value;notice.value='文字已载入，请保存卡片';});input.value='';}
async function removeCard(id:string){if(!window.confirm('删除这张卡片？'))return;await run(async()=>{const savedKind=kind.value as 'schedule'|'quotes';const value=JSON.parse(JSON.stringify(module.value));value.entries=value.entries.filter((e:AssistantEntry)=>e.id!==id);await replace(await window.chatTranslator.saveAssistantModule(savedKind,value),{kind:savedKind,id});if(draft.value?.id===id)draft.value=null;const next=new Set(expanded.value);next.delete(id);expanded.value=next;persistExpanded(savedKind,next);changed();notice.value='卡片已删除';});}
function readExpandedState():Record<string,string[]>{try{const value=JSON.parse(localStorage.getItem(expandedStorageKey)||'{}');return value&&typeof value==='object'?value:{ };}catch{return {};}}
function persistExpanded(kindToSave:AssistantKind,ids:Set<string>){if(kindToSave==='persona')return;try{const state=readExpandedState();state[kindToSave]=[...ids];localStorage.setItem(expandedStorageKey,JSON.stringify(state));}catch{}}
function restoreExpanded(kindToLoad:'schedule'|'quotes'){const state=readExpandedState();const allowed=new Set(library.value.modules[kindToLoad].entries.map(entry=>entry.id));expanded.value=new Set((Array.isArray(state[kindToLoad])?state[kindToLoad]:[]).filter(id=>allowed.has(id)));}
function toggle(id:string){const next=new Set(expanded.value);next.has(id)?next.delete(id):next.add(id);expanded.value=next;persistExpanded(kind.value,next);}
function startCardDrag(event:DragEvent,id:string){if(busy.value){event.preventDefault();return;}draggedCardId.value=id;if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);}}
function clearCardDrag(){draggedCardId.value=null;}
async function dropCard(event:DragEvent,targetId:string){
  event.preventDefault();
  const sourceId=draggedCardId.value||event.dataTransfer?.getData('text/plain');
  draggedCardId.value=null;
  if(!sourceId||sourceId===targetId||busy.value||kind.value==='persona')return;
  await run(async()=>{
    const savedKind=kind.value as 'schedule'|'quotes';
    const value=JSON.parse(JSON.stringify(module.value));
    const visibleIds=new Set(cards.value.map(card=>card.id));if(!visibleIds.has(sourceId)||!visibleIds.has(targetId))return;
    const slots:number[]=[];const visibleEntries:AssistantEntry[]=[];
    value.entries.forEach((entry:AssistantEntry,index:number)=>{if(visibleIds.has(entry.id)){slots.push(index);visibleEntries.push(entry);}});
    const from=visibleEntries.findIndex(entry=>entry.id===sourceId),to=visibleEntries.findIndex(entry=>entry.id===targetId);if(from<0||to<0)return;
    const [entry]=visibleEntries.splice(from,1);visibleEntries.splice(to,0,entry);slots.forEach((slot,index)=>value.entries[slot]=visibleEntries[index]);value.version=new Date().toISOString();
    const saved=await window.chatTranslator.saveAssistantModule(savedKind,value);
    library.value=saved;const byId=new Map<string,AssistantCard>(catalog.value[savedKind].map((card:AssistantCard)=>[card.id,card]));catalog.value={...catalog.value,[savedKind]:value.entries.map((item:AssistantEntry)=>byId.get(item.id)).filter((card:AssistantCard|undefined):card is AssistantCard=>!!card)};
    changed();notice.value='卡片顺序已保存到本机';
  });
}
const used=(id:string)=>props.usedIds?.includes(id)||false;
function copy(material:AssistantMaterial,cardTitle:string){if(!busy.value&&!props.copyBusy)emit('copy',{material:JSON.parse(JSON.stringify(material)),cardTitle});}
watch(()=>props.open,value=>{if(value&&!draft.value)void load();if(!value)preview.value=null;});
onMounted(load);
</script>

<template>
  <div class="assistant-library-root">
    <button v-if="!open" class="xiaozhi-float" type="button" :style="{top:`${buttonY}px`}" aria-label="打开小智加持" title="小智加持 · 拖动调整位置"
      @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="drag=null" @keydown.enter.prevent="emit('update:open',true)" @keydown.space.prevent="emit('update:open',true)">
      <img :src="icon" alt="" draggable="false"><span>小智加持</span>
    </button>
    <ConversationExportControl v-if="workspace&&!open" floating :top="exportButtonTop" :busy="!!exportBusy" :status="exportStatus||''" @export="emit('export',$event)" @cancel="emit('cancelExport')" />
    <aside v-if="open" class="assistant-library-panel" :style="{top:panelTop}" aria-label="小智加持资料助手">
      <header class="assistant-library-heading"><img :src="icon" alt=""><div><strong>小智加持</strong><small>自定义资料 · {{contactTitle||'当前会话'}}</small></div>
        <ConversationExportControl v-if="workspace" :busy="!!exportBusy" :status="exportStatus||''" @export="emit('export',$event)" @cancel="emit('cancelExport')" />
        <button type="button" :disabled="busy" aria-label="关闭资料助手" @click="close">×</button>
      </header>
      <nav class="assistant-library-tabs" aria-label="资料模块"><button v-for="(label,key) in assistantLabels" :key="key" type="button" :disabled="busy" :class="{active:kind===key}" @click="switchKind(key)">{{label}}</button></nav>
      <p v-if="error" class="assistant-feedback error" role="alert">{{error}}</p>
      <p v-if="notice" class="assistant-feedback" role="status">{{notice}}</p>
      <p v-if="copyStatus&&kind!=='persona'" class="assistant-feedback" role="status">{{copyStatus}}</p>
      <div class="assistant-library-scroll">
        <section v-if="kind==='persona'" class="assistant-persona-custom">
          <p class="assistant-hint">粘贴完整人物资料并保存。查看时可选中文字自行复制。</p>
          <template v-if="personaEditing"><label class="assistant-field">人物资料<textarea v-model="personaDraft" rows="20" maxlength="256000" placeholder="在这里粘贴你的人物资料…" :disabled="busy"></textarea></label>
            <button class="primary" :disabled="busy" @click="savePersona">保存资料</button></template>
          <template v-else><button :disabled="busy" @click="personaEditing=true">编辑资料</button><pre class="assistant-persona-text">{{library.modules.persona.text||'尚未填写人物资料'}}</pre></template>
        </section>
        <template v-else>
          <div class="assistant-entry-actions"><input v-model="search" placeholder="搜索卡片" aria-label="搜索卡片"><button :disabled="busy" class="primary" @click="newCard">新建卡片</button></div>
          <p class="assistant-hint">点击发送，确认后粘贴到聊天输入框并记录使用；最终发送由你完成。同一照片重复使用时会提醒。</p>
          <section v-if="draft" class="assistant-custom-editor" aria-label="编辑自定义卡片">
            <label class="assistant-field">卡片名称<input ref="titleInput" v-model="draft.title" maxlength="200" placeholder="例如：周五晚餐 / 轻松聊天" :disabled="busy"></label>
            <label class="assistant-field">卡片文字<textarea v-model="draft.text" rows="6" maxlength="16000" placeholder="输入或粘贴卡片文字，也可以导入文字文件" :disabled="busy"></textarea></label>
            <input ref="textUpload" hidden type="file" accept=".txt,.md,text/plain,text/markdown" @change="importText">
            <div class="assistant-entry-actions"><button :disabled="busy" @click="textUpload?.click()">导入文字</button><button :disabled="busy" @click="attach">上传图片</button></div>
            <div class="assistant-media-grid"><article v-for="media in draft.media.filter(m=>m.mime.startsWith('image/'))" :key="media.id" class="assistant-media-card"><img :src="`app://assistant-media/${media.id}`" :alt="media.name"><small>{{media.name}}</small><button :disabled="busy" @click="draft.media=draft.media.filter(m=>m.id!==media.id)">移除图片</button></article></div>
            <div class="assistant-entry-actions"><button class="primary" :disabled="busy" @click="saveCard">{{busy?'保存中…':'保存卡片'}}</button><button :disabled="busy" @click="draft=null">取消编辑</button></div>
          </section>
          <p v-if="!cards.length" class="assistant-empty">{{search?'没有匹配的卡片':'暂无卡片，点击“新建卡片”添加自己的文字和图片。'}}</p>
          <article v-for="card in cards" :key="card.id" class="assistant-custom-card" :class="{'assistant-card-dragging':draggedCardId===card.id}" @dragover.prevent @drop="dropCard($event,card.id)">
            <header class="assistant-card-header"><div class="assistant-card-heading"><button class="assistant-card-drag-handle" type="button" :draggable="!busy" :disabled="busy" aria-label="拖动卡片排序" title="按住拖动排序" @dragstart.stop="startCardDrag($event,card.id)" @dragend="clearCardDrag">⠿</button><div><h3>{{card.title}}</h3><small v-if="kind!=='schedule'&&card.date">{{card.date}}</small></div></div><div class="assistant-card-controls"><div v-if="card.materials.length" class="assistant-card-send-actions"><button v-for="(material,index) in card.materials" :key="material.id" :disabled="busy||copyBusy" :aria-label="`${used(material.id)?'已使用，':''}${material.type==='text'?'发送文字':`发送图片 ${card.materials.slice(0,index).filter(item=>item.type==='image').length+1}`}`" :title="material.type==='image'?(material.name||'发送此图片'): '发送卡片文字'" @click="copy(material,card.title)">{{used(material.id)?'已使用 · ':''}}{{material.type==='text'?'发送文字':`发送图片 ${card.materials.slice(0,index).filter(item=>item.type==='image').length+1}`}}</button></div><button :aria-expanded="expanded.has(card.id)" @click="toggle(card.id)">{{expanded.has(card.id)?'收起':'展开'}}</button></div></header>
            <div v-if="expanded.has(card.id)" class="assistant-card-materials">
              <p v-if="!card.materials.length" class="assistant-empty">这张卡片还没有文字或图片</p>
              <section v-for="material in card.materials" :key="material.id" class="assistant-card-material">
                <p v-if="material.type==='text'" class="assistant-card-text">{{material.text}}</p>
                <button v-else class="assistant-image-preview" @click="preview={id:material.mediaId!,name:material.name||'图片',mime:'image/png',caption:''}"><img :src="`app://assistant-media/${material.mediaId}`" :alt="material.name" loading="lazy"></button>
                <div class="assistant-material-actions"><small :class="{'material-used':used(material.id)}">{{used(material.id)?'当前会话已使用':'当前会话未使用'}}</small></div>
              </section>
            </div>
            <footer><span>{{card.materials.filter(m=>m.type==='image').length}} 张图片</span><button :disabled="busy" @click="editCard(card.id)">编辑</button><button :disabled="busy" @click="removeCard(card.id)">删除</button></footer>
          </article>
        </template>
      </div>
      <div v-if="preview" class="assistant-media-viewer"><button aria-label="关闭图片预览" @click="preview=null">×</button><img :src="`app://assistant-media/${preview.id}`" :alt="preview.name"><p>{{preview.name}}</p></div>
    </aside>
  </div>
</template>

<style>
.xiaozhi-float{position:fixed;right:12px;width:64px;height:96px;z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;border:0;background:transparent;color:var(--accent-bright);cursor:grab;touch-action:none;-webkit-app-region:no-drag}.xiaozhi-float img{height:76px;width:58px;object-fit:contain;filter:drop-shadow(0 3px 5px #0006);pointer-events:none}.xiaozhi-float span{font-size:11px;background:var(--panel-strong);border:1px solid var(--line);border-radius:8px;padding:2px 4px;white-space:nowrap}.xiaozhi-float:focus-visible{outline:2px solid var(--accent)}
.assistant-library-panel{position:fixed;right:8px;bottom:8px;width:min(472px,calc(100vw - 136px));z-index:90;display:flex;flex-direction:column;overflow:hidden;background:var(--panel-strong);color:var(--text);border:1px solid var(--line-strong);border-radius:18px;box-shadow:var(--shadow);-webkit-app-region:no-drag}.assistant-library-heading{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}.assistant-library-heading>img{height:50px;width:40px;object-fit:contain}.assistant-library-heading>div{flex:1;min-width:0}.assistant-library-heading strong{font-size:18px;color:var(--accent-bright)}.assistant-library-heading small{display:block;margin-top:5px;color:var(--muted);font-size:11px;overflow-wrap:anywhere}
.assistant-library-panel button{border:1px solid var(--line);border-radius:8px;padding:7px 10px;color:var(--text);background:var(--panel-muted);cursor:pointer;font-size:12px}.assistant-library-panel button:hover:not(:disabled),.assistant-library-panel button.active{border-color:var(--accent);color:var(--accent-bright)}.assistant-library-panel button:disabled{opacity:.5;cursor:wait}.assistant-library-panel button.primary{background:var(--accent);color:var(--bg);font-weight:700}.assistant-library-tabs{display:flex;gap:6px;padding:10px 12px}.assistant-library-tabs button{flex:1}.assistant-library-scroll{overflow-y:auto;flex:1;padding:10px 16px 24px;min-height:0}
.assistant-field{display:flex;flex-direction:column;gap:6px;margin:10px 0;font-size:12px;color:var(--muted-strong)}.assistant-library-panel input:not([type=checkbox]):not([type=file]),.assistant-library-panel textarea{width:100%;border:1px solid var(--line);border-radius:8px;background:var(--bg-soft);color:var(--text);padding:9px;font:inherit;font-size:12px;outline:none}.assistant-library-panel textarea{resize:vertical;line-height:1.65}.assistant-library-panel input:focus,.assistant-library-panel textarea:focus{border-color:var(--accent)}.assistant-hint,.assistant-empty{font-size:12px;line-height:1.7;color:var(--muted)}.assistant-persona-text{white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;font:inherit;font-size:13px;line-height:1.85;padding:12px;background:var(--bg-soft);border-radius:10px}
.assistant-feedback{font-size:12px;margin:0 12px 8px;padding:8px;background:var(--panel-muted);border-radius:6px;color:var(--accent-bright);overflow-wrap:anywhere}.assistant-feedback.error{color:#ff8b8b}.assistant-entry-actions{display:flex;gap:6px;margin:12px 0}.assistant-entry-actions input{flex:1;min-width:0}.assistant-entry-actions button{white-space:nowrap}.assistant-custom-editor{padding:12px;border:1px solid var(--accent);border-radius:12px;background:var(--panel-muted);margin-bottom:16px}.assistant-media-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.assistant-media-card{display:flex;flex-direction:column;gap:6px;background:var(--bg-soft);padding:8px;border-radius:10px;min-width:0}.assistant-media-card img{width:100%;height:110px;object-fit:contain}.assistant-media-card small{overflow-wrap:anywhere;font-size:10px;color:var(--muted)}
.assistant-custom-card{padding:13px;margin-bottom:12px;border:1px solid var(--line);border-radius:12px;background:var(--panel-muted)}.assistant-custom-card>.assistant-card-header{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}.assistant-card-heading{display:flex;align-items:center;gap:8px;min-width:0;flex:1 1 130px}.assistant-card-controls,.assistant-card-send-actions{display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-wrap:wrap}.assistant-card-send-actions button{padding:5px 8px;font-size:11px}.assistant-card-drag-handle{flex:0 0 auto;cursor:grab;font-size:18px;padding:3px 8px!important;touch-action:none}.assistant-card-drag-handle:active{cursor:grabbing}.assistant-custom-card.assistant-card-dragging{opacity:.55;border-color:var(--accent)}.assistant-custom-card h3{margin:0;font-size:14px;overflow-wrap:anywhere}.assistant-custom-card small,.assistant-custom-card footer span{font-size:11px;color:var(--muted)}.assistant-custom-card footer{display:flex;align-items:center;gap:6px;margin-top:12px}.assistant-custom-card footer span{margin-right:auto}.assistant-card-materials{display:flex;flex-direction:column;gap:12px;margin-top:12px}.assistant-card-material{padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--panel-strong)}.assistant-card-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.8;user-select:text}.assistant-material-actions{display:flex;justify-content:flex-start;align-items:center;gap:8px;margin-top:8px}.assistant-material-actions small.material-used{color:var(--accent-bright)}.assistant-library-panel button.assistant-image-preview{width:100%;padding:0;border:0;background:transparent}.assistant-image-preview img{width:100%;max-height:220px;object-fit:contain;border-radius:8px}.assistant-media-viewer{position:absolute;inset:0;background:var(--panel-strong);z-index:2;padding:14px;display:flex;flex-direction:column;gap:10px;overflow:auto}.assistant-media-viewer>button{align-self:flex-end}.assistant-media-viewer img{width:100%;max-height:80%;object-fit:contain}.assistant-media-viewer p{font-size:12px;overflow-wrap:anywhere}
.workspace-page.assistant-library-enabled .runtime-web-main{margin-right:84px}.workspace-page.assistant-library-open .runtime-web-main{margin-right:488px}@media(max-width:850px){.workspace-page.assistant-library-open .runtime-web-main{margin-right:0}.assistant-library-panel{width:calc(100vw - 136px)}}
</style>

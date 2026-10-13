<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { AssistantKind, AssistantLibrary, AssistantEntry, AssistantMedia } from '../../electron/assistant-library-types';
import { assistantLabels, emptyAssistantLibrary } from '../../electron/assistant-library-types';
import icon from '../assets/xiaozhi-assistant-transparent.png';
import PersonaTimeline from './PersonaTimeline.vue';
import WeeklyScheduleTimeline from './WeeklyScheduleTimeline.vue';
import { buildAssistantCatalog } from '../assistant-material-catalog';
import type { AssistantCatalog, AssistantMaterial } from '../../electron/assistant-material-types';
import ConversationExportControl from './ConversationExportControl.vue';
import type {ConversationExportMode} from '../../electron/conversation-export-types';

const props = defineProps<{ open: boolean; workspace: boolean; collapsed: boolean; usedIds?:string[]; exportBusy?:boolean; exportStatus?:string }>();
const emit = defineEmits<{ 'update:open': [value: boolean]; copy:[material:AssistantMaterial]; export:[mode:ConversationExportMode]; cancelExport:[] }>();
const catalog=ref<AssistantCatalog>({persona:[],schedule:[],quotes:[]});
void buildAssistantCatalog(emptyAssistantLibrary()).then(value=>catalog.value=value);
const library = ref<AssistantLibrary>(emptyAssistantLibrary());
let savedLibrary = emptyAssistantLibrary();
const kind = ref<AssistantKind>('persona');
const busy = ref(false), error = ref(''), notice = ref(''), dirty = ref(false), search = ref('');
const selectedId = ref(''), merge = ref(true), preview = ref<AssistantMedia | null>(null);
const module = computed(() => library.value.modules[kind.value]);
const selected = computed(() => module.value.entries.find(e => e.id === selectedId.value));
const entries = computed(() => module.value.entries.filter(e => `${e.title} ${e.text} ${e.tags.join(' ')} ${e.date}`.toLowerCase().includes(search.value.toLowerCase())));
const panelTop = computed(() => props.workspace && !props.collapsed ? '112px' : '8px');
const buttonY = ref(Math.min(window.innerHeight - 100, Math.max(120, Number(localStorage.getItem('assistant-button-y')) || window.innerHeight * .55)));
const exportButtonTop=computed(()=>Math.min(buttonY.value+100,window.innerHeight-60));
let drag: { y: number; initial: number; moved: boolean } | null = null;
function pointerDown(event: PointerEvent) {
  if(event.button!==0)return;
  drag={y:event.clientY,initial:buttonY.value,moved:false};(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function pointerMove(event: PointerEvent) {
  if(!drag)return;
  if(Math.abs(event.clientY-drag.y)>6)drag.moved=true;
  if(drag.moved)buttonY.value=Math.max(12,Math.min(window.innerHeight-100,drag.initial+event.clientY-drag.y));
}
function pointerUp() {
  if(!drag)return;
  if(!drag.moved)emit('update:open',!props.open);
  localStorage.setItem('assistant-button-y',String(buttonY.value));drag=null;
}
function replace(value: AssistantLibrary) {
  library.value=value;dirty.value=false;
  void buildAssistantCatalog(value).then(result=>catalog.value=result);
  savedLibrary=JSON.parse(JSON.stringify(value));
  if(!module.value.entries.some(e=>e.id===selectedId.value))selectedId.value=module.value.entries[0]?.id||'';
}
async function run(task: () => Promise<void>) {
  if(busy.value)return;busy.value=true;error.value='';notice.value='';
  try {await task();} catch(e) {error.value=e instanceof Error?e.message:String(e);} finally {busy.value=false;}
}
async function load() {await run(async()=>replace(await window.chatTranslator.getAssistantLibrary()));}
async function save() {await run(async()=>{replace(await window.chatTranslator.saveAssistantModule(kind.value,JSON.parse(JSON.stringify(module.value))));notice.value='已保存到本机';});}
async function importFile() {
  if(dirty.value&&!window.confirm('导入会替换当前未保存的编辑，继续吗？'))return;
  await run(async()=>{const value=await window.chatTranslator.importAssistantModule(kind.value,merge.value);if(value){replace(value);notice.value='已导入；预览确认后再启用智能回复';}});
}
async function template() {await run(async()=>{if(await window.chatTranslator.exportAssistantTemplate(kind.value))notice.value='模板已保存';});}
async function exportFile() {await run(async()=>{
  replace(await window.chatTranslator.saveAssistantModule(kind.value,JSON.parse(JSON.stringify(module.value))));
  if(await window.chatTranslator.exportAssistantModule(kind.value))notice.value='已导出，可分发给团队导入';
});}
function edit() {dirty.value=true;}
function newEntry() {
  const entry:AssistantEntry={id:crypto.randomUUID(),title:kind.value==='schedule'?'新行程':kind.value==='persona'?'人物素材':'新案例',text:'',date:'',timeZone:'America/Los_Angeles',status:'planned',tags:[],media:[]};
  module.value.entries.push(entry);selectedId.value=entry.id;edit();
}
function removeEntry() {
  if(!selected.value||!window.confirm('删除这个条目及其素材关联？'))return;
  module.value.entries=module.value.entries.filter(e=>e.id!==selectedId.value);selectedId.value=module.value.entries[0]?.id||'';edit();
}
async function attach() {
  if(!selected.value)return;
  await run(async()=>{
    replace(await window.chatTranslator.saveAssistantModule(kind.value,JSON.parse(JSON.stringify(module.value))));
    const value=await window.chatTranslator.attachAssistantMedia(kind.value,selectedId.value);if(value)replace(value);
  });
}
async function reveal(media:AssistantMedia) {await run(()=>window.chatTranslator.revealAssistantMedia(media.id));}
async function copy(text:string) {await run(async()=>{await window.chatTranslator.writeClipboardText(text);notice.value='已复制';});}
function switchKind(next:AssistantKind) {
  if(next===kind.value||busy.value)return;
  if(dirty.value){if(!window.confirm('当前模块有未保存修改，切换将丢弃这些修改。继续吗？'))return;
    library.value.modules[kind.value]=JSON.parse(JSON.stringify(savedLibrary.modules[kind.value]));dirty.value=false;}
  kind.value=next;search.value='';selectedId.value=module.value.entries[0]?.id||'';preview.value=null;notice.value='';error.value='';
}
watch(()=>props.open,value=>{if(!value)preview.value=null;});
watch(kind,value=>{if(value==='quotes')void load();});
onMounted(load);
</script>

<template>
  <div class="assistant-library-root">
    <button v-if="!open" class="xiaozhi-float" type="button" :style="{ top: `${buttonY}px` }" title="小智加持 · 拖动调整位置"
      aria-label="打开小智加持" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="drag = null"
      @keydown.enter.prevent="emit('update:open',true)" @keydown.space.prevent="emit('update:open',true)">
      <img :src="icon" alt="" draggable="false"><span>小智加持</span>
    </button>
    <ConversationExportControl v-if="workspace&&!open" floating :top="exportButtonTop" :busy="!!exportBusy" :status="exportStatus||''" @export="emit('export',$event)" @cancel="emit('cancelExport')" />
    <aside v-if="open" class="assistant-library-panel" :style="{ top: panelTop }" aria-label="小智加持资料助手">
      <header class="assistant-library-heading"><img :src="icon" alt=""><div><strong>小智加持</strong><small>{{kind==='persona'?'人物历程':kind==='schedule'?'一周行程':'本机资料'}}</small></div>
        <ConversationExportControl v-if="workspace" :busy="!!exportBusy" :status="exportStatus||''" @export="emit('export',$event)" @cancel="emit('cancelExport')" />
        <button type="button" aria-label="关闭资料助手" @click="emit('update:open',false)">×</button></header>
      <nav class="assistant-library-tabs" aria-label="资料模块"><button v-for="(label,key) in assistantLabels" :key="key" type="button" :disabled="busy" :class="{active:kind===key}" @click="switchKind(key)">{{label}}</button></nav>
      <div v-if="kind==='quotes'" class="assistant-library-toolbar"><button :disabled="busy" @click="importFile">导入</button><button :disabled="busy" @click="template">模板</button><button :disabled="busy" @click="exportFile">导出资料包</button><button class="primary" :disabled="busy" @click="save">{{busy?'处理中…':'保存修改'}}</button></div>
      <label v-if="kind==='quotes'" class="assistant-check"><input v-model="merge" type="checkbox">导入时合并条目（取消则整包替换）</label>
      <p v-if="kind==='quotes'&&error" class="assistant-feedback error" role="alert">{{error}}</p><p v-if="kind==='quotes'&&notice" class="assistant-feedback" role="status">{{notice}}</p>
      <div class="assistant-library-scroll" :class="{ 'is-busy': busy&&kind==='quotes' }">
        <PersonaTimeline v-if="kind==='persona'" :cards="catalog.persona" :used-ids="usedIds||[]" @copy="emit('copy',$event)" />
        <WeeklyScheduleTimeline v-else-if="kind==='schedule'" :cards="catalog.schedule" :used-ids="usedIds||[]" @copy="emit('copy',$event)" />
        <template v-else>
        <div class="assistant-library-meta"><span>版本 {{module.version}}</span><span>{{module.importedAt?new Date(module.importedAt).toLocaleString():'尚未导入'}}</span><b v-if="dirty">有未保存修改</b></div>
        <label class="assistant-field">资料名称<input v-model="module.title" maxlength="200" @input="edit"></label>
        <label class="assistant-check assistant-enable"><input v-model="module.enabled" type="checkbox" @change="edit">保存后用于智能回复</label>
        <p class="assistant-hint">只发送已确认的文字；照片、视频在本机预览并由你选择发送。</p>
          <label class="assistant-field">案例使用规则<textarea v-model="module.aiText" rows="3" maxlength="2000" placeholder="可选，启用后作为文字参考传给 AI。" @input="edit"></textarea></label>
          <div class="assistant-entry-actions"><input v-model="search" placeholder="搜索场景、标签、金句" aria-label="搜索条目"><button @click="newEntry">新增</button></div>
          <div class="assistant-entry-list"><button v-for="entry in entries" :key="entry.id" :class="{active:selectedId===entry.id}" @click="selectedId=entry.id"><strong>{{entry.title||'未命名'}}</strong><small>{{entry.tags.join(' · ')||'未分类'}} · {{entry.media.length}} 个素材</small></button></div>
          <p v-if="!module.entries.length" class="assistant-empty">导入优秀对话，或添加适用场景与推荐金句。</p>
          <section v-if="selected" class="assistant-entry-editor">
            <label class="assistant-field">适用场景<input v-model="selected.title" maxlength="200" @input="edit"></label>
            <label class="assistant-field">上下文与推荐表达<textarea v-model="selected.text" rows="6" maxlength="16000" placeholder="填写双方对话及值得参考的人工回复。" @input="edit"></textarea></label>
            <label class="assistant-field">检索标签（用逗号分隔）<input :value="selected.tags.join(', ')" placeholder="comfort, weekend, 安慰" @input="selected.tags=($event.target as HTMLInputElement).value.split(/[,，]/).map(t=>t.trim()).filter(Boolean);edit()"></label>
            <div class="assistant-entry-actions"><button :disabled="busy" @click="attach">添加照片 / 视频</button><button :disabled="busy" @click="copy(selected.text)">复制文字</button><button :disabled="busy" @click="removeEntry">删除条目</button></div>
            <div class="assistant-media-grid"><article v-for="media in selected.media" :key="media.id" class="assistant-media-card">
              <button class="assistant-media-preview" @click="preview=media"><img v-if="media.mime.startsWith('image/')" :src="`app://assistant-media/${media.id}`" :alt="media.name" loading="lazy"><span v-else>▶ 视频</span></button>
              <small>{{media.name}}</small><input v-model="media.caption" placeholder="素材文字说明，供 AI 参考" maxlength="2000" @input="edit"><button @click="reveal(media)">打开所在文件夹</button><button @click="selected.media=selected.media.filter(m=>m.id!==media.id);edit()">移除关联</button>
            </article></div>
          </section>
        </template>
      </div>
      <div v-if="preview" class="assistant-media-viewer"><button aria-label="关闭素材预览" @click="preview=null">×</button><img v-if="preview.mime.startsWith('image/')" :src="`app://assistant-media/${preview.id}`" :alt="preview.name"><video v-else :src="`app://assistant-media/${preview.id}`" controls preload="metadata"></video><p>{{preview.name}}</p><button @click="reveal(preview)">打开所在文件夹发送</button></div>
    </aside>
  </div>
</template>

<style>
.xiaozhi-float{position:fixed;right:12px;width:64px;height:96px;z-index:80;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;border:0;background:transparent;color:var(--accent-bright);cursor:grab;touch-action:none;-webkit-app-region:no-drag}
.xiaozhi-float img{height:76px;width:58px;object-fit:contain;filter:drop-shadow(0 3px 5px rgba(0,0,0,.4));pointer-events:none}.xiaozhi-float span{font-size:11px;background:var(--panel-strong);border:1px solid var(--line);border-radius:8px;padding:2px 4px;white-space:nowrap}.xiaozhi-float:focus-visible{outline:2px solid var(--accent)}
.assistant-library-panel{position:fixed;right:8px;bottom:8px;width:min(472px,calc(100vw - 136px));z-index:90;display:flex;flex-direction:column;overflow:hidden;background:var(--panel-strong);color:var(--text);border:1px solid var(--line-strong);border-radius:18px;box-shadow:var(--shadow);-webkit-app-region:no-drag}
.assistant-library-heading{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line)}.assistant-library-heading>img{height:50px;width:40px;object-fit:contain}.assistant-library-heading>div{flex:1}.assistant-library-heading strong{font-size:18px;color:var(--accent-bright)}.assistant-library-heading small{display:block;margin-top:5px;color:var(--muted);font-size:11px}.assistant-library-heading>button{font-size:24px}
.assistant-library-panel button{border:1px solid var(--line);border-radius:8px;padding:7px 10px;color:var(--text);background:var(--panel-muted);cursor:pointer;font-size:12px}.assistant-library-panel button:hover:not(:disabled),.assistant-library-panel button.active{border-color:var(--accent);color:var(--accent-bright)}.assistant-library-panel button:disabled{opacity:.5;cursor:wait}.assistant-library-panel button.primary{background:var(--accent);color:var(--bg);font-weight:700}
.assistant-library-tabs{display:flex;gap:6px;padding:10px 12px}.assistant-library-tabs button{flex:1}.assistant-library-toolbar{display:flex;gap:6px;padding:0 12px 10px}.assistant-library-toolbar .primary{margin-left:auto}
.assistant-library-scroll{overflow-y:auto;flex:1;padding:10px 16px 24px;min-height:0}.assistant-library-scroll.is-busy{pointer-events:none;opacity:.7}.assistant-library-meta{display:flex;gap:10px;flex-wrap:wrap;color:var(--muted);font-size:11px;margin-bottom:12px}.assistant-library-meta b{color:var(--accent-bright)}
.assistant-field{display:flex;flex-direction:column;gap:6px;margin:10px 0;font-size:12px;color:var(--muted-strong)}.assistant-library-panel input:not([type=checkbox]),.assistant-library-panel textarea,.assistant-library-panel select{width:100%;border:1px solid var(--line);border-radius:8px;background:var(--bg-soft);color:var(--text);padding:9px;font:inherit;font-size:12px;outline:none}.assistant-library-panel textarea{resize:vertical;line-height:1.65}.assistant-library-panel input:focus,.assistant-library-panel textarea:focus{border-color:var(--accent)}.assistant-check{display:flex;gap:8px;align-items:center;font-size:12px;margin:0 14px 8px;color:var(--muted-strong)}.assistant-enable{margin:14px 0 4px}.assistant-check input{accent-color:var(--accent)}.assistant-hint,.assistant-empty{font-size:12px;line-height:1.6;color:var(--muted)}
.assistant-feedback{font-size:12px;margin:0 12px 8px;padding:8px;background:var(--panel-muted);border-radius:6px;color:var(--accent-bright);overflow-wrap:anywhere}.assistant-feedback.error{color:#ff8b8b}.assistant-entry-actions{display:flex;gap:6px;margin:12px 0}.assistant-entry-actions input{flex:1;min-width:0}.assistant-entry-actions button{white-space:nowrap}.assistant-entry-list{display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:160px;overflow:auto}.assistant-entry-list button{text-align:left}.assistant-entry-list strong,.assistant-entry-list small{display:block;overflow-wrap:anywhere}.assistant-entry-list small{color:var(--muted);font-size:10px;margin-top:5px}.assistant-entry-editor{border-top:1px solid var(--line);margin-top:16px;padding-top:8px}.assistant-date-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.assistant-media-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.assistant-media-card{display:flex;flex-direction:column;gap:6px;background:var(--bg-soft);padding:8px;border-radius:10px;min-width:0}.assistant-media-card small{overflow-wrap:anywhere;font-size:10px;color:var(--muted)}.assistant-media-card .assistant-media-preview{height:110px;padding:0;overflow:hidden}.assistant-media-preview img{width:100%;height:100%;object-fit:cover}.assistant-media-viewer{position:absolute;inset:0;background:var(--panel-strong);z-index:2;padding:14px;display:flex;flex-direction:column;gap:10px;overflow:auto}.assistant-media-viewer>button:first-child{align-self:flex-end}.assistant-media-viewer img,.assistant-media-viewer video{width:100%;max-height:70%;object-fit:contain}.assistant-media-viewer p{font-size:12px;overflow-wrap:anywhere}
.workspace-page.assistant-library-enabled .runtime-web-main{margin-right:84px}.workspace-page.assistant-library-open .runtime-web-main{margin-right:488px}
@media(max-width:850px){.workspace-page.assistant-library-open .runtime-web-main{margin-right:0}.assistant-library-panel{width:calc(100vw - 136px)}}
</style>

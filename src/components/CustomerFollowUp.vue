<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { customerRequiredFields, type CustomerTarget, type CustomerSettings, type CustomerEntry, type CustomerImportPreview } from '../../electron/customer-follow-up-types';
import { customerState, customerWrites, changedCustomer, flushCustomer, awaitCustomerSaved, applyCustomerImport, type CustomerState } from '../customer-follow-up-client';

const props=defineProps<{profileId:string;resolveTarget:()=>Promise<CustomerTarget>}>();
const current=ref<CustomerState|null>(null),target=ref<CustomerTarget|null>(null);
const settings=ref<CustomerSettings>({fields:[],stages:[]});
const loading=ref(true),error=ref(''),settingsOpen=ref(false),settingsBusy=ref(false),settingsError=ref('');
const settingsDraft=ref<CustomerSettings>({fields:[],stages:[]}),newStage=ref('');
const newStageInput=ref<HTMLInputElement|null>(null),settingsNotice=ref('');
function stageInputRef(element:unknown){newStageInput.value=element instanceof HTMLInputElement?element:null;}
const localTransferBusy=ref(false),transferNotice=ref('');
const transferBusy=computed(()=>localTransferBusy.value||!!current.value?.transferring);
const stagePreview=ref<CustomerImportPreview|null>(null),selectedImportStage=ref(''),stageSelect=ref<HTMLSelectElement|null>(null);
let resolveStage:((stage:string|null)=>void)|undefined;
function finishStage(stage:string|null){const resolve=resolveStage;resolveStage=undefined;stagePreview.value=null;resolve?.(stage);}
function chooseImportStage(preview:CustomerImportPreview):Promise<string|null>{
  selectedImportStage.value='';stagePreview.value=preview;
  void nextTick(()=>stageSelect.value?.focus());
  return new Promise(resolve=>{resolveStage=resolve;});
}
function stageDialogKey(event:KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();finishStage(null);}
  if(event.key==='Tab'){const controls=Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('select,button:not(:disabled)'));const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
}
let identity='',generation=0,reading=false,disposed=false,timer:ReturnType<typeof setInterval>|undefined;
const record=computed(()=>current.value?.record);
const otherErrors=computed(()=>[...customerWrites.values()].filter(state=>state.error&&state!==current.value));
const missing=computed(()=>customerRequiredFields.filter(name=>!record.value?.values[name]?.trim()||(name==='客户阶段'&&!settings.value.stages.includes(record.value.values[name]))));
const entries=computed(()=>[...(record.value?.entries||[])].sort((a,b)=>b.createdAt-a.createdAt));
const stageOptions=computed(()=>settings.value.stages);
const platformNames={opensms:'打新增',whatsapp:'WhatsApp',telegram:'Telegram',signal:'Signal'};
function changed(){if(current.value)changedCustomer(current.value);}
function flushCurrent(){if(current.value)void flushCustomer(current.value);}
function commitChanged(){changed();flushCurrent();}
async function refresh(){
  if(reading||disposed)return;reading=true;const token=generation;
  try{
    const found=await props.resolveTarget();if(disposed||token!==generation)return;
    const next=JSON.stringify(found.platform==='opensms'?[found.platform,found.phone]:[found.platform,found.profileId,found.contactId]);
    if(next===identity){target.value=found;return;}
    flushCurrent();finishStage(null);current.value=null;target.value=null;loading.value=true;error.value='';settingsOpen.value=false;transferNotice.value='';
    const snapshot=await window.chatTranslator.getCustomer(found);if(disposed||token!==generation)return;
    current.value=customerState(found,snapshot);settings.value=snapshot.settings;target.value=found;identity=next;
  }catch(e){if(!disposed&&token===generation){flushCurrent();identity='';current.value=null;target.value=null;error.value=(e instanceof Error?e.message:String(e)).replace('需要导出的','');}}
  finally{reading=false;if(token===generation)loading.value=false;else if(!disposed)void refresh();}
}
function reset(){flushCurrent();finishStage(null);generation++;identity='';current.value=null;target.value=null;error.value='';transferNotice.value='';loading.value=true;void refresh();}
watch(()=>props.profileId,reset,{flush:'sync'});
onMounted(()=>{void refresh();timer=setInterval(()=>void refresh(),900);});
onUnmounted(()=>{flushCurrent();disposed=true;finishStage(null);generation++;if(timer)clearInterval(timer);});
function addEntry(){
  if(!record.value)return;const draft=record.value.draft;
  if(!draft.talked.trim()||!draft.next.trim()){error.value='请填写今天聊了什么和下一步做什么';return;}
  const old=record.value.entries.find(e=>e.id===draft.editingId);
  if(old){old.talked=draft.talked.trim();old.next=draft.next.trim();old.updatedAt=Date.now();}
  else record.value.entries.push({id:crypto.randomUUID(),talked:draft.talked.trim(),next:draft.next.trim(),createdAt:Date.now(),updatedAt:Date.now()});
  record.value.draft={talked:'',next:'',editingId:''};error.value='';commitChanged();
}
function editEntry(entry:CustomerEntry){if(!record.value)return;if((record.value.draft.talked||record.value.draft.next)&&!window.confirm('替换当前未提交的跟进草稿？'))return;record.value.draft={talked:entry.talked,next:entry.next,editingId:entry.id};changed();}
function removeEntry(entry:CustomerEntry){if(!record.value||!window.confirm('确定删除这条跟进记录？'))return;record.value.entries=record.value.entries.filter(e=>e.id!==entry.id);if(record.value.draft.editingId===entry.id)record.value.draft={talked:'',next:'',editingId:''};commitChanged();}
function cancelEdit(){if(!record.value)return;record.value.draft={talked:'',next:'',editingId:''};changed();}
function manageStages(){if(!settingsOpen.value){settingsDraft.value=JSON.parse(JSON.stringify(settings.value));newStage.value='';settingsError.value='';settingsOpen.value=true;}void nextTick(()=>newStageInput.value?.focus());}
function addStage(){const name=newStage.value.trim();if(!name)return;if(settingsDraft.value.stages.includes(name)){settingsError.value='客户阶段已存在';return;}settingsDraft.value.stages.push(name);newStage.value='';settingsError.value='';}
async function saveSettings(){
  if(settingsBusy.value)return;settingsBusy.value=true;settingsError.value='';settingsNotice.value='';
  try{
    const next=JSON.parse(JSON.stringify(settingsDraft.value)) as CustomerSettings;
    const stage=newStage.value.trim();
    if(stage){if(next.stages.includes(stage))throw new Error('客户阶段已存在');next.stages.push(stage);}
    settings.value=await window.chatTranslator.saveCustomerSettings(next);settingsOpen.value=false;newStage.value='';
    settingsNotice.value=`已保存 ${settings.value.stages.length} 个客户阶段，所有平台和联系人共用`;
  }catch(e){settingsError.value=e instanceof Error?e.message:String(e);}finally{settingsBusy.value=false;}
}
function removeStage(stage:string){if(settingsDraft.value.stages.length<=1)return;if(window.confirm(`删除客户阶段「${stage}」？所有平台和联系人的可选列表都会移除此项，已有客户的原阶段记录仍保留，之后可重新选择。`))settingsDraft.value.stages=settingsDraft.value.stages.filter(value=>value!==stage);}
async function transfer(mode:'import'|'export'){
  const state=current.value;if(!state||!target.value||transferBusy.value||settingsBusy.value||settingsOpen.value)return;
  const captured=JSON.parse(JSON.stringify(target.value)) as CustomerTarget;
  const token=generation;
  const same=(a:CustomerTarget,b:CustomerTarget)=>a.platform===b.platform&&(a.platform==='opensms'?a.phone===b.phone:a.profileId===b.profileId&&a.contactId===b.contactId);
  async function check(){const found=await props.resolveTarget();if(disposed||generation!==token||current.value!==state||!same(found,captured))throw new Error('联系人已切换，操作已取消，请在当前联系人下重试');}
  localTransferBusy.value=true;state.transferring=true;error.value='';transferNotice.value='';
  try{
    await awaitCustomerSaved(state);await check();
    if(mode==='export'){
      const saved=await window.chatTranslator.exportCustomer(captured);
      if(!disposed&&current.value===state)transferNotice.value=saved?'客户跟进已导出':'已取消导出';
      return;
    }
    const preview=await window.chatTranslator.previewCustomerImport(captured);
    if(!preview){if(!disposed&&current.value===state)transferNotice.value='已取消导入';return;}
    await check();
    let selectedStage:string|undefined;
    if(!preview.localStages.includes(preview.importedStage)){
      const choice=await chooseImportStage(preview);
      if(choice===null){if(!disposed&&current.value===state)transferNotice.value='已取消导入';return;}
      selectedStage=choice;await check();
    }
    const destination=captured.platform==='opensms'?captured.phone:captured.contactTitle||'当前联系人';
    if(!window.confirm(`将覆盖当前联系人「${destination}」的客户跟进。\n\n来源姓名：${preview.name}\n跟进记录：${preview.entryCount} 条\n导出时间：${date(preview.exportedAt)}\n\n资料卡、跟进时间线和草稿将全部替换。是否继续？`)){transferNotice.value='已取消导入';return;}
    await check();
    const snapshot=await window.chatTranslator.importCustomer(captured,preview.token,selectedStage);
    applyCustomerImport(state,snapshot);
    if(!disposed&&current.value===state){settings.value=snapshot.settings;settingsOpen.value=false;transferNotice.value='已导入并覆盖当前联系人的客户跟进';}
  }catch(e){if(!disposed&&generation===token)error.value=e instanceof Error?e.message:String(e);}
  finally{state.transferring=false;localTransferBusy.value=false;}
}
const date=(value:number)=>new Date(value).toLocaleString();
</script>

<template>
  <section class="customer-follow-up" aria-label="客户跟进">
    <div v-if="stagePreview" class="customer-stage-overlay" @click.self="finishStage(null)">
      <section class="customer-stage-dialog" role="dialog" aria-modal="true" aria-labelledby="customer-stage-dialog-title" @keydown="stageDialogKey">
        <h3 id="customer-stage-dialog-title">选择本机客户阶段</h3>
        <p>当前导入的客户阶段是 {{stagePreview.importedStage||'未填写'}}，请知晓</p>
        <p class="customer-stage-hint">请从本机全局客户阶段中重新选择。本次选择只用于当前导入的联系人，本机阶段选项保持原样。</p>
        <label>本机客户阶段<select ref="stageSelect" v-model="selectedImportStage" aria-label="导入时选择本机客户阶段"><option disabled value="">请选择客户阶段</option><option v-for="stage in stagePreview.localStages" :key="stage" :value="stage">{{stage}}</option></select></label>
        <footer><button @click="finishStage(null)">取消导入</button><button class="primary" :disabled="!stagePreview.localStages.includes(selectedImportStage)" @click="finishStage(selectedImportStage)">确认阶段</button></footer>
      </section>
    </div>
    <p v-for="state in otherErrors" :key="JSON.stringify(state.target)" class="customer-error" role="alert">{{state.target.contactTitle||state.target.phone||'其他客户'}}的修改尚未保存：{{state.error}} <button @click="flushCustomer(state)">重试保存</button></p>
    <p v-if="loading" class="customer-empty" role="status">正在读取当前联系人…</p>
    <p v-if="error" class="customer-error" role="alert">{{error}}</p>
    <template v-if="record&&current&&target">
      <header class="customer-summary"><div><strong>{{target.contactTitle||target.phone||'当前联系人'}}</strong><small>{{platformNames[target.platform]}} · {{target.platform==='opensms'?target.phone:'当前账号'}} · 仅本机</small></div><span :class="{complete:!missing.length}">{{missing.length?`待补充 ${missing.length} 项`:'资料完整'}}</span></header>
      <div class="customer-save-status" role="status"><span v-if="current.error" class="customer-error">保存失败：{{current.error}} <button :disabled="transferBusy" @click="flushCustomer(current)">重试保存</button></span><span v-else>{{current.saving?'正在保存…':current.savedRevision<current.revision?'有待保存修改':record.updatedAt?'已保存到本机':'填写后自动保存草稿'}}</span><div class="customer-transfer-actions"><button :disabled="transferBusy||settingsBusy||settingsOpen" @click="transfer('import')">导入</button><button :disabled="transferBusy||settingsBusy||settingsOpen" @click="transfer('export')">导出</button></div></div>
      <p v-if="transferBusy||transferNotice" class="customer-transfer-notice" role="status">{{transferBusy?'正在处理文件…':transferNotice}}</p>
      <p v-if="settingsNotice" class="customer-transfer-notice" role="status">{{settingsNotice}}</p>
      <fieldset class="customer-edit-region" :disabled="transferBusy||settingsBusy">
      <div class="customer-grid">
        <template v-for="name in customerRequiredFields" :key="name"><label :class="{wide:name==='兴趣'||name==='备注'||name==='客户阶段'}"><span>{{name}} <b>*</b><small v-if="!record.values[name]?.trim()">待补充</small><button v-if="name==='客户阶段'" type="button" class="customer-manage-stages" @click.prevent="manageStages">管理选项</button></span>
          <template v-if="name==='客户阶段'"><select v-model="record.values[name]" :aria-label="name" aria-required="true" @change="changed"><option value="" disabled>请选择阶段</option><option v-for="stage in stageOptions" :key="stage">{{stage}}</option></select><small v-if="record.values[name]&&!stageOptions.includes(record.values[name])" class="customer-retired-stage">原阶段“{{record.values[name]}}”已从全局选项中删除，请重新选择。</small></template>
          <textarea v-else-if="name==='备注'||name==='兴趣'" v-model="record.values[name]" :aria-label="name" aria-required="true" rows="2" maxlength="8000" @input="changed"></textarea>
          <input v-else v-model="record.values[name]" :aria-label="name" aria-required="true" maxlength="8000" @input="changed">
        </label>
        <section v-if="name==='客户阶段'&&settingsOpen" class="customer-settings wide" aria-label="管理客户阶段选项">
          <h3>管理客户阶段选项</h3>
          <p>所有平台和联系人共用，支持新增和删除。</p>
          <div class="customer-inline"><input :ref="stageInputRef" v-model="newStage" maxlength="40" placeholder="新增客户阶段" aria-label="新增客户阶段" @keydown.enter.prevent="addStage"><button :disabled="settingsDraft.stages.length>=40" @click="addStage">添加阶段</button></div>
          <div class="customer-chips"><span v-for="stage in settingsDraft.stages" :key="stage">{{stage}} <button :disabled="settingsDraft.stages.length<=1" :aria-label="`移除阶段${stage}`" @click="removeStage(stage)">删除</button></span></div>
          <p v-if="settingsError" class="customer-error" role="alert">{{settingsError}}</p>
          <div class="customer-inline"><button class="primary" :disabled="settingsBusy" @click="saveSettings">{{settingsBusy?'保存中…':'保存阶段'}}</button><button @click="settingsOpen=false">取消</button></div>
        </section>
        </template>
      </div>
      <section class="customer-compose" aria-label="添加跟进记录"><h3>{{record.draft.editingId?'编辑跟进记录':'添加跟进'}}</h3>
        <label>今天聊了什么<textarea v-model="record.draft.talked" aria-label="今天聊了什么" rows="2" maxlength="16000" @input="changed"></textarea></label>
        <label>下一步做什么<textarea v-model="record.draft.next" aria-label="下一步做什么" rows="2" maxlength="16000" @input="changed"></textarea></label>
        <div class="customer-inline"><small>草稿自动保存，提交后保留时间记录</small><button v-if="record.draft.editingId" @click="cancelEdit">取消编辑</button><button class="primary" @click="addEntry">{{record.draft.editingId?'保存记录':'添加记录'}}</button></div>
      </section>
      <h3 class="customer-timeline-title">跟进时间线 <small>{{entries.length}} 条</small></h3>
      <p v-if="!entries.length" class="customer-empty">还没有跟进记录</p>
      <ol class="customer-timeline"><li v-for="entry in entries" :key="entry.id"><header><time :datetime="new Date(entry.createdAt).toISOString()">{{date(entry.createdAt)}}</time><div><button @click="editEntry(entry)">编辑</button><button @click="removeEntry(entry)">删除</button></div></header><p><b>聊了什么</b>{{entry.talked}}</p><p><b>下一步</b>{{entry.next}}</p><small v-if="entry.updatedAt!==entry.createdAt">修改于 {{date(entry.updatedAt)}}</small></li></ol>
      </fieldset>
    </template>
    <button v-else-if="!loading" @click="refresh">重新读取联系人</button>
  </section>
</template>

<style scoped>
.customer-manage-stages{margin-left:auto}.customer-retired-stage{color:var(--muted);font-size:11px}.customer-stage-settings-title{margin-top:12px!important}
.customer-follow-up select option{color:#000!important;background:#fff!important;color-scheme:light}.customer-stage-overlay{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:16px;background:#0008}.customer-stage-dialog{width:100%;max-height:100%;overflow:auto;box-sizing:border-box;padding:18px;border:1px solid var(--line);border-radius:12px;background:var(--panel-strong);box-shadow:var(--shadow)}.customer-stage-dialog p{overflow-wrap:anywhere;white-space:pre-wrap}.customer-stage-hint{color:var(--muted)}.customer-stage-dialog footer{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.customer-edit-region{border:0;padding:0;margin:0;min-width:0}.customer-transfer-actions{display:flex;gap:4px;flex-shrink:0}.customer-transfer-notice{margin:4px 0 8px;color:var(--muted);font-size:11px}
.customer-follow-up{font-size:12px;color:var(--text);line-height:1.5}.customer-summary{display:flex;gap:10px;align-items:center;justify-content:space-between;padding-bottom:8px;border-bottom:1px solid var(--line)}.customer-summary strong{font-size:15px;overflow-wrap:anywhere}.customer-summary small{display:block;color:var(--muted);font-size:11px}.customer-summary>span{white-space:nowrap;color:var(--accent-bright);font-size:11px}.customer-summary>span.complete{color:#55b98a}.customer-save-status{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:7px 0;color:var(--muted);font-size:11px}.customer-follow-up button{padding:4px 8px;font-size:11px}.customer-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px 10px}.customer-grid label{min-width:0}.customer-grid .wide{grid-column:1/-1}.customer-follow-up label{display:flex;flex-direction:column;gap:3px}.customer-grid label>span{display:flex;align-items:center;gap:4px}.customer-grid b{color:#e28e7a}.customer-grid small{margin-left:auto;font-size:10px;color:var(--muted)}.customer-follow-up input:not([type=checkbox]):not([type=file]),.customer-follow-up textarea,.customer-follow-up select{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--line);border-radius:6px;background:var(--bg-soft);color:var(--text);padding:6px 8px;font:inherit;outline:none}.customer-follow-up input:focus,.customer-follow-up textarea:focus,.customer-follow-up select:focus{border-color:var(--accent)}.customer-follow-up textarea{resize:vertical;min-height:48px}.customer-follow-up h3{font-size:13px;margin:0 0 7px}.customer-compose{margin-top:14px;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--panel-muted)}.customer-compose label+label{margin-top:7px}.customer-inline{display:flex;align-items:center;gap:6px;margin-top:8px}.customer-inline input,.customer-inline small{flex:1;min-width:0}.customer-inline small{color:var(--muted);font-size:10px}.customer-inline button{flex-shrink:0}.customer-timeline-title{margin-top:14px!important}.customer-timeline-title small{color:var(--muted);font-weight:400}.customer-timeline{list-style:none;margin:0 0 0 4px;padding:0 0 0 12px;border-left:1px solid var(--line)}.customer-timeline li{position:relative;margin:0 0 10px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel-muted)}.customer-timeline li:before{content:'';position:absolute;left:-17px;top:14px;width:7px;height:7px;background:var(--accent);border-radius:50%}.customer-timeline header{display:flex;align-items:center;justify-content:space-between;gap:6px}.customer-timeline time,.customer-timeline small{color:var(--muted);font-size:10px}.customer-timeline header button{padding:2px 5px;margin-left:4px}.customer-timeline p{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0}.customer-timeline p b{display:block;font-size:10px;color:var(--muted);font-weight:500}.customer-empty{color:var(--muted);padding:8px 0}.customer-error{color:#e77f78}.customer-settings{margin-bottom:10px;padding:10px;border:1px solid var(--line);border-radius:8px}.customer-settings p{margin:0 0 6px;font-size:11px;color:var(--muted)}.customer-chips{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}.customer-chips>span{border:1px solid var(--line);border-radius:5px;padding:2px 4px;font-size:11px}.customer-chips button{border:0;padding:0 3px;background:transparent}
</style>

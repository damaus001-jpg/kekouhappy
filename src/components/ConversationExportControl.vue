<script setup lang="ts">
import {ref,watch,nextTick,onMounted,onUnmounted} from 'vue';
import type {ConversationExportMode,ConversationExportScope,ConversationExportSelection} from '../../electron/conversation-export-types';
const props=defineProps<{busy:boolean;status:string;floating?:boolean;top?:number}>();
const emit=defineEmits<{export:[selection:ConversationExportSelection];cancel:[];menuOpen:[open:boolean]}>();
const menu=ref(false),scope=ref<ConversationExportScope|null>(null),root=ref<HTMLElement|null>(null);
const popup=ref<HTMLElement|null>(null),popupStyle=ref<Record<string,string>>({});
function positionPopup(){
  if(!menu.value||!root.value)return;
  const anchor=root.value.querySelector('button')!.getBoundingClientRect(),theme=getComputedStyle(root.value),style:Record<string,string>={};
  for(const name of Array.from(theme))if(name.startsWith('--'))style[name]=theme.getPropertyValue(name);
  const width=Math.min(props.floating?188:208,innerWidth-16),height=popup.value?.getBoundingClientRect().height||120;
  const left=Math.max(8,Math.min(anchor.right-width,innerWidth-width-8));
  const top=anchor.bottom+height+6<=innerHeight-8?anchor.bottom+6:Math.max(8,anchor.top-height-6);
  popupStyle.value={...style,left:`${left}px`,top:`${top}px`,width:`${width}px`,maxHeight:`${innerHeight-16}px`,fontFamily:theme.fontFamily};
}
function toggle(){menu.value=!menu.value;scope.value=null;}
function choose(mode:ConversationExportMode){if(props.busy||!scope.value)return;menu.value=false;emit('export',{mode,scope:scope.value});}
function outside(event:PointerEvent){if(!root.value?.contains(event.target as Node)&&!popup.value?.contains(event.target as Node))menu.value=false;}
watch(()=>props.busy,value=>{if(value)menu.value=false;});
watch(menu,value=>{emit('menuOpen',value);if(value)void nextTick(positionPopup);},{flush:'sync'});
watch(scope,()=>{if(menu.value)void nextTick(positionPopup);});
onMounted(()=>{document.addEventListener('pointerdown',outside);window.addEventListener('resize',positionPopup);document.addEventListener('scroll',positionPopup,true);});
onUnmounted(()=>{emit('menuOpen',false);document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',positionPopup);document.removeEventListener('scroll',positionPopup,true);});
</script>
<template>
  <div ref="root" class="conversation-export-control" :class="{'is-floating':floating}" :style="floating?{top:`${top}px`}:undefined" @keydown.esc="menu=false">
    <button type="button" :disabled="busy" @click="toggle" :aria-expanded="menu" :title="status||'导出当前联系人的双方聊天记录'">{{busy?'导出中…':'导出会话'}}</button>
    <Teleport to="body"><div v-if="menu" ref="popup" class="conversation-export-menu" :class="{'is-floating-menu':floating}" :style="popupStyle" @keydown.esc="menu=false">
      <template v-if="!scope"><button type="button" aria-label="当天会话" @click="scope='today'">当天会话 <span aria-hidden="true">›</span></button><button type="button" aria-label="全部会话" @click="scope='all'">全部会话 <span aria-hidden="true">›</span></button></template>
      <template v-else><div class="conversation-export-subheading"><button type="button" @click="scope=null">返回</button><strong>{{scope==='today'?'当天会话':'全部会话'}}</strong></div><button type="button" @click="choose('chinese')">中文</button><button type="button" @click="choose('english')">英文</button></template>
    </div></Teleport>
    <div v-if="busy||status" class="conversation-export-status" :class="{'has-operation':busy}" role="status"><span>{{status}}</span><button v-if="busy" type="button" @click="emit('cancel')">取消</button></div>
  </div>
</template>
<style>
.conversation-export-control{position:relative;-webkit-app-region:no-drag}
.conversation-export-control>button,.conversation-export-menu button,.conversation-export-status button{padding:7px 9px;border:1px solid var(--line);border-radius:8px;color:var(--text);background:var(--panel-strong);font-size:11px;cursor:pointer;white-space:nowrap}
.conversation-export-menu button:hover{border-color:var(--accent);color:var(--accent-bright)}
.conversation-export-control button:hover{border-color:var(--accent);color:var(--accent-bright)}.conversation-export-control button:disabled{opacity:.65;cursor:wait}
.conversation-export-control.is-floating{position:fixed;right:9px;z-index:85;width:70px}
.conversation-export-menu{position:fixed;box-sizing:border-box;z-index:2147483647;padding:8px;display:grid;gap:7px;overflow-y:auto;border:1px solid var(--line-strong);border-radius:12px;color:var(--text);background:var(--panel-strong);box-shadow:var(--shadow);-webkit-app-region:no-drag}
.conversation-export-menu small{font-size:10px;color:var(--muted);padding:3px}
.conversation-export-subheading{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted)}.conversation-export-menu>button{display:flex;align-items:center;justify-content:space-between}.conversation-export-subheading>button{padding:4px 7px!important}
.conversation-export-menu.is-floating-menu{padding:7px}
.conversation-export-menu.is-floating-menu button{white-space:normal;line-height:1.6;padding:7px 5px}
.conversation-export-menu.is-floating-menu small{display:none}
.conversation-export-control.is-floating .conversation-export-status{max-width:72px;flex-direction:column;align-items:stretch;overflow-wrap:anywhere;padding:8px}
.conversation-export-status{position:fixed;right:12px;bottom:12px;max-width:360px;z-index:110;display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:11px;line-height:1.6;color:var(--muted-strong);background:var(--panel-strong);box-shadow:var(--shadow)}
</style>

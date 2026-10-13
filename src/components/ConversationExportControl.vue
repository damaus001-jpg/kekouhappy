<script setup lang="ts">
import {ref} from 'vue';
import type {ConversationExportMode} from '../../electron/conversation-export-types';
defineProps<{busy:boolean;status:string;floating?:boolean;top?:number}>();
const emit=defineEmits<{export:[mode:ConversationExportMode];cancel:[]}>();
const menu=ref(false);
function choose(mode:ConversationExportMode){menu.value=false;emit('export',mode);}
</script>
<template>
  <div class="conversation-export-control" :class="{'is-floating':floating}" :style="floating?{top:`${top}px`}:undefined">
    <button type="button" :disabled="busy" @click="menu=!menu" :aria-expanded="menu" :title="status||'导出当前联系人的双方聊天记录'">{{busy?'导出中…':'导出会话'}}</button>
    <div v-if="menu" class="conversation-export-menu"><button type="button" @click="choose('english')">英文</button><button type="button" @click="choose('chinese')">中文</button><small>双方记录 · 收款信息排除</small></div>
    <div v-if="busy||status" class="conversation-export-status" :class="{'has-operation':busy}" role="status"><span>{{status}}</span><button v-if="busy" type="button" @click="emit('cancel')">取消</button></div>
  </div>
</template>
<style>
.conversation-export-control{position:relative;-webkit-app-region:no-drag}
.conversation-export-control>button,.conversation-export-control .conversation-export-menu button,.conversation-export-status button{padding:7px 9px;border:1px solid var(--line);border-radius:8px;color:var(--text);background:var(--panel-strong);font-size:11px;cursor:pointer;white-space:nowrap}
.conversation-export-control button:hover{border-color:var(--accent);color:var(--accent-bright)}.conversation-export-control button:disabled{opacity:.65;cursor:wait}
.conversation-export-control.is-floating{position:fixed;right:9px;z-index:85;width:70px}
.conversation-export-menu{position:absolute;right:0;top:calc(100% + 6px);width:190px;z-index:100;padding:8px;display:grid;gap:7px;border:1px solid var(--line-strong);border-radius:12px;background:var(--panel-strong);box-shadow:var(--shadow)}
.conversation-export-menu small{font-size:10px;color:var(--muted);padding:3px}
.conversation-export-control.is-floating .conversation-export-menu{width:74px;padding:5px}
.conversation-export-control.is-floating .conversation-export-menu button{white-space:normal;line-height:1.6;padding:7px 5px}
.conversation-export-control.is-floating .conversation-export-menu small{display:none}
.conversation-export-control.is-floating .conversation-export-status{max-width:72px;flex-direction:column;align-items:stretch;overflow-wrap:anywhere;padding:8px}
.conversation-export-status{position:fixed;right:12px;bottom:12px;max-width:360px;z-index:110;display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:11px;line-height:1.6;color:var(--muted-strong);background:var(--panel-strong);box-shadow:var(--shadow)}
</style>

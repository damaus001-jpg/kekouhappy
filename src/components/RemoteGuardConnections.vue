<script setup lang="ts">
import {computed} from 'vue';
import type {RemoteGuardFinding,RemoteGuardTrustedSource} from '../../electron/shared';
const props=defineProps<{findings:RemoteGuardFinding[];sources?:RemoteGuardTrustedSource[];busy:boolean;manage?:boolean}>();
const emit=defineEmits<{trust:[id:string];forget:[key:string]}>();
const connections=computed(()=>props.findings.filter(f=>f.connection).slice().sort((a,b)=>Number(!!a.trusted)-Number(!!b.trusted)));
const name=(kind:string)=>kind==='rdp'?'Windows 远程桌面':'VNC';
</script>
<template>
  <section class="remote-connections" aria-label="远程连接与可信来源">
    <h4>活动连接</h4>
    <p v-if="!connections.length" class="remote-connections-empty">未发现活动远程连接</p>
    <article v-for="finding in connections" :key="finding.code" :class="{trusted:finding.trusted}">
      <header><strong>{{name(finding.connection!.kind)}}</strong><span>{{finding.trusted?'已信任来源':'未信任'}}</span></header>
      <dl><div><dt>实际来源 IP</dt><dd>{{finding.connection!.sourceAddress||'暂未读取到'}}</dd></div>
        <div v-if="finding.connection!.remotePort"><dt>远端连接端口</dt><dd>{{finding.connection!.remotePort}}</dd></div>
        <div v-if="finding.connection!.localPort"><dt>本机服务端口</dt><dd>{{finding.connection!.localPort}}</dd></div>
        <div v-if="finding.connection!.userName"><dt>Windows 用户</dt><dd>{{finding.connection!.userName}}</dd></div>
        <div v-if="finding.connection!.sessionName"><dt>会话</dt><dd>{{finding.connection!.sessionName}}<template v-if="finding.connection!.sessionId!==undefined"> · 编号 {{finding.connection!.sessionId}}</template></dd></div>
        <div v-if="finding.connection!.processId"><dt>进程编号</dt><dd>{{finding.connection!.processId}}</dd></div>
      </dl>
      <button v-if="!finding.trusted" type="button" :disabled="busy||!finding.connection!.trustKey" @click="emit('trust',finding.connection!.id)">记住此来源并信任</button>
      <small v-if="!finding.connection!.trustKey">来源信息不足，不能自动信任；可以延长选择时间或立即锁屏。</small>
    </article>
    <p class="remote-connections-note">可信来源按实际来源 IP、连接类型和本机服务端口匹配；重启后保留，其他新来源仍需确认。</p>
    <template v-if="manage"><h4>本机记住的可信来源</h4><p v-if="!sources?.length" class="remote-connections-empty">尚未保存可信来源</p>
      <div v-for="source in sources||[]" :key="source.key" class="remote-trusted-source"><span>{{name(source.kind)}} · {{source.sourceAddress}} · 本机端口 {{source.servicePort}}</span><button type="button" :disabled="busy" @click="emit('forget',source.key)">取消信任</button></div>
    </template>
  </section>
</template>
<style scoped>
.remote-connections{text-align:left;font-size:12px;line-height:1.5}.remote-connections h4{margin:12px 0 8px;font-size:14px}.remote-connections article{border:1px solid var(--line,#95464f);border-radius:9px;padding:10px;margin-bottom:8px}.remote-connections article.trusted{border-color:#398760}.remote-connections header{display:flex;justify-content:space-between;gap:10px}.remote-connections header span{font-size:11px;opacity:.85}.remote-connections dl{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin:8px 0}.remote-connections dl div{min-width:0}.remote-connections dt{font-size:10px;opacity:.75}.remote-connections dd{margin:0;overflow-wrap:anywhere}.remote-connections button{min-width:0!important;margin-top:3px!important;padding:6px 10px!important;font-size:12px!important}.remote-connections small{display:block;font-size:11px;opacity:.8;margin-top:6px}.remote-connections-note,.remote-connections-empty{font-size:11px!important;line-height:1.6!important;margin:8px 0!important;opacity:.8}.remote-trusted-source{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--line,#95464f)}.remote-trusted-source span{overflow-wrap:anywhere}.remote-trusted-source button{flex-shrink:0}
</style>

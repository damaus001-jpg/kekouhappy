<script setup lang="ts">
defineProps<{ assistantOpen?: boolean }>();
import { onMounted, onUnmounted, ref } from 'vue';
import type { DiagnosticsStatus } from '../electron/shared';
const status = ref<DiagnosticsStatus>({ enabled: false });
const expanded = ref(true);
const key = ref('');
const model = ref('deepseek-flash');
const message = ref('');
const busy = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
async function refresh() {
  try { status.value = await window.chatTranslator.getDiagnosticsStatus(); } catch { /* Window closing. */ }
}
async function save() {
  busy.value = true;
  try {
    await window.chatTranslator.configureDiagnostics({ key: key.value || undefined, model: model.value });
    key.value = '';
    await refresh();
    message.value = '已保存，可以扫码登录并加载消息';
  } catch (error) { message.value = String(error); } finally { busy.value = false; }
}
async function mark() { await window.chatTranslator.markDiagnosticProblem(); message.value = '已标记当前问题时间'; }
async function probe() { await window.chatTranslator.probeDiagnostics(); await refresh(); }
async function exportReport() {
  try { message.value = await window.chatTranslator.exportDiagnostics(); }
  catch (error) { message.value = String(error); }
}
onMounted(async () => {
  await refresh();
  if (status.value.model) model.value = status.value.model;
  if (status.value.enabled) timer = setInterval(() => void refresh(), 2000);
});
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <aside v-if="status.enabled" class="translation-diagnostic-panel" :class="{ 'assistant-offset': assistantOpen }">
    <button class="diagnostic-heading" @click="expanded = !expanded">翻译诊断 · {{ status.keyConfigured ? '密钥已配置' : '请配置密钥' }} {{ expanded ? '收起' : '展开' }}</button>
    <div v-if="expanded" class="diagnostic-body">
      <label>DeepSeek 密钥<input v-model="key" type="password" autocomplete="off" placeholder="在本机输入，日志不记录密钥" /></label>
      <label>模型<select v-model="model"><option value="deepseek-flash">deepseek-flash（官方当前名称）</option><option value="deepseek-v4-pro">deepseek-v4-pro（对照）</option></select></label>
      <button :disabled="busy" @click="save">保存密钥 / 模型</button>
      <p>当前模型：{{ status.model }}<br />接口等待：{{ status.inFlight }} · 最久 {{ Math.round((status.oldestMs || 0) / 1000) }} 秒<br />Signal：运行 {{ status.signalRunning }} / 排队 {{ status.signalQueued }}</p>
      <p>请求成功 {{ status.counts?.['request:success'] || 0 }} · 失败 {{ status.counts?.['request:failed'] || 0 }} · 空响应 {{ status.counts?.['request:empty'] || 0 }}</p>
      <p>接口自检：{{ ({ idle: '待检测', running: '检测中', passed: '通过', failed: '失败', 'invalid-result': '译文无效' } as Record<string, string>)[status.probe?.state || 'idle'] }} · {{ status.probe?.elapsedMs || 0 }} 毫秒 <button @click="probe">重新检测</button></p>
      <div class="diagnostic-actions"><button @click="mark">标记出现无译文</button><button @click="exportReport">导出并打开报告</button></div>
      <p class="diagnostic-message">{{ message }}</p>
      <details><summary>最近监测事件</summary><pre>{{ status.recent?.map(event => JSON.stringify(event)).join('\n') }}</pre></details>
      <small>诊断记录不包含聊天正文、提示词或密钥。</small>
    </div>
  </aside>
</template>

<style scoped>
.translation-diagnostic-panel{position:fixed;right:18px;bottom:16px;width:350px;z-index:2147483647;background:#152234;color:#e9f1ff;border:1px solid #6996cc;border-radius:10px;box-shadow:0 8px 35px #0008;font:13px/1.5 sans-serif;-webkit-app-region:no-drag}
.translation-diagnostic-panel.assistant-offset{right:506px}
.diagnostic-heading{width:100%;padding:10px;text-align:left;font-weight:bold}.diagnostic-body{padding:12px;max-height:70vh;overflow:auto}.diagnostic-body label{display:block;margin-bottom:8px}.diagnostic-body input,.diagnostic-body select{display:block;width:100%;box-sizing:border-box;padding:7px;color:#fff;background:#0c1625;border:1px solid #51657d;border-radius:4px}.translation-diagnostic-panel button{color:#fff;background:#294467;border:0;border-radius:4px;cursor:pointer;padding:7px}.diagnostic-actions{display:flex;gap:7px}.diagnostic-message{overflow-wrap:anywhere}.diagnostic-body pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px}.diagnostic-body small{color:#a5bddc}
</style>

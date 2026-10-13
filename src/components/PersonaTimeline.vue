<script setup lang="ts">
// 整理自根目录人物资料；时间未明确的经历保留原来的时间范围。
import AssistantTimelineCards from './AssistantTimelineCards.vue';
import type { AssistantCard, AssistantMaterial } from '../../electron/assistant-material-types';
defineProps<{cards:AssistantCard[];usedIds:string[]}>();
const emit=defineEmits<{copy:[material:AssistantMaterial]}>();

</script>

<template>
  <section class="persona-journey" aria-label="人物历程时间线">
    <div class="persona-journey-heading"><span>Lucy · 黄诗婷</span></div>
    <AssistantTimelineCards :cards="cards" :used-ids="usedIds" @copy="emit('copy',$event)" />
  </section>
</template>

<style>
.persona-journey{padding:14px 4px 8px}
.persona-journey-heading{padding:0 0 26px 24px}
.persona-journey-heading>span{color:var(--muted);font-size:12px;letter-spacing:1px}
.persona-journey-list{list-style:none;margin:0;padding:0 0 0 10px}
.persona-milestone{position:relative;padding:0 0 22px 25px;border-left:1px solid var(--line-strong)}
.persona-milestone:last-child{border-left-color:transparent;padding-bottom:0}
.persona-milestone-dot{position:absolute;left:-5px;top:17px;width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--panel-strong)}
.persona-milestone article{padding:15px 17px 17px;background:linear-gradient(135deg,var(--panel-muted),var(--bg-soft));border:1px solid var(--line);border-radius:14px}
.persona-milestone-date{margin:0 0 8px;color:var(--accent-bright);font-size:11px;font-weight:600;letter-spacing:1px}
.persona-milestone h3{margin:0 0 8px;font-size:15px;font-weight:600;line-height:1.5;color:var(--text)}
.persona-milestone-story{margin:0;color:var(--muted-strong);font-size:12px;line-height:1.9}
.persona-milestone.is-latest article{border-color:var(--accent)}
.persona-milestone.is-latest .persona-milestone-dot{box-shadow:0 0 0 4px var(--panel-strong),0 0 0 6px var(--line-strong)}
</style>

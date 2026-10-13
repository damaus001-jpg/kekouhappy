<script setup lang="ts">
import AssistantTimelineCards from './AssistantTimelineCards.vue';
import type { AssistantCard, AssistantMaterial } from '../../electron/assistant-material-types';
defineProps<{cards:AssistantCard[];usedIds:string[]}>();
const emit=defineEmits<{copy:[material:AssistantMaterial]}>();
</script>

<template>
  <section class="persona-journey weekly-schedule-journey" aria-label="一周行程">
    <AssistantTimelineCards :cards="cards" :used-ids="usedIds" @copy="emit('copy',$event)" />
  </section>
</template>

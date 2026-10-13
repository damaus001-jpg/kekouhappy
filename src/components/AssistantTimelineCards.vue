<script setup lang="ts">
import { ref } from 'vue';
import type { AssistantCard, AssistantMaterial } from '../../electron/assistant-material-types';
defineProps<{ cards: AssistantCard[]; usedIds: string[] }>();
const emit=defineEmits<{ copy: [material: AssistantMaterial] }>();
const expanded=ref(new Set<string>());
function toggle(id:string){const next=new Set(expanded.value);next.has(id)?next.delete(id):next.add(id);expanded.value=next;}
</script>
<template>
  <ol class="persona-journey-list">
    <li v-for="card in cards" :key="card.id" class="persona-milestone">
      <span class="persona-milestone-dot" aria-hidden="true"></span>
      <article><p v-if="card.date" class="persona-milestone-date">{{card.date}}</p><h3>{{card.title}}</h3>
        <div v-if="expanded.has(card.id)" class="assistant-card-materials">
          <p v-if="!card.materials.length" class="persona-milestone-story">暂无素材</p>
          <section v-for="material in card.materials" :key="material.id" class="assistant-card-material">
            <p v-if="material.type==='text'" class="persona-milestone-story">{{material.text}}</p>
            <img v-else :src="`app://assistant-media/${material.mediaId}`" :alt="material.name" loading="lazy">
            <button type="button" :class="{'material-used':usedIds.includes(material.id)}" @click="emit('copy',material)">{{usedIds.includes(material.id)?'已使用':'复制'}}</button>
          </section>
        </div>
        <footer class="assistant-card-footer"><button type="button" :aria-expanded="expanded.has(card.id)" @click="toggle(card.id)">{{expanded.has(card.id)?'收起':'展开'}}</button></footer>
      </article>
    </li>
  </ol>
</template>
<style>
.assistant-card-footer{display:flex;justify-content:flex-end;margin-top:12px}
.assistant-card-materials{display:flex;flex-direction:column;gap:12px;margin-top:12px}
.assistant-card-material{display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--panel-strong)}
.assistant-card-material>img{width:100%;max-height:240px;object-fit:contain;border-radius:8px}
.assistant-card-material>button{align-self:flex-end}.assistant-card-material .material-used{color:var(--muted)!important}
.assistant-card-material .persona-milestone-story{white-space:pre-wrap}
</style>

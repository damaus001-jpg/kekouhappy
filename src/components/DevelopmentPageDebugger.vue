<script setup lang="ts">
import { ref } from 'vue';

const address = ref('https://pc.libertyess.com/');
const error = ref('');

async function openPage() {
  error.value = '';
  try {
    await window.chatTranslator.openDebugUrl(address.value);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '调试窗口打开失败';
  }
}
</script>

<template>
  <form class="development-page-debugger" @submit.prevent="openPage">
    <label for="opensms-debug-url">页面调试</label>
    <div class="development-page-debugger-controls">
      <input id="opensms-debug-url" v-model="address" type="url" inputmode="url" placeholder="https://example.com" required />
      <button type="submit">打开调试</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </form>
</template>

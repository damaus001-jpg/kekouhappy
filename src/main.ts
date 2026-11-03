import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { installCustomerExitSaveHandler } from './customer-follow-up-client';

installCustomerExitSaveHandler();
createApp(App).mount('#app');

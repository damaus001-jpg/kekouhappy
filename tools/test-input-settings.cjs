const fs=require('node:fs'),assert=require('node:assert/strict');
for(const name of ['src/App.vue','electron/webview-send-guard-preload.cjs','electron/main.ts','electron/shared.ts']){
 const source=fs.readFileSync(name,'utf8');
 assert.doesNotMatch(source,/inputTriggerSettings|dfInputTrigger|df-input-trigger-v1|input-settings-button|inputSettingsOpen/,'obsolete trigger settings remain in '+name);
}
console.log('Input settings removed; legacy trigger preferences are never read');

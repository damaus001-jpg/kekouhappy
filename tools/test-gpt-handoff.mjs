import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { buildGptClipboardText, handoffChatToGpt, chatGptUrl, gptReplyInstruction } from '../dist-electron/gpt-handoff.js';

const request = {
  profileId: 'test-profile', platform: 'whatsapp',
  messages: Array.from({length:18}, (_, i) => ({speaker: i % 2 ? 'other' : 'self', text: `Message ${i + 1}: how was your day?`})),
  latestSpeaker: 'other', replyCount: 3, outputLanguage: 'en-US', allowSensitiveEcho: false
};
const text = buildGptClipboardText(request);
const transcript = JSON.parse(text.slice(0, text.indexOf('\n\n')));
assert.deepEqual(transcript.messages, request.messages);
assert.equal(transcript.schema_version, 'df.smart_reply.input.v1');
assert.equal(transcript.latest_speaker, 'other');
assert.equal(transcript.reply_count, 3);
assert.equal(transcript.output_language, 'en-US');
assert.equal(transcript.allow_sensitive_echo, false);
assert.ok(text.includes('self 表示我方，other 表示对方'));
assert.ok(text.endsWith('\n\n请结合以上聊天记录，翻译对方的最后两句话并揣摩其中的意思向我用中文表达清楚。并在记忆功能可用时参考你在 ChatGPT 个性化设置中保存的记忆，为我方生成三组自然、符合上下文的美式英文回复。每组附上忠实、简洁的中文释义。不要编造聊天记录中没有的信息，回复长度和语气要适合当前对话。'));
assert.equal(gptReplyInstruction, '请结合以上聊天记录，翻译对方的最后两句话并揣摩其中的意思向我用中文表达清楚。并在记忆功能可用时参考你在 ChatGPT 个性化设置中保存的记忆，为我方生成三组自然、符合上下文的美式英文回复。每组附上忠实、简洁的中文释义。不要编造聊天记录中没有的信息，回复长度和语气要适合当前对话。');

for (const platform of ['whatsapp', 'telegram-a', 'telegram-k', 'signal', 'opensms']) {
  const events = [];
  await handoffChatToGpt({...request, platform}, {
    writeClipboard(value) { events.push(['clipboard', value]); },
    async showPrompt(count) { assert.equal(events[0][0], 'clipboard'); events.push(['prompt', count]); return true; },
    async openExternal(url) { events.push(['browser', url]); }
  });
  assert.deepEqual(events.map(item => item[0]), ['clipboard', 'prompt', 'browser']);
  assert.equal(events[1][1], 18);
  assert.equal(events[2][1], 'https://chatgpt.com/');
  assert.equal(events[0][1], text);
}
const regionalOpenSmsRequest = {
  ...request,
  platform: 'opensms',
  openSmsAreaContext: { areaCode: '213', state: '加利福尼亚州', city: '洛杉矶' }
};
const regionalOpenSmsText = buildGptClipboardText(regionalOpenSmsRequest);
assert.ok(regionalOpenSmsText.startsWith(text), 'OpenSMS area guidance follows the unchanged base transcript and prompt');
assert.ok(regionalOpenSmsText.endsWith('当前识别对方区号是213，位于加利福尼亚州，代表城市是洛杉矶。此地域信息仅可作为话题延展的参考，必须先核对聊天记录是否与该地区一致；若记录不支持或无法确认，请不要提及该地域，也不要据此推断对方实际位置。'));
const { openSmsAreaContext: _ignoredAreaContext, ...genericPlatformRequest } = regionalOpenSmsRequest;
assert.equal(buildGptClipboardText({...genericPlatformRequest, platform: 'whatsapp'}), text, 'area context never changes another platform prompt');
let opened = false;
await handoffChatToGpt(request, {writeClipboard() {}, async showPrompt() {return false;}, async openExternal() {opened = true;}});
assert.equal(opened, false, 'cancel must retain copied text without opening a browser');
assert.equal(chatGptUrl, 'https://chatgpt.com/');
assert.throws(() => buildGptClipboardText({...request, messages: [...request.messages, request.messages.at(-1)]}), /1 to 18/);
assert.throws(() => buildGptClipboardText({...request, messages: [{speaker:'self', text:'Wrong latest side'}]}), /newest/);
assert.throws(() => buildGptClipboardText({...request, messages: Array.from({length:18}, () => ({speaker:'other', text:'a'.repeat(4001)}))}), /message text is invalid/);
const shorter = {...request, messages: [{speaker:'other', text:'A message with a newline\nand "quoted text"'}]};
assert.ok(buildGptClipboardText(shorter).includes('newline\\nand \\"quoted text\\"'));
const main = fs.readFileSync(new URL('../electron/main.ts', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
assert.doesNotMatch(main, /generateSmartRepliesWithDeepSeek|smart-reply:generate/);
assert.doesNotMatch(app, /generateSmartReplies/);
const nativeBranch = main.slice(main.indexOf('async function respondToSignalSmartReplyRequest'), main.indexOf('async function respondToSignalVisibleMessageBatch'));
assert.match(nativeBranch, /copyChatToGpt/);
assert.match(nativeBranch, /signalSmartReplyPendingIsCurrent/);
assert.doesNotMatch(nativeBranch, /fetch\(|loadSmartReplyPrompt|readDevelopmentServiceSecret/);
const production = fs.readFileSync(new URL('../dist-electron/main.js', import.meta.url), 'utf8');
assert.doesNotMatch(production, /generateSmartRepliesWithDeepSeek|smart-reply:generate/);
// Exercise the actual main-process handoff so native dialogs cannot return unnoticed.
const ast=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true);
const handoffFunctions=['showGptHandoffDialog','copyChatToGpt'].map(name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name).getText(ast)).join('\n');
assert.doesNotMatch(handoffFunctions,/dialog\.showMessageBox/);
assert.match(app,/const hasBlockingModal[\s\S]{0,150}activeSensitiveDialog\.value/);
const compiled=ts.transpileModule(handoffFunctions,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
for(const scenario of ['open','later','browser-failed','locked']){
  const events=[];let calls=0;
  const context={workspaceVisibilityGate:{locked:scenario==='locked'},visibleSignalProfileId:'signal-profile',hideAllSignalWindows:()=>events.push('hide-signal'),requestSignalProfilePresentation:id=>{assert.equal(id,'signal-profile');events.push('restore-signal');},showSensitiveSendDialog:async options=>{events.push('theme-dialog');if(calls++===0){assert.equal(options.title,'去GPT');assert.deepEqual(options.buttons,['打开GPT','稍后粘贴']);return{response:scenario==='later'?1:0};}assert.match(options.message,/浏览器打开失败/);return{response:0};},handoffChatToGpt,clipboard:{writeText:value=>{assert.equal(value,text);events.push('clipboard');}},shell:{openExternal:async url=>{assert.equal(url,chatGptUrl);events.push('browser');if(scenario==='browser-failed')throw new Error('simulated');}}};
  const run=new Function('context',`const {${Object.keys(context).join(',')}}=context;let gptHandoffBusy=false;${compiled};return copyChatToGpt;`)(context);
  if(scenario==='locked'){await assert.rejects(run(request),/解锁/);assert.deepEqual(events,[]);continue;}
  await run(request);assert.equal(events[0],'clipboard');assert.equal(events.filter(e=>e==='theme-dialog').length,scenario==='browser-failed'?2:1);assert.equal(events.includes('browser'),scenario!=='later');assert.equal(events.filter(e=>e==='hide-signal').length,events.filter(e=>e==='restore-signal').length);
}
console.log('gpt-handoff: transcript, instruction, all platforms, copy-before-prompt, fixed browser URL, cancel, bounds and removal of paid generation passed');

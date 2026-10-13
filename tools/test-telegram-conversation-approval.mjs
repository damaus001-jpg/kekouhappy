import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {readTelegramConversationIdFromDom} from '../dist-electron/shared.js';
let peer='101',title='Original name';
const root={getAttribute:name=>name==='data-peer-id'?peer:null,querySelector:selector=>selector.includes('header')?{getAttribute:()=>'',querySelector:()=>null,textContent:title}:null};
globalThis.document={querySelectorAll:()=>[root],querySelector:()=>null};
globalThis.location={hash:'#101'};
assert.equal(readTelegramConversationIdFromDom(),'telegram:101');
title='Renamed contact';assert.equal(readTelegramConversationIdFromDom(),'telegram:101');
peer='202';assert.equal(readTelegramConversationIdFromDom(),'telegram:202');
const source=readFileSync('electron/main.ts','utf8');
const parsed=ts.createSourceFile('main.ts',source,ts.ScriptTarget.ES2022,true);
const names=['canonicalSendText','registerApprovedComposerTranslation','authorizeTranslatedSend'];
const functions=parsed.statements.filter(s=>ts.isFunctionDeclaration(s)&&names.includes(s.name?.text));assert.equal(functions.length,3);
const code=ts.transpileModule(functions.map(f=>f.getText(parsed)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const approvals=new Map();const api=new Function('createHash','approvedComposerTranslations','approvedComposerTranslationTtlMs',code+';return {registerApprovedComposerTranslation,authorizeTranslatedSend};')(createHash,approvals,600000);
const request={profileId:'account-A',platform:'telegram-k',reason:'composer-enter',contactId:'telegram:101',from:'Chinese',to:'English'};
api.registerApprovedComposerTranslation(request,'proof','Hello');
const send={profileId:'account-A',platform:'telegram-k',requestId:'proof',conversationSignature:'telegram:101',text:'Hello'};
for(const [change,reasonCode]of [[{conversationSignature:'telegram:202'},'conversation-mismatch'],[{profileId:'account-B'},'profile-mismatch'],[{text:'Changed text'},'text-mismatch'],[{platform:'telegram-a'},'platform-mismatch']]){
  const result=api.authorizeTranslatedSend({...send,...change});assert.equal(result.ok,false);assert.equal(result.reasonCode,reasonCode);assert.ok(approvals.has('proof'));
}
assert.equal(api.authorizeTranslatedSend(send).ok,true);assert.ok(!approvals.has('proof'));
assert.equal(api.authorizeTranslatedSend(send).reasonCode,'approval-missing');
api.registerApprovedComposerTranslation(request,'expired','Hello');approvals.get('expired').expiresAt=0;
assert.equal(api.authorizeTranslatedSend({...send,requestId:'expired'}).reasonCode,'approval-expired');
console.log('telegram-conversation-approval: stable peer survives rename; contact/account/text/platform mismatch blocked without consuming proof; success consumes once; expiry rejected');

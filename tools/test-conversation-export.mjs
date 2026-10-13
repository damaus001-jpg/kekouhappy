import assert from 'node:assert/strict';
import { renderConversationExport } from '../dist-electron/conversation-export-core.js';
const base={profileId:'fixture',platform:'telegram-k',contactId:'telegram:101',contactTitle:'Fixture',mode:'english',coverage:'history-top',coverageNote:'Test history',rows:[
  {id:'1',direction:'incoming',timestamp:'2026-10-12 10:00',originalText:'Hello',chineseText:'你好',mediaLabel:''},
  {id:'2',direction:'outgoing',timestamp:'2026-10-12 10:01',originalText:'How are you?',chineseText:'',mediaLabel:''},
  {id:'3',direction:'incoming',timestamp:'2026-10-12 10:02',originalText:'Bank account: 1234567890123456',chineseText:'银行账号：1234567890123456',mediaLabel:''},
  {id:'4',direction:'outgoing',timestamp:'2026-10-12 10:03',originalText:'',chineseText:'',mediaLabel:'[图片]'}]};
const en=renderConversationExport(base);assert.ok(en.content.includes('Hello'));assert.ok(en.content.includes('How are you?'));assert.ok(!en.content.includes('1234567890123456'));assert.equal(en.redacted,1);assert.equal(en.count,4);
const zh=renderConversationExport({...base,mode:'chinese'});assert.ok(zh.content.includes('你好'));assert.ok(!zh.content.includes('How are you?'));assert.ok(zh.content.includes('[暂无译文]'));assert.equal(zh.missing,1);assert.ok(zh.content.includes('[图片]'));
assert.equal(zh.count,en.count,'missing Chinese translations must not reduce the exported row count');
assert.equal((zh.content.match(/\] (?:对方|我方|身份未识别)\n/g)||[]).length,base.rows.length);
const fiveMissing=renderConversationExport({...base,mode:'chinese',rows:Array.from({length:5},(_,index)=>({...base.rows[1],id:String(index),timestamp:'10:00',originalText:'Untranslated message '+index}))});
assert.equal(fiveMissing.count,5);assert.equal(fiveMissing.missing,5);
assert.equal((fiveMissing.content.match(/\[暂无译文\]/g)||[]).length,5,'all five untranslated messages retain their positions');
const untranslatedSymbols=['123','👍','😂❤️','???','2026/10/12 10:30'];
const symbols=renderConversationExport({...base,mode:'chinese',rows:untranslatedSymbols.map((originalText,index)=>({...base.rows[1],id:String(index),originalText}))});
assert.equal(symbols.count,5);assert.equal(symbols.missing,0,'numbers, emoji and punctuation do not need a Chinese translation');
for(const text of untranslatedSymbols)assert.ok(symbols.content.includes(text),'non-language content must be preserved unchanged');
const needsTranslation=renderConversationExport({...base,mode:'chinese',rows:['Hello','OK','I','مرحبا','こんにちは'].map((originalText,index)=>({...base.rows[1],id:String(index),originalText}))});
assert.equal(needsTranslation.missing,5,'language content without Chinese cache must not be silently treated as translated');
const numericPayment=renderConversationExport({...base,mode:'chinese',rows:[{...base.rows[1],originalText:'1234567890123456'}]});
assert.equal(numericPayment.redacted,1,'preserving symbols must not bypass payment information exclusion');
assert.ok(!numericPayment.content.includes('1234567890123456'));
assert.throws(()=>renderConversationExport({...base,rows:[base.rows[0],base.rows[0]]}),/重复/);
assert.throws(()=>renderConversationExport({...base,rows:[{...base.rows[0],originalText:'a'.repeat(32001)}]}),/过长/);
console.log('conversation-export: both parties, English/Chinese, missing-cache placeholder, media marker, payment exclusion, and validation passed');

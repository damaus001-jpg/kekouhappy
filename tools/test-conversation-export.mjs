import assert from 'node:assert/strict';
import { renderConversationExport } from '../dist-electron/conversation-export-core.js';
import { conversationExportDay,localConversationExportDate } from '../dist-electron/conversation-export-dates.js';
const base={profileId:'fixture',platform:'telegram-k',contactId:'telegram:101',contactTitle:'Fixture',mode:'english',coverage:'history-top',coverageNote:'Test history',rows:[
  {id:'1',direction:'incoming',timestamp:'2026-10-12 10:00',originalText:'Hello',chineseText:'你好',mediaLabel:''},
  {id:'2',direction:'outgoing',timestamp:'2026-10-12 10:01',originalText:'How are you?',chineseText:'',mediaLabel:''},
  {id:'3',direction:'incoming',timestamp:'2026-10-12 10:02',originalText:'Bank account: 1234567890123456',chineseText:'银行账号：1234567890123456',mediaLabel:''},
  {id:'4',direction:'outgoing',timestamp:'2026-10-12 10:03',originalText:'',chineseText:'',mediaLabel:'[图片]'}]};
const en=renderConversationExport(base);assert.ok(en.content.includes('Hello'));assert.ok(en.content.includes('How are you?'));assert.ok(!en.content.includes('1234567890123456'));assert.equal(en.redacted,1);assert.equal(en.count,4);
const zh=renderConversationExport({...base,mode:'chinese'});assert.ok(zh.content.includes('你好'));assert.ok(!zh.content.includes('How are you?'));assert.ok(zh.content.includes('[暂无译文]'));assert.equal(zh.missing,1);assert.ok(zh.content.includes('[图片]'));
assert.equal(zh.count,en.count,'missing Chinese translations must not reduce the exported row count');
assert.equal((zh.content.match(/^(?:对方|我方)：/gm)||[]).length,base.rows.length);
assert.ok(en.content.includes('对方：Hello\n\n我方：How are you?'));
for(const content of [en.content,zh.content]){assert.ok(content.startsWith('\uFEFF2026-10-12\n\n\n对方：'));assert.doesNotMatch(content,/10:0[0-3]|当前会话导出|平台：|联系人：|记录数：|范围：|导出时间/);}
assert.throws(()=>renderConversationExport({...base,rows:[{...base.rows[0],direction:'unknown'}]}),/无法识别发送方/);
for(const mode of ['english','chinese']){
  const grouped=renderConversationExport({...base,mode,rows:[
    {...base.rows[0],timestamp:'2026-10-14 23:58'},
    {...base.rows[1],timestamp:'2026-10-14 23:59'},
    {...base.rows[0],id:'day2',timestamp:'2026-10-15 00:01'},
    {...base.rows[0],id:'day3',timestamp:'2026-10-16 00:01'}]});
  for(const day of ['2026-10-14','2026-10-15','2026-10-16']){
    assert.equal(grouped.content.split(day).length-1,1,'one heading per consecutive day');
    if(day==='2026-10-14')assert.ok(grouped.content.startsWith('\uFEFF'+day+'\n\n\n'));
    else assert.ok(grouped.content.includes('\n'.repeat(6)+day+'\n'.repeat(3)),'five blank lines before and two after each following date');
  }
  assert.doesNotMatch(grouped.content,/23:58|23:59|00:01|导出时间/);
  assert.equal((grouped.content.match(/^(?:对方|我方)：/gm)||[]).length,4);
}
const unknownDate=renderConversationExport({...base,rows:[base.rows[0],{...base.rows[1],timestamp:''},{...base.rows[0],id:'next',timestamp:'2026-10-13 00:01'}]});
assert.match(unknownDate.content,/\n\n\n日期未提供\n\n\n我方：/);
for(const timestamps of [
  ['2026-10-14T13:00:00Z','2026-10-15T13:00:00Z'],
  ['2026年10月14日 23:59','2026年10月15日 00:01'],
  ['October 14, 2026 23:59','15 October 2026 00:01'],
  ['23:59, 10/14/2026','00:01, 10/15/2026']
]){
  const result=renderConversationExport({...base,rows:timestamps.map((timestamp,i)=>({...base.rows[i],timestamp}))});
  assert.equal((result.content.replace(/^\uFEFF/,'').match(/^\d{4}-\d{2}-\d{2}$/gm)||[]).length,2,'platform date formats create two daily headings');
  assert.doesNotMatch(result.content,/23:59|00:01/);
}
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
for(const mode of ['english','chinese']){
  const today=renderConversationExport({...base,mode,scope:'today',exportDate:'2026-10-12',rows:[{...base.rows[1],timestamp:'2026-10-11 23:59'},base.rows[0],{...base.rows[1],id:'today-out',timestamp:'2026-10-12 23:59'},{...base.rows[2],timestamp:'2026-10-13 00:00'}]});
  assert.equal(today.count,2);assert.equal(today.redacted,0);assert.equal(today.missing,mode==='chinese'?1:0);assert.doesNotMatch(today.content,/2026-10-11|2026-10-13/);
}
assert.throws(()=>renderConversationExport({...base,scope:'today',exportDate:'2026-10-13'}),/当天没有/);
assert.throws(()=>renderConversationExport({...base,scope:'today',exportDate:'2026-10-12',rows:[{...base.rows[0],timestamp:'10:00'}]}),/日期无法识别/);
const regrouped=renderConversationExport({...base,rows:[base.rows[0],{...base.rows[1],timestamp:'2026-10-13'}, {...base.rows[0],id:'repeat-day'}]});assert.equal((regrouped.content.replace(/^\uFEFF/,'').match(/^2026-10-12$/gm)||[]).length,1,'each date appears once even for nonconsecutive rows');
assert.equal(conversationExportDay('11/10/2026','','dmy'),'2026-10-11');assert.equal(conversationExportDay('11/10/2026','','mdy'),'2026-11-10');assert.equal(conversationExportDay('2026-02-30'),'');assert.equal(conversationExportDay('Today','2026-10-26'),'2026-10-26');assert.equal(conversationExportDay('Yesterday','2026-01-01'),'2025-12-31');
assert.equal(conversationExportDay('2026-10-26T00:30:00Z'),localConversationExportDate(new Date('2026-10-26T00:30:00Z')),'offset timestamps use the computer local day');
console.log('conversation-export: both parties, English/Chinese, missing-cache placeholder, media marker, payment exclusion, and validation passed');

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
assert.equal((zh.content.match(/^(?:对方|我方)：/gm)||[]).length,base.rows.length);
assert.ok(en.content.includes('对方：Hello\n\n我方：How are you?'));
assert.doesNotMatch(en.content,/2026-10-12|10:0[0-3]|导出时间|时间未提供/);
assert.doesNotMatch(zh.content,/2026-10-12|10:0[0-3]|导出时间|时间未提供/);
assert.throws(()=>renderConversationExport({...base,rows:[{...base.rows[0],direction:'unknown'}]}),/无法识别发送方/);
for(const mode of ['english','chinese']){
  const grouped=renderConversationExport({...base,mode,rows:[
    {...base.rows[0],timestamp:'2026-10-14 23:58'},
    {...base.rows[1],timestamp:'2026-10-14 23:59'},
    {...base.rows[0],id:'day2',timestamp:'2026-10-15 00:01'},
    {...base.rows[0],id:'day3',timestamp:'2026-10-16 00:01'}]});
  for(const day of ['2026-10-14','2026-10-15','2026-10-16']){
    assert.equal(grouped.content.split(day).length-1,1,'one heading per consecutive day');
    assert.ok(grouped.content.includes('\n\n\n'+day+'\n\n\n'),'two blank lines before and after date');
  }
  assert.doesNotMatch(grouped.content,/23:58|23:59|00:01|导出时间/);
  assert.equal((grouped.content.match(/^(?:对方|我方)：/gm)||[]).length,4);
}
const unknownDate=renderConversationExport({...base,rows:[base.rows[0],{...base.rows[1],timestamp:''},{...base.rows[0],id:'next',timestamp:'2026-10-13 00:01'}]});
assert.match(unknownDate.content,/\n\n\n日期未提供\n\n\n我方：/);
for(const timestamps of [
  ['2026-10-14T23:59:00Z','2026-10-15T00:01:00Z'],
  ['2026年10月14日 23:59','2026年10月15日 00:01'],
  ['October 14, 2026 23:59','15 October 2026 00:01'],
  ['23:59, 10/14/2026','00:01, 10/15/2026']
]){
  const result=renderConversationExport({...base,rows:timestamps.map((timestamp,i)=>({...base.rows[i],timestamp}))});
  assert.equal((result.content.match(/\n\n\n[^\n]+\n\n\n/g)||[]).length,2,'platform date formats create two daily headings');
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
console.log('conversation-export: both parties, English/Chinese, missing-cache placeholder, media marker, payment exclusion, and validation passed');

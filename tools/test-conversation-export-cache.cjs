const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../electron/main.ts'),'utf8');
const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
const extract=name=>{const node=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(node,name);return node.getText(ast);};
const calls=[];
const ctx={lookupTranslationCache:async request=>{
  calls.push(request);
  const entry=(sourceText,fields={})=>({sourceText,translatedText:'中文缓存',platform:'telegram-k',direction:'incoming',messagePart:'body',updatedAt:1,contactId:'777',contactIdType:'platform',contactTitle:'Fixture',...fields});
  if(request.contactIdType==='title')return [
    entry('Hello',{contactId:'legacy-title',contactIdType:'title'}),
    entry('Quoted',{contactId:'legacy-title',contactIdType:'title',messagePart:'quote'}),
    entry('Other platform',{contactId:'legacy-title',contactIdType:'title',platform:'whatsapp'}),
    entry('Wrong direction',{contactId:'legacy-title',contactIdType:'title',direction:'outgoing'})
  ];
  if(request.contactId==='101')return [entry('Stable',{contactId:'101'})];
  return [entry('Hello'),entry('Stable')];
}};
vm.createContext(ctx);
vm.runInContext(ts.transpileModule(extract('hashForLog')+'\n'+extract('hydrateConversationExportChineseCache'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
async function main(){
  const request={profileId:'fixture',platform:'telegram-k',contactId:'telegram:101',contactTitle:'Fixture',rows:['Hello','Stable','Quoted','Other platform','Wrong direction','No cache','Inline'].map((text,index)=>({id:String(index),originalText:text,chineseText:text==='Inline'?'已有译文':'',direction:'incoming'}))};
  await ctx.hydrateConversationExportChineseCache(request);
  assert.equal(request.rows.length,7,'cache filling never removes rows');
  assert.equal(request.rows[0].chineseText,'中文缓存','legacy title scope recovers cache masked by another contact in global lookup');
  assert.equal(request.rows[1].chineseText,'中文缓存','raw stable platform scope is read');
  for(const row of request.rows.slice(2,6))assert.equal(row.chineseText,'','quotes, other platforms, wrong directions and missing cache stay unfilled');
  assert.equal(request.rows[6].chineseText,'已有译文');
  assert.ok(calls.some(request=>request.contactIdType==='title'));
  assert.ok(calls.every(request=>request.profileId==='fixture'&&request.platform==='telegram-k'&&request.sourceHashes.length<=200));
  console.log('Export Chinese cache: raw stable IDs, legacy title scopes, same-name different contact rejection, inline preservation, quote/platform/direction guards and unchanged row count passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});

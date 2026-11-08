const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),directory=fs.mkdtempSync(path.join(root,'.tmp','usage-isolation-'));
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const identity=new Function('exports',compile('electron/assistant-material-identity.ts')+';return exports;')({});
const electron={app:{getPath:()=>directory},clipboard:{writeText(){}},safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()}};
const store=new Function('exports','require',compile('electron/assistant-material-store.ts')+';return exports;')({},name=>name==='electron'?electron:name==='./assistant-material-identity.js'?identity:name==='./assistant-library.js'?{}:require(name));
const runtime=new Function('exports','require',compile('src/assistant-material-runtime.ts')+';return exports;')({},()=>identity);
(async()=>{
 const folder=path.join(directory,'assistant-library');fs.mkdirSync(folder);
 const records=Array.from({length:1820},(_,i)=>({profileId:'old-android',platform:'opensms',phone:'+12135551212',contactId:'sms:old:chat',contactTitle:'Receiver',materialId:'material-'+i,usedAt:'now',confirmation:'inserted',actualText:'x'.repeat(400)}));
 records.push({profileId:'apple-a',platform:'apple',phone:'+12135551212',contactId:'apple:a:b:%2B12135551212',contactTitle:'Receiver',materialId:'apple-only',usedAt:'now',confirmation:'inserted'});
 records.push({profileId:'signal-a',platform:'signal',contactId:'signal:11111111-1111-4111-8111-111111111111',contactTitle:'Receiver',materialId:'signal-only',usedAt:'now',confirmation:'inserted'});
 const original=Buffer.from(JSON.stringify({schemaVersion:1,records})),legacy=path.join(folder,'usage.enc');fs.writeFileSync(legacy,original);
 const command=usages=>({command:'install',config:{platform:'signal',catalog:{persona:[],schedule:[],quotes:[]},colors:{},icon:'',usages,enabled:true}});
 assert.ok(runtime.buildAssistantRuntimeScript(command(records)).length>900*1024,'legacy cross-platform payload reproduces the rejected Signal install');
 const signal=await store.readAssistantUsage('signal-a',undefined,'signal');assert.deepEqual(signal.map(r=>r.materialId),['signal-only']);
 assert.ok(runtime.buildAssistantRuntimeScript(command(signal)).length<900*1024,'Signal install remains within the IPC limit with large Android history');
 const apple=await store.readAssistantUsage('new-apple',undefined,'apple');assert.equal(apple.length,1);assert.equal(apple[0].platform,'apple');
 const android=await store.readAssistantUsage('new-android',undefined,'opensms');assert.equal(android.length,1820);assert.ok(android.every(r=>r.platform==='opensms'));
 assert.equal((await store.readAssistantUsage('new-whatsapp',undefined,'whatsapp')).length,0);
 for(const platform of ['signal','apple','opensms','whatsapp']){
  const persisted=JSON.parse(fs.readFileSync(path.join(folder,`usage-${platform}.enc`),'utf8'));assert.ok(persisted.records.every(r=>r.platform===platform));
 }
 assert.ok(fs.readFileSync(legacy).equals(original),'migration preserves the original encrypted history');
 await store.removeAssistantUsageForProfile('signal-a');assert.equal((await store.readAssistantUsage('signal-a',undefined,'signal')).length,0,'cleared records are never restored from the legacy file');
 assert.equal((await store.readAssistantUsage('new-android',undefined,'opensms')).length,1820,'Signal cleanup cannot remove Android history');
 console.log('assistant-platform-isolation: legacy Signal overflow reproduced; independent encrypted platform files, migration, no reimport and account cleanup passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

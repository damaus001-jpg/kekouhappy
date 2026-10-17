import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../src/App.vue',import.meta.url),'utf8');
const fragment=source.slice(source.indexOf('async function copyAssistantMaterial('),source.indexOf('function assistantLibraryChanged('));
const code=ts.transpileModule(fragment,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const ref=value=>({value});
async function scenario(options={}){
  const calls=[];
  const material={id:'schedule:card:text:v:content-version',type:'text',text:'Whole card text'};
  const target={id:'wa:15550000001@c.us',title:'Contact A'};
  const env={assistantCopyBusy:ref(false),assistantCopyStatus:ref(''),profiles:ref([{id:'fixture-profile',platform:'whatsapp'}]),signedIn:ref(true),hasBlockingModal:ref(false),activeProfileId:ref('fixture-profile'),lockScreenVisible:ref(false),activePanel:ref('session'),assistantContacts:ref({}),assistantUsages:ref({'fixture-profile':[]}),
    readAssistantCatalog:async()=>({schedule:options.missingMaterial?[]:[{materials:[material]}],quotes:[]}),installAssistantMaterialRuntime:async()=>{},buildAssistantRuntimeScript:value=>value,appForPlatform:()=> 'whatsapp',syncAssistantPending:async(_id,pending)=>{calls.push(['clear',pending]);},
    window:{chatTranslator:{
      stageAssistantMaterial:async value=>{calls.push(['copy',value]);if(options.stageFailure)throw new Error('Clipboard failed');if(options.switchAccount)env.activeProfileId.value='another-profile';return{...value,token:'fixture-token'};},
      recordAssistantUse:async value=>{calls.push(['record',value]);if(options.recordFailure)throw new Error('Save failed');return{...value,materialId:material.id,usedAt:'now'};}
    }}
  };
  let contacts=0;
  env.executeProfileScript=async(_id,command)=>{
    if(command.command==='confirm'){calls.push(['confirm']);return true;}
    if(command.command==='confirmation-status')return options.cancel?{status:'cancelled'}:{status:'inserted',contactId:target.id,actualText:'Edited text'};
    if(command.command==='contact'){contacts++;return options.noContact?{id:'',title:''}:contacts>1&&options.switchContact?{id:'wa:15550000002@c.us',title:'Contact B'}:{...target,title:contacts>1?'Renamed A':target.title};}
    return true;
  };
  const names=Object.keys(env);
  const copy=new Function('env',`const {${names.join(',')}}=env;\n${code}\nreturn copyAssistantMaterial;`)(env);
  await copy(material);
  assert.equal(env.assistantCopyBusy.value,false);
  assert.deepEqual(calls.at(-1),['clear',null]);
  return {calls,env,target};
}
let result=await scenario();
assert.deepEqual(result.calls.map(c=>c[0]),['copy','confirm','record','clear']);
assert.equal(result.calls[2][1].contactId,result.target.id);
assert.equal(result.calls[2][1].contactTitle,'Contact A');
assert.equal(result.calls[2][1].actualText,'Edited text');
assert.equal(result.env.assistantUsages.value['fixture-profile'].length,1);
for(const options of [{cancel:true},{switchContact:true},{switchAccount:true},{noContact:true},{missingMaterial:true},{stageFailure:true}]){
  result=await scenario(options);assert.ok(!result.calls.some(c=>c[0]==='record'),'invalid or changed conversation must not receive a usage record');
  assert.equal(result.env.assistantUsages.value['fixture-profile'].length,0);
}
result=await scenario({recordFailure:true});assert.equal(result.env.assistantUsages.value['fixture-profile'].length,0);assert.match(result.env.assistantCopyStatus.value,/已粘贴，但未记录/);
assert.doesNotMatch(fragment,/writeNativeComposer|sendNativeComposer|fetch\(|translate\(/);
console.log('custom-assistant-copy: actual App handler confirmation/insertion before recording, cancellation, frozen contact/account, and persistence failures passed');

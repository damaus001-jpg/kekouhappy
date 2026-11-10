import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {generateSuiteKeyPair} from '../dist-electron/license-core.js';
import {filterBusinessPublicIdentity,issueFilterBusinessCode} from '../dist-electron/filter-business-license.js';
import {WhatsAppFilterLauncher,resolveWhatsAppFilterLaunch} from '../dist-electron/whatsapp-filter-launcher.js';
const require=createRequire(import.meta.url);
const {BusinessAccess}=require('../.package-staging/whatsapp-number-filter/app/business-access.cjs');
const {connectLauncher,launchEnvironment}=require('../apps/whatsapp-number-filter/launcher-bridge.cjs');
const root=path.resolve('.tmp/whatsapp-filter-integration');fs.mkdirSync(root,{recursive:true});
const temp=fs.mkdtempSync(path.join(root,'case-'));
const developmentExe=path.join(temp,'.package-staging/whatsapp-filter-runtime/whatsapp-number-filter.exe');
const developmentProfile=path.join(temp,'.package-staging/whatsapp-number-filter/app/filter-license-public.json');
const launchOptions={packaged:false,resourcesPath:path.join(temp,'resources'),workspaceRoot:temp,expected:{suiteId:'000000000',keyId:'k_000000000_dev',hardwareHash:'a'.repeat(64)},theme:'pink'};
assert.throws(()=>resolveWhatsAppFilterLaunch(launchOptions),/尚未准备好/);
fs.mkdirSync(path.dirname(developmentExe),{recursive:true});fs.writeFileSync(developmentExe,'fixture');
fs.mkdirSync(path.dirname(developmentProfile),{recursive:true});fs.writeFileSync(developmentProfile,JSON.stringify({suiteId:'572987197',keyId:'k_572987197_fixture'}));
const developmentLaunch=resolveWhatsAppFilterLaunch(launchOptions);
assert.equal(developmentLaunch.grant.suiteId,'572987197','development uses the filter delivery suite instead of the development translator suite');
assert.equal(developmentLaunch.grant.hardwareHash,'a'.repeat(64));
const packagedExe=path.join(temp,'resources/whatsapp-filter/whatsapp-number-filter.exe');
fs.mkdirSync(path.dirname(packagedExe),{recursive:true});fs.writeFileSync(packagedExe,'fixture');
assert.equal(resolveWhatsAppFilterLaunch({...launchOptions,packaged:true}).grant.suiteId,'000000000','packaged clients never replace their suite from development files');
const suite=generateSuiteKeyPair('123456789'),identity=filterBusinessPublicIdentity(suite);
let now=1000000;
const options={identity,hardwareHash:'a'.repeat(64),files:[path.join(temp,'guard/state'),path.join(temp,'profile/state')],protect:text=>Buffer.from(text),unprotect:buffer=>buffer.toString(),now:()=>now};
let access=new BusinessAccess(options);
const initial=access.status().machineCode;
assert.equal(access.status().trialsRemaining,3);
for(let remaining=2;remaining>=0;remaining--){access.consumeExport();access=new BusinessAccess(options);assert.equal(access.status().trialsRemaining,remaining);assert.equal(access.status().machineCode,initial);}
assert.throws(()=>access.consumeExport(),/试用已用完/);
fs.unlinkSync(options.files[1]);access=new BusinessAccess(options);assert.equal(access.status().trialsRemaining,0,'removing one copy cannot reset trial count');
const issued=issueFilterBusinessCode(suite,initial);
const wrong=String((Number(issued.authorizationCode)+1)%10000).padStart(4,'0');
for(let i=0;i<5;i++)assert.throws(()=>access.activate(wrong),/业务授权码无效/);
access=new BusinessAccess(options);assert.throws(()=>access.activate(issued.authorizationCode),/尝试过多/);
now+=60001;access.activate(issued.authorizationCode);access=new BusinessAccess(options);
assert.equal(access.status().activated,true);access.consumeExport();assert.equal(access.status().trialsRemaining,0,'licensed export does not change trial history');
fs.writeFileSync(options.files[0],'broken');fs.writeFileSync(options.files[1],'broken');access=new BusinessAccess(options);assert.equal(access.status().trialsRemaining,0,'damaged state fails closed');
assert.equal(launchEnvironment({WNF_SMOKE:'1'}),null,'development smoke flag is not a launch ticket');
await assert.rejects(connectLauncher(null,()=>{}),/从皮卡丘/);
const messages=[];let childConnection;let focusVisible=true;
const launcher=new WhatsAppFilterLauncher((_exe,_args,options)=>{
 assert.equal(options.windowsHide,false,'interactive filter must not be launched with SW_HIDE');
 const child=new EventEmitter();child.unref=()=>{};
 setTimeout(async()=>{
  try{
   childConnection=await connectLauncher(launchEnvironment(options.env),message=>{messages.push(message);if(message.type==='focus')childConnection.socket.write(JSON.stringify({type:'focus-applied',requestId:message.requestId,visible:focusVisible})+'\n');});
   assert.equal(childConnection.grant.hardwareHash,'a'.repeat(64));
   childConnection.socket.write('{"type":"ready","visible":true}\n');
  }catch(error){child.emit('error',error);}
 },5);
 return child;
});
try{
 await launcher.open('fixture.exe',{theme:'pink',suiteId:suite.suiteId,keyId:suite.keyId,hardwareHash:'a'.repeat(64)});
 assert.equal(childConnection.grant.theme,'pink');
 for(const theme of ['blackGold','murongPurple','clearWaterBlue','pink'])launcher.setTheme(theme);
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.deepEqual(messages.filter(m=>m.type==='theme').map(m=>m.theme),['blackGold','murongPurple','clearWaterBlue','pink']);
 await launcher.open('fixture.exe',{theme:'pink',suiteId:suite.suiteId,keyId:suite.keyId,hardwareHash:'a'.repeat(64)});
 await new Promise(resolve=>setTimeout(resolve,30));assert.ok(messages.some(m=>m.type==='focus'),'second click focuses existing filter');
 focusVisible=false;
 await assert.rejects(launcher.open('fixture.exe',{theme:'pink',suiteId:suite.suiteId,keyId:suite.keyId,hardwareHash:'a'.repeat(64)}),/窗口未成功显示/,'connected process alone is not proof of a visible window');
}finally{launcher.dispose();childConnection?.socket.destroy();}
if(!path.resolve(temp).startsWith(root+path.sep))throw new Error('Unsafe cleanup');
fs.rmSync(temp,{recursive:true,force:true});
console.log('whatsapp-filter-integration: authenticated launch, four-theme live bridge, existing-window focus, persistent three-export trials, cooldown, same-suite activation and corrupt-state protection passed');

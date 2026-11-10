import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {WhatsAppFilterLauncher} from '../dist-electron/whatsapp-filter-launcher.js';
const root=path.resolve('.');
const temp=fs.mkdtempSync(path.join(root,'.tmp/filter-visible-'));
const runtimeRoot=path.resolve(process.argv[2]||'.package-staging/whatsapp-filter-runtime');
const asar=(await import('@electron/asar')).default||await import('@electron/asar');
const profile=JSON.parse(asar.extractFile(path.join(runtimeRoot,'resources/app.asar'),'filter-license-public.json').toString('utf8'));
const hardwareHash=randomBytes(32).toString('hex');
const guard=path.join(process.env.APPDATA,'maoyi Security',profile.suiteId,'whatsapp-filter-'+hardwareHash.slice(0,16)+'.dat');
assert.equal(fs.existsSync(guard),false,'isolated random guard must not touch existing data');
let child;
const launcher=new WhatsAppFilterLauncher((executable,args,options)=>{
 child=spawn(executable,args,{...options,env:{...options.env,WNF_USER_DATA_DIR:path.join(temp,'user-data')}});return child;
});
const grant={suiteId:profile.suiteId,keyId:profile.keyId,hardwareHash,theme:'blackGold'};
function probe(minimize=false){return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-File',path.join(root,'tools/probe-whatsapp-filter-window.ps1'),'-TargetProcessId',String(child.pid),...(minimize?['-Minimize']:[])],{encoding:'utf8',windowsHide:true}));}
try{
 await launcher.open(path.join(runtimeRoot,'whatsapp-number-filter.exe'),grant);
 const initial=probe();assert.ok(initial.some(window=>window.visible&&window.enabled&&!window.minimized),'real Windows window must be visible, enabled and restored');
 assert.ok(probe(true).some(window=>window.minimized),'minimize only the isolated test window');
 await launcher.open(path.join(runtimeRoot,'whatsapp-number-filter.exe'),grant);
 const restored=probe();assert.ok(restored.some(window=>window.visible&&window.enabled&&!window.minimized),'clicking the entry restores the existing minimized window');
 fs.writeFileSync(path.join(temp,'verification.json'),JSON.stringify({passed:true,initial,restored,temporaryProfile:true,realAccountUsed:false},null,2)+'\n');
 console.log('filter-visible-runtime: real EXE has a visible enabled Windows window and entry restores it after minimize; isolated profile, no real account used');
}finally{
 launcher.dispose();
 if(child?.pid){try{execFileSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}}
 if(fs.existsSync(guard))fs.unlinkSync(guard);
}

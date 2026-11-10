const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const net=require('node:net');
const asar=require('@electron/asar');
const {getCurrentFuseWire,FuseV1Options:F,FuseState}=require('@electron/fuses');
const root=path.resolve(__dirname,'../..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function hash(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex').toUpperCase();}
async function evaluate(target,expression){
 const ws=new WebSocket(target.webSocketDebuggerUrl);
 try{
  await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
  return await new Promise((r,j)=>{const t=setTimeout(()=>j(new Error('CDP timeout')),5000);ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id!==1)return;clearTimeout(t);if(m.result?.exceptionDetails)j(new Error('UI evaluation failed'));else r(m.result?.result?.value);});ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));});
 }finally{ws.close();}
}
(async()=>{
 const output=path.resolve(process.argv[2]||path.join(root,'release/whatsapp-number-filter/0.0.1-ui'));
 const executable=path.join(output,'win-unpacked/whatsapp-number-filter.exe');
 const archive=path.join(output,'win-unpacked/resources/app.asar');
 const installer=path.join(output,'Whatsapp-Number-Filter-0.0.1-Setup.exe');
 const source=path.join(root,'.package-staging/whatsapp-number-filter/app');
 const entries=(await asar.listPackage(archive)).map(x=>x.replace(/^[/\\]/,'').replaceAll('\\','/'));
 const expected=['package.json','main.cjs','preload.cjs','data.cjs','permissions.cjs','launcher-bridge.cjs','business-access.cjs','business-crypto.cjs','filter-license-public.json','page.cjs','index.html','styles.css','compact.css','themes.css','brand.png','renderer.js','icon.ico'];
 if(entries.length!==expected.length||entries.some(e=>!expected.includes(e)))throw new Error('Unexpected files in independent package: '+JSON.stringify(entries));
 for(const name of expected)if(!Buffer.from(await asar.extractFile(archive,path.normalize(name))).equals(fs.readFileSync(path.join(source,name))))throw new Error('Packaged source mismatch: '+name);
 const metadata=JSON.parse(Buffer.from(await asar.extractFile(archive,'package.json')).toString('utf8'));if(metadata.name!=='whatsapp-number-filter'||metadata.version!=='0.0.1')throw new Error('Wrong independent app/version');
 const fuse=await getCurrentFuseWire(executable);
 for(const [key,value]of [[F.RunAsNode,FuseState.DISABLE],[F.EnableNodeOptionsEnvironmentVariable,FuseState.DISABLE],[F.EnableNodeCliInspectArguments,FuseState.DISABLE],[F.OnlyLoadAppFromAsar,FuseState.ENABLE],[F.EnableEmbeddedAsarIntegrityValidation,FuseState.ENABLE]])if(fuse[key]!==value)throw new Error('Electron fuse mismatch: '+key);
 const temp=path.join(root,'.tmp/wnf-packaged-startup-'+Date.now());fs.mkdirSync(temp,{recursive:true});const env={...process.env,WNF_STARTUP_CHECK:'1',WNF_USER_DATA_DIR:path.join(temp,'user-data')};delete env.ELECTRON_RUN_AS_NODE;delete env.WNF_SMOKE;
 const identity=JSON.parse(asar.extractFile(archive,'filter-license-public.json').toString());
 const hardwareHash=crypto.randomBytes(32).toString('hex');
 const guardFile=path.resolve(process.env.APPDATA,'maoyi Security',identity.suiteId,'whatsapp-filter-'+hardwareHash.slice(0,16)+'.dat');
 if(fs.existsSync(guardFile))throw new Error('Test guard path already exists');
 const pipe='\\\\.\\pipe\\pikachu-filter-'+crypto.randomBytes(16).toString('hex'),token=crypto.randomBytes(32).toString('hex');
 env.PIKACHU_FILTER_PIPE=pipe;env.PIKACHU_FILTER_TOKEN=token;
 const sockets=new Set();
 const server=net.createServer(socket=>{sockets.add(socket);let data='';socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.on('data',chunk=>{data+=chunk.toString();if(data.length>8192){socket.destroy();return;}const end=data.indexOf('\n');if(end<0)return;try{const hello=JSON.parse(data.slice(0,end));data='';if(hello.type==='hello'&&hello.token===token)socket.write(JSON.stringify({type:'welcome',theme:'blackGold',suiteId:identity.suiteId,keyId:identity.keyId,hardwareHash})+'\n');}catch{socket.destroy();}});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
 const log=fs.openSync(path.join(temp,'startup.log'),'a');
 const child=spawn(executable,['--remote-debugging-address=127.0.0.1','--remote-debugging-port=9341'],{env,windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);
 let ui;
 try{
  for(let i=0;i<60;i++){
   if(child.exitCode!==null)throw new Error('Packaged program exited: '+child.exitCode);
   try{
    const targets=await(await fetch('http://127.0.0.1:9341/json',{signal:AbortSignal.timeout(500)})).json();
    const target=targets.find(t=>t.type==='page'&&t.url==='app://number-filter/index.html');
    if(target){ui=await evaluate(target,'({title:document.title,bridge:typeof window.numberFilter?.importTxt,txtImport:document.getElementById("import")?.textContent,txtExport:document.getElementById("export")?.textContent,headerFits:document.documentElement.scrollWidth<=innerWidth})');if(ui.bridge==='function'&&ui.txtImport&&ui.txtExport)break;}
   }catch{}
   await pause(250);
  }
  if(!ui||ui.bridge!=='function'||!ui.headerFits)throw new Error('Packaged UI/preload did not start correctly');
  await pause(1500);if(child.exitCode!==null)throw new Error('Packaged program exited after startup');
 }finally{if(child.exitCode===null){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{child.kill();}}for(const socket of sockets)socket.destroy();server.close();if(fs.existsSync(guardFile))fs.unlinkSync(guardFile);}
 const runtimeOnly=process.argv.includes('--runtime-only');
 const report={version:metadata.version,checkedAt:new Date().toISOString(),installerBytes:runtimeOnly?null:fs.statSync(installer).size,installerSha256:runtimeOnly?null:await hash(installer),asarSha256:await hash(archive),currentBuildFilesMatch:expected,isolatedPackagedStartup:true,preloadIpcBridgePresent:true,independentAppData:true,noAccountDataPackaged:true,txtOnlyExport:true,electronFusesVerified:true,pikachuLauncherHandshake:true,ui};
 fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});

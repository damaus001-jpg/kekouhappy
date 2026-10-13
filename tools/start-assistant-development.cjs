const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createConnection}=require('node:net');
const root=path.resolve(__dirname,'..');
const logDirectory=path.join(root,'.tmp','assistant-development');
fs.mkdirSync(logDirectory,{recursive:true});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const portOpen=()=>new Promise(resolve=>{const socket=createConnection({host:'127.0.0.1',port:5173});const finish=value=>{socket.destroy();resolve(value);};socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.setTimeout(800,()=>finish(false));});
async function main(){
  if(await portOpen())throw new Error('5173端口已有服务，请先关闭原开发服务再启动。');
  const log=fs.openSync(path.join(logDirectory,'vite.log'),'a');
  const vite=spawn(process.execPath,[path.join(root,'node_modules','vite','bin','vite.js'),'--host','127.0.0.1'],{cwd:root,windowsHide:true,stdio:['ignore',log,log]});fs.closeSync(log);
  let client;
  process.on('exit',()=>{vite.kill();client?.kill();});
  try{
    let ready=false;
    for(let i=0;i<80;i++){if(await portOpen()){ready=true;break;}await pause(250);}
    if(!ready)throw new Error('开发页面启动失败，请查看.tmp/assistant-development/vite.log');
    client=spawn(process.execPath,[path.join(root,'tools','start-translation-diagnostics.cjs'),'--live',...(process.argv.includes('--inspect')?['--inspect']:[])],{cwd:root,windowsHide:true,stdio:'inherit'});
    client.on('error',error=>{console.error(error.message);process.exit(1);});
    client.on('exit',code=>process.exit(code||0));
    console.log('小智开发版已启动：页面修改实时更新；主进程修改需要重启。');
  }catch(error){vite.kill();throw error;}
}
main().catch(error=>{console.error(error.message);process.exit(1);});

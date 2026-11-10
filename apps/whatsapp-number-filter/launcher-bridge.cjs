const net=require('node:net');
const themes=new Set(['blackGold','pink','murongPurple','clearWaterBlue']);
function launchEnvironment(env=process.env){
 const pipe=env.PIKACHU_FILTER_PIPE,token=env.PIKACHU_FILTER_TOKEN;
 if(typeof pipe!=='string'||!/^\\\\\.\\pipe\\pikachu-filter-[a-f0-9]{32}$/.test(pipe)||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
 return {pipe,token};
}
function connectLauncher(info,onMessage){
 if(!info||!launchEnvironment({PIKACHU_FILTER_PIPE:info.pipe,PIKACHU_FILTER_TOKEN:info.token}))return Promise.reject(new Error('请从皮卡丘翻译器打开号码筛选'));
 return new Promise((resolve,reject)=>{
  const socket=net.connect(info.pipe);let buffer='',welcomed=false,welcome=null;
  const timer=setTimeout(()=>{socket.destroy();reject(new Error('皮卡丘启动连接超时'));},15000);
  socket.on('connect',()=>socket.write(JSON.stringify({type:'hello',token:info.token})+'\n'));
  socket.on('error',()=>{clearTimeout(timer);if(!welcomed)reject(new Error('请从皮卡丘翻译器重新打开号码筛选'));});
  socket.on('close',()=>{clearTimeout(timer);if(!welcomed)reject(new Error('皮卡丘启动连接已关闭'));});
  socket.on('data',chunk=>{
   buffer+=chunk.toString('utf8');if(buffer.length>8192){socket.destroy();return;}
   let end;while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
    try{
     const message=JSON.parse(line);
     if(!welcomed){
      if(message.type!=='welcome'||!themes.has(message.theme)||!/^\d{9}$/.test(message.suiteId)||typeof message.keyId!=='string'||!/^[a-f0-9]{64}$/.test(message.hardwareHash))throw new Error('启动授权无效');
      welcome=message;welcomed=true;clearTimeout(timer);resolve({socket,grant:message});
     }else if(message.type==='theme'&&themes.has(message.theme)){welcome.theme=message.theme;onMessage(message);}
     else if(message.type==='focus')onMessage(message);
    }catch{socket.destroy();if(!welcomed)reject(new Error('皮卡丘启动信息无效'));}
   }
  });
 });
}
module.exports={launchEnvironment,connectLauncher};

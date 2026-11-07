const api=window.numberFilter;
const el=id=>document.getElementById(id);
let current={};let working=false;
function render(s){
  current=s;
  el('connection').textContent=!s.online?'网络已断开':s.loggedIn?'WhatsApp 已登录':s.phase==='syncing'?'正在同步消息':s.phase==='loading'?'正在加载页面':'等待扫码登录';
  el('status-dot').classList.toggle('online',s.loggedIn&&s.online);
  el('file-name').textContent=s.imported?.fileName||'尚未导入号码文件';
  el('file-details').textContent=s.imported?`${s.imported.uniqueNumbers.toLocaleString()} 个有效号码 · 已去重`:'每行一个号码，包含国家区号';
  el('import-note').textContent=s.imported?`原始 ${s.imported.totalLines} 行，重复 ${s.imported.duplicateLines} 行，无效 ${s.imported.invalidCount} 行。`:'支持 +14155552671 或 14155552671 格式，自动去重。';
  for(const [id,value]of Object.entries({total:s.total,registered:s.registered,'not-registered':s.notRegistered,unknown:s.unknown}))el(id).textContent=(value||0).toLocaleString();
  el('progress').max=s.total||1;el('progress').value=s.checked||0;el('progress-numbers').textContent=`${s.checked||0} / ${s.total||0}`;
  el('progress-title').textContent=s.running?'正在筛选':s.checked===s.total&&s.total?(s.unknown?'已结束（有未确认）':'筛选完成'):s.checked?'已停止':'等待开始';
  el('ratio').textContent=s.checked&&s.total?(s.registered/s.total*100).toFixed(2)+'%':'—';
  el('timing').textContent=s.elapsedSeconds?`已用时 ${s.elapsedSeconds} 秒`+(s.running&&s.remainingSeconds!=null?`，预计剩余 ${s.remainingSeconds} 秒`:''):'登录资料独立保存在本机，下次打开可继续使用。';
  el('message').textContent=s.message||'';el('message').hidden=!!s.error;el('error').textContent=s.error||'';el('error').title=s.error||'';el('error').hidden=!s.error;
  el('start').disabled=working||!s.imported||!s.loggedIn||!s.online||s.running||s.checked>0;
  el('stop').disabled=working||!s.running;el('import').disabled=working||s.running;el('refresh').disabled=working||s.running;
  el('export').disabled=working||s.running||!s.checked;el('show-export').hidden=!s.exportFolder;
}
async function perform(method){if(working)return;working=true;render(current);try{await api[method]();}catch(error){current={...current,error:String(error.message||error).replace(/^Error invoking remote method '[^']+': Error: /,'')};}finally{working=false;render(current);}}
for(const [id,method]of Object.entries({import:'importTxt',start:'start',stop:'stop',export:'exportTxt','show-export':'showExport',refresh:'refresh'}))el(id).addEventListener('click',()=>perform(method));
api.onState(render);

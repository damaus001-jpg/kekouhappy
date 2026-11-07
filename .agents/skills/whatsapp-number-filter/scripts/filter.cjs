const fs = require('node:fs');
const path = require('node:path');
const { page } = require('./page.cjs');

async function main() {
  const [action, ...args] = process.argv.slice(2);
  const valid = ['targets', 'inspect', 'collect', 'start', 'status', 'stop', 'verify', 'export'];
  if (!valid.includes(action)) throw new Error('Usage: node filter.cjs '+valid.join('|')+' [--target ID] [--bubbles ID1,ID2] [--concurrency 1..6] [--out .tmp/report] [--endpoint http://127.0.0.1:9338]');
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--target','--bubbles','--concurrency','--out','--endpoint'].includes(args[i]) || !args[i+1] || args[i+1].startsWith('--')) throw new Error('Invalid option: '+args[i]);
    options[args[i].slice(2)] = args[i+1];
  }
  const endpoint = new URL(options.endpoint || 'http://127.0.0.1:9338');
  if (endpoint.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password) throw new Error('Only local HTTP CDP endpoints are supported');
  const targets = await (await fetch(new URL('/json', endpoint), { signal: AbortSignal.timeout(5000) })).json();
  const candidates = targets.filter(t => ['page','webview'].includes(t.type) && /^https:\/\/web\.whatsapp\.com\//.test(t.url));
  if (action === 'targets') { console.log(JSON.stringify(candidates.map(t => ({id:t.id,type:t.type,url:t.url})),null,2)); return; }
  const selected = options.target ? candidates.filter(t => t.id === options.target) : candidates;
  if (selected.length !== 1) throw new Error('Select one WhatsApp webview with --target; available IDs: '+candidates.map(t=>t.id).join(', '));
  const wsUrl = new URL(selected[0].webSocketDebuggerUrl);
  if (wsUrl.hostname !== endpoint.hostname || wsUrl.port !== endpoint.port) throw new Error('Debugger socket must match the local endpoint');
  if (typeof WebSocket !== 'function') throw new Error('Use Node 22+ with global WebSocket (project Node 24 recommended)');
  const ws = new WebSocket(wsUrl);
  try {
    await new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(new Error('CDP connection timeout')),5000); ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('CDP connection failed'));},{once:true}); });
    const params = {};
    if (options.bubbles) params.bubbles = options.bubbles.split(',').map(s=>s.trim()).filter(Boolean);
    if (options.concurrency) params.concurrency = Number(options.concurrency);
    const result = await new Promise((resolve,reject) => {
      const timer=setTimeout(()=>reject(new Error('Page evaluation timeout; inspect task status before retrying')),120000);
      const onClose=()=>{clearTimeout(timer);reject(new Error('Page connection closed'));};ws.addEventListener('close',onClose,{once:true});
      ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id!==1)return;clearTimeout(timer);ws.removeEventListener('close',onClose);if(message.error)reject(new Error(JSON.stringify(message.error)));else if(message.result.exceptionDetails)reject(new Error(message.result.exceptionDetails.exception?.description||message.result.exceptionDetails.text));else resolve(message.result.result.value);});
      ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'('+page.toString()+')('+JSON.stringify(action)+','+JSON.stringify(params)+')',returnByValue:true,awaitPromise:true,userGesture:true}}));
    });
    if (action === 'export') {
      const output=path.resolve(options.out||path.join('.tmp','whatsapp-number-filter',new Date().toISOString().replace(/[:.]/g,'-')));
      const files=[output+'.json',output+'.csv'];
      if(files.some(f=>fs.existsSync(f)))throw new Error('Output already exists; choose another --out prefix');
      fs.mkdirSync(path.dirname(output),{recursive:true});
      fs.writeFileSync(files[0],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
      const labels={registered:'已注册','not-registered':'未注册',unknown:'未确认'};
      const csv='\uFEFF序号,气泡,气泡内序号,号码,结果\r\n'+result.entries.map((e,i)=>[i+1,e.bubble,e.index,e.number,labels[e.status]].join(',')).join('\r\n')+'\r\n';
      fs.writeFileSync(files[1],csv,{flag:'wx'});
      const {entries,...summary}=result; console.log(JSON.stringify({...summary,files},null,2));
    } else console.log(JSON.stringify(result,null,2));
  } finally { ws.close(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

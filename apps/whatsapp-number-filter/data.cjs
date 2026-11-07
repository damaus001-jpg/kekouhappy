const fs = require('node:fs');
const path = require('node:path');

function parseTxt(buffer) {
  let text;
  if (buffer[0]===0xff && buffer[1]===0xfe) text=buffer.subarray(2).toString('utf16le');
  else if(buffer[0]===0xfe && buffer[1]===0xff){ const copy=Buffer.from(buffer.subarray(2));if(copy.length%2)throw new Error('TXT 的 UTF-16 编码不完整');copy.swap16();text=copy.toString('utf16le'); }
  else text=buffer.toString('utf8').replace(/^\uFEFF/,'');
  const numbers=[];const invalid=[];let nonEmpty=0;
  for(const [index,line]of text.split(/\r\n|\n|\r/).entries()){
    const raw=line.trim();if(!raw)continue;nonEmpty++;
    const normalized=raw.replace(/^00/,'+').replace(/[\s().-]/g,'');
    if(!/^\+?[1-9]\d{7,14}$/.test(normalized)){invalid.push({line:index+1,value:raw.slice(0,80)});continue;}
    numbers.push(normalized.replace(/^\+/,''));
  }
  const unique=[...new Set(numbers)];
  return {numbers:unique,totalLines:nonEmpty,validLines:numbers.length,uniqueNumbers:unique.length,duplicateLines:numbers.length-unique.length,invalidCount:invalid.length,invalidPreview:invalid.slice(0,8)};
}

function exportTxt(report, directory, imported, now=new Date()) {
  const labels={registered:'已注册号码','not-registered':'未注册号码',unknown:'未确认号码'};
  const folder=path.join(directory,'Whatsapp号码筛选-'+now.toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(folder,{recursive:false});
  const files=[];
  for(const [status,name]of Object.entries(labels)){
    const file=path.join(folder,name+'.txt');
    const lines=report.entries.filter(e=>e.status===status).map(e=>'+'+e.number);
    fs.writeFileSync(file,'\uFEFF'+(lines.length?lines.join('\r\n')+'\r\n':''),'utf8');files.push(file);
  }
  const summary=[
    'Whatsapp号码筛选',
    '统计时间：'+now.toLocaleString('zh-CN',{hour12:false}),
    '导入文件：'+(imported?.fileName||''),
    '原始非空行数：'+(imported?.totalLines??report.totalEntries),
    '重复行数：'+(imported?.duplicateLines??0),
    '无效行数：'+(imported?.invalidCount??0),
    '有效号码总数（去重）：'+report.uniqueNumbers,
    '已注册：'+report.counts.registered,
    '未注册：'+report.counts['not-registered'],
    '未确认：'+report.counts.unknown,
    '已注册占比：'+report.registeredPercentage.toFixed(2)+'%',
    '结果状态：'+(report.complete?'全部完成':'含未确认号码，结果尚不完整'),
    '判定依据：WhatsApp 页面号码查询结果是否支持显示 Chat with。',
    '超时、查询异常和未执行的号码均归入未确认。'
  ];
  const file=path.join(folder,'统计结果.txt');fs.writeFileSync(file,'\uFEFF'+summary.join('\r\n')+'\r\n','utf8');files.push(file);
  return {folder,files};
}
module.exports={parseTxt,exportTxt};

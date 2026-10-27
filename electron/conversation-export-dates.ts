// Also serialized into platform pages. Keep every helper inside this function.
export function conversationExportDay(timestamp:string,referenceDay='',dateOrder:'mdy'|'dmy'='mdy'):string {
  const key=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const canonical=(year:number,month:number,day:number)=>{
    const date=new Date(Date.UTC(year,month-1,day));
    return year>=1000&&date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:'';
  };
  const value=timestamp.trim();
  if(/^\d{10}(?:\d{3})?$/.test(value)){const date=new Date(Number(value)*(value.length===10?1000:1));return Number.isFinite(date.getTime())?key(date):'';}
  const yearFirst=value.match(/\b(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|(?=\D|$))/);
  if(yearFirst){
    const day=canonical(+yearFirst[1],+yearFirst[2],+yearFirst[3]);if(!day)return '';
    if(/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/i.test(value)){const instant=new Date(value);return Number.isFinite(instant.getTime())?key(instant):'';}
    return day;
  }
  const numeric=value.match(/\b(\d{1,2})([/.\-])(\d{1,2})\2(\d{4})\b/);
  if(numeric){const a=+numeric[1],b=+numeric[3],year=+numeric[4];if(a>12)return canonical(year,b,a);if(b>12)return canonical(year,a,b);return dateOrder==='dmy'?canonical(year,b,a):canonical(year,a,b);}
  const months='jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
  const monthFirst=value.match(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/);
  const dayFirst=value.match(/\b(\d{1,2})\s+([A-Za-z]+)[,]?\s+(\d{4})\b/);
  const match=monthFirst||dayFirst;
  if(match){const month=months.indexOf((monthFirst?match[1]:match[2]).slice(0,3).toLowerCase())+1;return month?canonical(+match[3],month,+(monthFirst?match[2]:match[1])):'';}
  if(referenceDay&&/\b(?:today|yesterday)\b|今天|今日|昨天|昨日/i.test(value)){
    const ref=referenceDay.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!ref)return '';
    const date=new Date(+ref[1],+ref[2]-1,+ref[3],12);if(/yesterday|昨天|昨日/i.test(value))date.setDate(date.getDate()-1);return key(date);
  }
  return '';
}
export function localConversationExportDate(now=new Date()):string {return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}

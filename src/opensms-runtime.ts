// Serialized into the isolated platform page. No backend access or site credentials.
export function openSmsRuntime(command: any) {
  const w = window as any;
  if (!['opensms.cc', 'www.opensms.cc'].includes(location.hostname)) return false;
  const version = '2026-10-17-opensms-v6';
  const startupGuardMarker = '2026-10-16-opensms-v1';
  if (w.__dfOpenSms?.version !== version) {
    w.__dfOpenSms?.dispose();
    const state: any = { version, signature: '', pending: null, ready: null, sensitive: null, sending: false, writing: false, cache: new Map(), enabled: true };
    const normalize = (s: string) => (s || '').replace(/\s+/g, ' ').trim();
    const canonical = (s: string) => (s || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').normalize('NFC').trim();
    const hash = (s: string) => { let h=2166136261;for(const c of normalize(s)){h=Math.imul(h^c.charCodeAt(0),16777619);}return (h>>>0).toString(36); };
    const localDayKey = (date:Date) => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
    const todayKey = () => localDayKey(new Date());
    const dayKey = (value:string) => {
      const match=String(value||'').match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|\s|$)/);
      if(!match)return '';
      const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
      const date=new Date(year,month-1,day);
      return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?localDayKey(date):'';
    };
    // Offline, approximate NANP area-code reference. An area code reflects
    // number assignment, not a verified current location (numbers are portable).
    const areaCodeInfo:Record<string,[string,string,string]> = {
      '201':['泽西市','新泽西州','America/New_York'],'202':['华盛顿','哥伦比亚特区','America/New_York'],'203':['纽黑文','康涅狄格州','America/New_York'],'205':['伯明翰','阿拉巴马州','America/Chicago'],'206':['西雅图','华盛顿州','America/Los_Angeles'],'207':['波特兰','缅因州','America/New_York'],'208':['博伊西','爱达荷州','America/Boise'],'209':['斯托克顿','加利福尼亚州','America/Los_Angeles'],'210':['圣安东尼奥','德克萨斯州','America/Chicago'],'212':['曼哈顿','纽约州','America/New_York'],'213':['洛杉矶','加利福尼亚州','America/Los_Angeles'],'214':['达拉斯','德克萨斯州','America/Chicago'],'215':['费城','宾夕法尼亚州','America/New_York'],'216':['克利夫兰','俄亥俄州','America/New_York'],'217':['斯普林菲尔德','伊利诺伊州','America/Chicago'],'218':['德卢斯','明尼苏达州','America/Chicago'],'219':['加里','印第安纳州','America/Chicago'],'224':['芝加哥北郊','伊利诺伊州','America/Chicago'],'225':['巴吞鲁日','路易斯安那州','America/Chicago'],'228':['比洛克西','密西西比州','America/Chicago'],'229':['奥尔巴尼','佐治亚州','America/New_York'],'231':['马斯基根','密歇根州','America/Detroit'],'234':['阿克伦','俄亥俄州','America/New_York'],'239':['迈尔斯堡','佛罗里达州','America/New_York'],'240':['罗克维尔','马里兰州','America/New_York'],'248':['底特律北郊','密歇根州','America/Detroit'],'251':['莫比尔','阿拉巴马州','America/Chicago'],'252':['格林维尔','北卡罗来纳州','America/New_York'],'253':['塔科马','华盛顿州','America/Los_Angeles'],'254':['韦科','德克萨斯州','America/Chicago'],'256':['亨茨维尔','阿拉巴马州','America/Chicago'],'260':['韦恩堡','印第安纳州','America/Indiana/Indianapolis'],'262':['密尔沃基西郊','威斯康星州','America/Chicago'],'267':['费城','宾夕法尼亚州','America/New_York'],'269':['卡拉马祖','密歇根州','America/Detroit'],'270':['鲍灵格林','肯塔基州','America/Chicago'],'272':['斯克兰顿','宾夕法尼亚州','America/New_York'],'276':['布里斯托尔','弗吉尼亚州','America/New_York'],'281':['休斯敦','德克萨斯州','America/Chicago'],'301':['盖瑟斯堡','马里兰州','America/New_York'],'302':['威尔明顿','特拉华州','America/New_York'],'303':['丹佛','科罗拉多州','America/Denver'],'304':['查尔斯顿','西弗吉尼亚州','America/New_York'],'305':['迈阿密','佛罗里达州','America/New_York'],'307':['夏延','怀俄明州','America/Denver'],'308':['科尔尼','内布拉斯加州','America/Chicago'],'309':['皮奥里亚','伊利诺伊州','America/Chicago'],'310':['洛杉矶西区','加利福尼亚州','America/Los_Angeles'],'312':['芝加哥','伊利诺伊州','America/Chicago'],'313':['底特律','密歇根州','America/Detroit'],'314':['圣路易斯','密苏里州','America/Chicago'],'315':['锡拉丘兹','纽约州','America/New_York'],'316':['威奇托','堪萨斯州','America/Chicago'],'317':['印第安纳波利斯','印第安纳州','America/Indiana/Indianapolis'],'318':['什里夫波特','路易斯安那州','America/Chicago'],'319':['锡达拉皮兹','爱荷华州','America/Chicago'],'320':['圣克劳德','明尼苏达州','America/Chicago'],'321':['奥兰多','佛罗里达州','America/New_York'],'323':['洛杉矶','加利福尼亚州','America/Los_Angeles'],'325':['阿比林','德克萨斯州','America/Chicago'],'330':['阿克伦','俄亥俄州','America/New_York'],'332':['曼哈顿','纽约州','America/New_York'],'334':['蒙哥马利','阿拉巴马州','America/Chicago'],'336':['格林斯伯勒','北卡罗来纳州','America/New_York'],'337':['拉斐特','路易斯安那州','America/Chicago'],'339':['波士顿北郊','马萨诸塞州','America/New_York'],'340':['夏洛特阿马利亚','美属维尔京群岛','America/St_Thomas'],'346':['休斯敦','德克萨斯州','America/Chicago'],'347':['纽约市','纽约州','America/New_York'],'351':['洛厄尔','马萨诸塞州','America/New_York'],'352':['盖恩斯维尔','佛罗里达州','America/New_York'],'360':['奥林匹亚','华盛顿州','America/Los_Angeles'],'361':['科珀斯克里斯蒂','德克萨斯州','America/Chicago'],'363':['长岛','纽约州','America/New_York'],'364':['鲍灵格林','肯塔基州','America/Chicago'],'380':['哥伦布','俄亥俄州','America/New_York'],'385':['盐湖城','犹他州','America/Denver'],'386':['代托纳比奇','佛罗里达州','America/New_York'],'401':['普罗维登斯','罗得岛州','America/New_York'],'402':['奥马哈','内布拉斯加州','America/Chicago'],'404':['亚特兰大','佐治亚州','America/New_York'],'405':['俄克拉荷马城','俄克拉荷马州','America/Chicago'],'406':['比灵斯','蒙大拿州','America/Denver'],'407':['奥兰多','佛罗里达州','America/New_York'],'408':['圣何塞','加利福尼亚州','America/Los_Angeles'],'409':['博蒙特','德克萨斯州','America/Chicago'],'410':['巴尔的摩','马里兰州','America/New_York'],'412':['匹兹堡','宾夕法尼亚州','America/New_York'],'413':['斯普林菲尔德','马萨诸塞州','America/New_York'],'414':['密尔沃基','威斯康星州','America/Chicago'],'415':['旧金山','加利福尼亚州','America/Los_Angeles'],'417':['斯普林菲尔德','密苏里州','America/Chicago'],'419':['托莱多','俄亥俄州','America/New_York'],'423':['查塔努加','田纳西州','America/New_York'],'424':['洛杉矶西区','加利福尼亚州','America/Los_Angeles'],'425':['贝尔维尤','华盛顿州','America/Los_Angeles'],'430':['泰勒','德克萨斯州','America/Chicago'],'432':['米德兰','德克萨斯州','America/Chicago'],'434':['林奇堡','弗吉尼亚州','America/New_York'],'435':['圣乔治','犹他州','America/Denver'],'440':['克利夫兰郊区','俄亥俄州','America/New_York'],'442':['棕榈泉','加利福尼亚州','America/Los_Angeles'],'443':['巴尔的摩','马里兰州','America/New_York'],'458':['尤金','俄勒冈州','America/Los_Angeles'],'469':['达拉斯','德克萨斯州','America/Chicago'],'470':['亚特兰大','佐治亚州','America/New_York'],'475':['纽黑文','康涅狄格州','America/New_York'],'478':['梅肯','佐治亚州','America/New_York'],'479':['费耶特维尔','阿肯色州','America/Chicago'],'480':['斯科茨代尔','亚利桑那州','America/Phoenix'],'484':['阿伦敦','宾夕法尼亚州','America/New_York'],'501':['小石城','阿肯色州','America/Chicago'],'502':['路易斯维尔','肯塔基州','America/Kentucky/Louisville'],'503':['波特兰','俄勒冈州','America/Los_Angeles'],'504':['新奥尔良','路易斯安那州','America/Chicago'],'505':['阿尔伯克基','新墨西哥州','America/Denver'],'507':['罗切斯特','明尼苏达州','America/Chicago'],'508':['伍斯特','马萨诸塞州','America/New_York'],'509':['斯波坎','华盛顿州','America/Los_Angeles'],'510':['奥克兰','加利福尼亚州','America/Los_Angeles'],'512':['奥斯汀','德克萨斯州','America/Chicago'],'513':['辛辛那提','俄亥俄州','America/New_York'],'515':['得梅因','爱荷华州','America/Chicago'],'516':['长岛','纽约州','America/New_York'],'517':['兰辛','密歇根州','America/Detroit'],'518':['奥尔巴尼','纽约州','America/New_York'],'520':['图森','亚利桑那州','America/Phoenix'],'530':['雷丁','加利福尼亚州','America/Los_Angeles'],'531':['奥马哈','内布拉斯加州','America/Chicago'],'534':['欧克莱尔','威斯康星州','America/Chicago'],'539':['塔尔萨','俄克拉荷马州','America/Chicago'],'540':['罗阿诺克','弗吉尼亚州','America/New_York'],'541':['本德','俄勒冈州','America/Los_Angeles'],'551':['泽西市','新泽西州','America/New_York'],'559':['弗雷斯诺','加利福尼亚州','America/Los_Angeles'],'561':['西棕榈滩','佛罗里达州','America/New_York'],'562':['长滩','加利福尼亚州','America/Los_Angeles'],'563':['达文波特','爱荷华州','America/Chicago'],'567':['托莱多','俄亥俄州','America/New_York'],'570':['斯克兰顿','宾夕法尼亚州','America/New_York'],'571':['阿灵顿','弗吉尼亚州','America/New_York'],'573':['哥伦比亚','密苏里州','America/Chicago'],'574':['南本德','印第安纳州','America/Indiana/Indianapolis'],'575':['拉斯克鲁塞斯','新墨西哥州','America/Denver'],'580':['劳顿','俄克拉荷马州','America/Chicago'],'585':['罗切斯特','纽约州','America/New_York'],'586':['沃伦','密歇根州','America/Detroit'],'601':['杰克逊','密西西比州','America/Chicago'],'602':['凤凰城','亚利桑那州','America/Phoenix'],'603':['曼彻斯特','新罕布什尔州','America/New_York'],'605':['苏福尔斯','南达科他州','America/Chicago'],'606':['阿什兰','肯塔基州','America/New_York'],'607':['宾厄姆顿','纽约州','America/New_York'],'608':['麦迪逊','威斯康星州','America/Chicago'],'609':['特伦顿','新泽西州','America/New_York'],'610':['阿伦敦','宾夕法尼亚州','America/New_York'],'612':['明尼阿波利斯','明尼苏达州','America/Chicago'],'614':['哥伦布','俄亥俄州','America/New_York'],'615':['纳什维尔','田纳西州','America/Chicago'],'616':['大急流城','密歇根州','America/Detroit'],'617':['波士顿','马萨诸塞州','America/New_York'],'618':['贝尔维尔','伊利诺伊州','America/Chicago'],'619':['圣迭戈','加利福尼亚州','America/Los_Angeles'],'620':['道奇城','堪萨斯州','America/Chicago'],'623':['格伦代尔','亚利桑那州','America/Phoenix'],'626':['帕萨迪纳','加利福尼亚州','America/Los_Angeles'],'628':['旧金山','加利福尼亚州','America/Los_Angeles'],'630':['奥罗拉','伊利诺伊州','America/Chicago'],'631':['长岛','纽约州','America/New_York'],'636':['圣查尔斯','密苏里州','America/Chicago'],'641':['马歇尔敦','爱荷华州','America/Chicago'],'646':['曼哈顿','纽约州','America/New_York'],'650':['圣马特奥','加利福尼亚州','America/Los_Angeles'],'651':['圣保罗','明尼苏达州','America/Chicago'],'657':['阿纳海姆','加利福尼亚州','America/Los_Angeles'],'660':['塞达利亚','密苏里州','America/Chicago'],'661':['贝克斯菲尔德','加利福尼亚州','America/Los_Angeles'],'662':['图珀洛','密西西比州','America/Chicago'],'667':['巴尔的摩','马里兰州','America/New_York'],'669':['圣何塞','加利福尼亚州','America/Los_Angeles'],'678':['亚特兰大','佐治亚州','America/New_York'],'681':['查尔斯顿','西弗吉尼亚州','America/New_York'],'682':['沃思堡','德克萨斯州','America/Chicago'],'701':['法戈','北达科他州','America/Chicago'],'702':['拉斯维加斯','内华达州','America/Los_Angeles'],'703':['阿灵顿','弗吉尼亚州','America/New_York'],'704':['夏洛特','北卡罗来纳州','America/New_York'],'706':['奥古斯塔','佐治亚州','America/New_York'],'707':['圣罗莎','加利福尼亚州','America/Los_Angeles'],'708':['芝加哥南郊','伊利诺伊州','America/Chicago'],'712':['苏城','爱荷华州','America/Chicago'],'713':['休斯敦','德克萨斯州','America/Chicago'],'714':['阿纳海姆','加利福尼亚州','America/Los_Angeles'],'715':['欧克莱尔','威斯康星州','America/Chicago'],'716':['布法罗','纽约州','America/New_York'],'717':['哈里斯堡','宾夕法尼亚州','America/New_York'],'718':['纽约市','纽约州','America/New_York'],'719':['科罗拉多斯普林斯','科罗拉多州','America/Denver'],'720':['丹佛','科罗拉多州','America/Denver'],'724':['匹兹堡郊区','宾夕法尼亚州','America/New_York'],'725':['拉斯维加斯','内华达州','America/Los_Angeles'],'727':['圣彼得堡','佛罗里达州','America/New_York'],'729':['查塔努加','田纳西州','America/New_York'],'731':['杰克逊','田纳西州','America/Chicago'],'732':['新不伦瑞克','新泽西州','America/New_York'],'737':['奥斯汀','德克萨斯州','America/Chicago'],'740':['兰开斯特','俄亥俄州','America/New_York'],'747':['洛杉矶','加利福尼亚州','America/Los_Angeles'],'754':['劳德代尔堡','佛罗里达州','America/New_York'],'757':['弗吉尼亚海滩','弗吉尼亚州','America/New_York'],'760':['棕榈泉','加利福尼亚州','America/Los_Angeles'],'762':['奥古斯塔','佐治亚州','America/New_York'],'763':['布鲁克林公园','明尼苏达州','America/Chicago'],'765':['拉斐特','印第安纳州','America/Indiana/Indianapolis'],'769':['杰克逊','密西西比州','America/Chicago'],'770':['亚特兰大','佐治亚州','America/New_York'],'772':['皮尔斯堡','佛罗里达州','America/New_York'],'773':['芝加哥','伊利诺伊州','America/Chicago'],'774':['伍斯特','马萨诸塞州','America/New_York'],'775':['里诺','内华达州','America/Los_Angeles'],'779':['罗克福德','伊利诺伊州','America/Chicago'],'781':['波士顿郊区','马萨诸塞州','America/New_York'],'785':['托皮卡','堪萨斯州','America/Chicago'],'786':['迈阿密','佛罗里达州','America/New_York'],'801':['盐湖城','犹他州','America/Denver'],'802':['伯灵顿','佛蒙特州','America/New_York'],'803':['哥伦比亚','南卡罗来纳州','America/New_York'],'804':['里士满','弗吉尼亚州','America/New_York'],'805':['圣巴巴拉','加利福尼亚州','America/Los_Angeles'],'806':['阿马里洛','德克萨斯州','America/Chicago'],'808':['檀香山','夏威夷州','Pacific/Honolulu'],'810':['弗林特','密歇根州','America/Detroit'],'812':['埃文斯维尔','印第安纳州','America/Indiana/Indianapolis'],'813':['坦帕','佛罗里达州','America/New_York'],'814':['伊利','宾夕法尼亚州','America/New_York'],'815':['罗克福德','伊利诺伊州','America/Chicago'],'816':['堪萨斯城','密苏里州','America/Chicago'],'817':['沃思堡','德克萨斯州','America/Chicago'],'818':['伯班克','加利福尼亚州','America/Los_Angeles'],'830':['新布朗费尔斯','德克萨斯州','America/Chicago'],'831':['蒙特雷','加利福尼亚州','America/Los_Angeles'],'832':['休斯敦','德克萨斯州','America/Chicago'],'843':['查尔斯顿','南卡罗来纳州','America/New_York'],'854':['查尔斯顿','南卡罗来纳州','America/New_York'],'845':['波基普西','纽约州','America/New_York'],'848':['新不伦瑞克','新泽西州','America/New_York'],'850':['塔拉哈西','佛罗里达州','America/New_York'],'856':['卡姆登','新泽西州','America/New_York'],'857':['波士顿','马萨诸塞州','America/New_York'],'858':['圣迭戈','加利福尼亚州','America/Los_Angeles'],'860':['哈特福德','康涅狄格州','America/New_York'],'862':['纽瓦克','新泽西州','America/New_York'],'863':['莱克兰','佛罗里达州','America/New_York'],'864':['格林维尔','南卡罗来纳州','America/New_York'],'865':['诺克斯维尔','田纳西州','America/New_York'],'870':['琼斯伯勒','阿肯色州','America/Chicago'],'872':['芝加哥','伊利诺伊州','America/Chicago'],'878':['匹兹堡','宾夕法尼亚州','America/New_York'],'901':['孟菲斯','田纳西州','America/Chicago'],'903':['泰勒','德克萨斯州','America/Chicago'],'904':['杰克逊维尔','佛罗里达州','America/New_York'],'906':['马凯特','密歇根州','America/Detroit'],'907':['安克雷奇','阿拉斯加州','America/Anchorage'],'908':['伊丽莎白','新泽西州','America/New_York'],'909':['圣贝纳迪诺','加利福尼亚州','America/Los_Angeles'],'910':['费耶特维尔','北卡罗来纳州','America/New_York'],'912':['萨凡纳','佐治亚州','America/New_York'],'913':['堪萨斯城','堪萨斯州','America/Chicago'],'914':['扬克斯','纽约州','America/New_York'],'915':['埃尔帕索','德克萨斯州','America/Denver'],'916':['萨克拉门托','加利福尼亚州','America/Los_Angeles'],'917':['纽约市','纽约州','America/New_York'],'918':['塔尔萨','俄克拉荷马州','America/Chicago'],'919':['罗利','北卡罗来纳州','America/New_York'],'920':['格林贝','威斯康星州','America/Chicago'],'925':['康科德','加利福尼亚州','America/Los_Angeles'],'928':['弗拉格斯塔夫','亚利桑那州','America/Phoenix'],'929':['纽约市','纽约州','America/New_York'],'930':['埃文斯维尔','印第安纳州','America/Indiana/Indianapolis'],'931':['克拉克斯维尔','田纳西州','America/Chicago'],'936':['康罗','德克萨斯州','America/Chicago'],'937':['代顿','俄亥俄州','America/New_York'],'940':['威奇托福尔斯','德克萨斯州','America/Chicago'],'941':['萨拉索塔','佛罗里达州','America/New_York'],'947':['底特律北郊','密歇根州','America/Detroit'],'948':['弗吉尼亚海滩','弗吉尼亚州','America/New_York'],'949':['欧文','加利福尼亚州','America/Los_Angeles'],'951':['河滨','加利福尼亚州','America/Los_Angeles'],'952':['布卢明顿','明尼苏达州','America/Chicago'],'954':['劳德代尔堡','佛罗里达州','America/New_York'],'956':['拉雷多','德克萨斯州','America/Chicago'],'959':['哈特福德','康涅狄格州','America/New_York'],'970':['科林斯堡','科罗拉多州','America/Denver'],'971':['波特兰','俄勒冈州','America/Los_Angeles'],'972':['达拉斯','德克萨斯州','America/Chicago'],'978':['洛厄尔','马萨诸塞州','America/New_York'],'979':['布赖恩','德克萨斯州','America/Chicago'],'980':['夏洛特','北卡罗来纳州','America/New_York'],'984':['罗利','北卡罗来纳州','America/New_York'],'985':['霍马','路易斯安那州','America/Chicago'],'989':['萨吉诺','密歇根州','America/Detroit']
    };
    const timezoneOffsetMinutes=(zone:string,at:Date)=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(at);const values:any={};for(const part of parts)if(part.type!=='literal')values[part.type]=Number(part.value);return Math.round((Date.UTC(values.year,values.month-1,values.day,values.hour,values.minute,values.second)-at.getTime())/60000);};
    const phoneAreaCode=(text:string)=>{const digits=String(text||'').replace(/\D/g,'');if(digits.length===11&&digits[0]==='1')return digits.slice(1,4);if(digits.length===10)return digits.slice(0,3);return '';};
    const renderAreaCodeHint=()=>{const numberNode=document.querySelector<HTMLElement>('.im-chat-top .info-other .info-value');let hintNode=document.getElementById('df-opensms-area-hint');if(!numberNode){hintNode?.remove();return;}if(!hintNode){hintNode=document.createElement('div');hintNode.id='df-opensms-area-hint';hintNode.className='df-opensms-area-hint';hintNode.style.cssText='position:relative;display:table;width:max-content;max-width:min(360px,80vw);box-sizing:border-box;margin:0 0 7px auto;padding:6px 11px;border:1px solid #7dbb91;border-radius:13px;background:#f0fff4;color:#245b37;font:600 12px/1.45 sans-serif;box-shadow:0 2px 7px #164a2820;white-space:normal;text-align:center';const label=document.createElement('span');label.className='df-opensms-area-hint-text';const tail=document.createElement('span');tail.style.cssText='position:absolute;right:12px;bottom:-6px;width:10px;height:10px;background:#f0fff4;border-right:1px solid #7dbb91;border-bottom:1px solid #7dbb91;transform:rotate(45deg)';tail.setAttribute('aria-hidden','true');hintNode.append(label,tail);}if(hintNode.parentElement!==numberNode.parentElement)numberNode.parentElement?.insertBefore(hintNode,numberNode);else if(hintNode.nextElementSibling!==numberNode)numberNode.parentElement?.insertBefore(hintNode,numberNode);const label=hintNode.querySelector<HTMLElement>('.df-opensms-area-hint-text')!;const info=areaCodeInfo[phoneAreaCode(numberNode.textContent||'')];if(!info){hintNode.style.display='none';return;}const [city,stateName,zone]=info;const now=new Date();const delta=Math.round((timezoneOffsetMinutes(zone,now)-timezoneOffsetMinutes('America/Los_Angeles',now))/60);const text=`${city}-${stateName}-时差${delta>=0?'+':''}${delta}`;if(label.textContent!==text)label.textContent=text;hintNode.style.display='table';const title='按号码区号推测的代表区域；号码携转后实际所在地可能不同';if(hintNode.title!==title)hintNode.title=title;if(hintNode.getAttribute('aria-label')!==text)hintNode.setAttribute('aria-label',text);};
    const visible = (el: Element | null): el is HTMLElement => !!el && el.getClientRects().length>0 && getComputedStyle(el).display!=='none' && getComputedStyle(el).visibility!=='hidden';
    const contact = () => {
      const selected=Array.from(document.querySelectorAll('.chat-item.active[data-id]')).filter(visible);
      const account=normalize(document.querySelector('.left-bar .avatar-name')?.textContent || '');
      const id=selected.length===1?selected[0].getAttribute('data-id') || '':'';
      const open=location.hash.startsWith('#/index/chat')&&visible(document.querySelector('.im-chat #message-box'));
      const title=normalize(document.querySelector('.im-chat-top .info-other .info-value')?.textContent || '当前联系人').slice(0,200);
      const signature=`sms:${encodeURIComponent(account)}:${encodeURIComponent(id)}`;
      return {id:open&&account&&/^[\w.-]{1,128}$/.test(id)&&signature.length<=240?signature:'',title};
    };
    const editor = () => {
      const caption=document.querySelector<HTMLElement>('.im-chat .mms-preview-bar .mms-title-input input');
      if(visible(caption))return caption;
      const nodes=Array.from(document.querySelectorAll<HTMLElement>('.im-chat .im-chat-footer #messageTextArea[contenteditable]:not([contenteditable="false"])')).filter(visible);
      return nodes.length===1?nodes[0]:null;
    };
    const read = (el: HTMLElement | null = editor()): string => {
      if(!el)return '';
      if(el instanceof HTMLInputElement)return canonical(el.value);
      // The site uses contenteditable DIV/BR blocks for pasted multi-line text.
      const walk=(node:Node):string=>{
        if(node.nodeType===Node.TEXT_NODE)return node.nodeValue || '';
        if(!(node instanceof Element))return '';
        if(node.tagName==='BR')return '\n';
        if(node.tagName==='IMG')return node.getAttribute('alt') || '';
        let out='';for(const child of Array.from(node.childNodes)){
          const block=child instanceof Element&&/^(DIV|P|LI|PRE)$/.test(child.tagName);
          if(block&&out&&!out.endsWith('\n'))out+='\n';
          out+=walk(child);if(block&&!out.endsWith('\n'))out+='\n';
        }return out;
      };return canonical(walk(el));
    };
    const emit = (action:string,text='',requestId='') => { w.__dfTranslatorQueue ||= [];w.__dfTranslatorQueue.push({action,text,requestId,conversationSignature:contact().id});if(w.__dfTranslatorQueue.length>100)w.__dfTranslatorQueue.splice(0,w.__dfTranslatorQueue.length-100); };
    const draftContext = () => editor() instanceof HTMLInputElement?document.querySelector('.im-chat .mms-preview-bar img')?.getAttribute('src') || 'mms':'sms';
    const hint = (text:string) => {const el=document.getElementById('df-opensms-status');if(el)el.textContent=text;};
    const reset = () => {
      state.pending=null;state.ready=null;state.sensitive=null;
      const input=editor();if(input){delete input.dataset.dfTranslatorRequestId;delete input.dataset.dfTranslatorReadyRequestId;}
    };
    const sync = () => {
      const id=contact().id;if(id!==state.signature){state.signature=id;reset();w.__dfConversationSignature=id;emit('conversation-change',id);hint('');}
      renderAreaCodeHint();
      // The preload guard intentionally blocks Enter until this exact marker
      // confirms that the page-world handler has installed successfully.
      document.documentElement.dataset.dfOpenSmsGuard=startupGuardMarker;
      const footer=document.querySelector('.im-chat-footer');
      if(footer&&!document.getElementById('df-opensms-status')){
        const status=document.createElement('div');status.id='df-opensms-status';status.setAttribute('role','status');status.style.cssText='padding:4px 12px;font:12px/1.6 sans-serif;color:#21894e;white-space:pre-wrap';footer.prepend(status);
      }
    };
    const source = (el: Element) => {const clone=el.cloneNode(true) as HTMLElement;clone.querySelectorAll('.df-chat-translation,.df-chat-refresh-translation,.df-smart-reply-host').forEach(n=>n.remove());return normalize(clone.innerText || clone.textContent || '');};
    const rows = () => {
      const current=contact();if(!current.id)return [];
      return Array.from(document.querySelectorAll<HTMLElement>('#message-box > ul > li[id^="m-"].im-chat-other,#message-box > ul > li[id^="m-"].im-chat-mine')).flatMap(row=>{
        const body=row.querySelector<HTMLElement>('.im-chat-text > .message-content');if(!body||!visible(body))return [];
        const text=source(body);if(!text)return [];
        const key=`sms-${hash(current.id)}-${hash(row.id)}-${hash(text)}`;
        body.dataset.dfMsgTextKey=key;row.dataset.dfMsgKey=key;
        const rect=body.getBoundingClientRect();const box=document.getElementById('message-box')!;
        const timestamp=row.querySelector<HTMLElement>('.im-chat-user .msg-time,.contact-time-only')?.textContent||'';
        return [{key,text,timestamp,dayKey:dayKey(timestamp),contactId:current.id,contactKey:current.id,contactIdType:'platform',contactTitle:current.title,direction:row.classList.contains('im-chat-mine')?'outgoing':'incoming',messagePart:'body',rectTop:rect.top,rectBottom:rect.bottom,viewportHeight:innerHeight,scanBand:rect.bottom<0?'above':rect.top>innerHeight?'below':'visible',nearConversationEnd:box.scrollHeight-box.scrollTop-box.clientHeight<180,nearConversationStart:box.scrollTop<180,row,body}];
      });
    };
    const paint = (entry:any) => {
      const item=rows().find(r=>r.key===entry.key&&(!entry.sourceText||r.text===normalize(entry.sourceText)));if(!item)return false;
      const box=document.getElementById('message-box')!;const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<120;const beforeHeight=box.scrollHeight,beforeTop=box.scrollTop;const above=item.row.getBoundingClientRect().bottom<box.getBoundingClientRect().top;
      let translation=item.body.parentElement!.querySelector<HTMLElement>(':scope > .df-chat-translation');
      if(!translation){translation=document.createElement('div');translation.className='df-chat-translation';translation.style.cssText=`display:block;white-space:pre-wrap;font-size:13px;line-height:1.6;margin-top:7px;padding-top:6px;border-top:1px solid currentColor;color:${item.direction==='outgoing'?'#fff':'#247944'};overflow-wrap:anywhere`;item.body.after(translation);}
      translation.textContent=entry.translation;translation.dataset.dfTranslationSource=item.text;
      if(atBottom)box.scrollTop=box.scrollHeight;else if(above)box.scrollTop=beforeTop+box.scrollHeight-beforeHeight;
      return true;
    };
    const refresh = (key:string,processing:boolean) => {const item=rows().find(r=>r.key===key);const button=item?.row.querySelector<HTMLButtonElement>('.df-chat-refresh-translation');if(button){button.disabled=processing;button.textContent=processing?'…':'↻';}return !!button;};
    const decorate = () => {
      const items=rows();
      for(const item of items){
        const old=item.row.querySelector<HTMLElement>('.df-chat-translation');if(old&&old.dataset.dfTranslationSource!==item.text)old.remove();
        const oldRefresh=item.row.querySelector<HTMLElement>('.df-chat-refresh-translation');if(oldRefresh&&oldRefresh.dataset.dfRefreshKey!==item.key)oldRefresh.remove();
        const cached=state.cache.get(hash(item.text));
        if(cached?.sourceText===item.text&&!item.row.querySelector('.df-chat-translation'))paint({key:item.key,translation:cached.translatedText,sourceText:item.text});
        if(!/[A-Za-z]{2,}/.test(item.text)||/[\u3400-\u9fff]/.test(item.text))continue;
        if(!item.row.querySelector('.df-chat-refresh-translation')){
          const button=document.createElement('button');button.type='button';button.className='df-chat-refresh-translation';button.dataset.dfRefreshKey=item.key;button.textContent='↻';button.title='刷新翻译';button.style.cssText='font:12px sans-serif;background:transparent;border:0;cursor:pointer;color:inherit';
          button.onclick=()=>{if(contact().id!==item.contactId||source(item.body)!==item.text)return;button.disabled=true;emit('bubble-refresh',JSON.stringify({key:item.key,text:item.text,direction:item.direction,messagePart:'body'}));};item.body.parentElement!.appendChild(button);
        }
      }
      const eligible=items.filter(i=>i.dayKey===todayKey()&&i.direction==='incoming'&&/[A-Za-z]{2,}/.test(i.text)&&!/[\u3400-\u9fff]/.test(i.text)).slice(-3);
      document.querySelectorAll<HTMLElement>('#message-box .df-smart-reply-host').forEach(n=>{if(!eligible.some(i=>i.key===n.dataset.smsKey))n.remove();});
      for(const item of eligible){
        if(item.row.querySelector('.df-smart-reply-host'))continue;
        const button=document.createElement('button');button.type='button';button.className='df-smart-reply-host';button.dataset.smsKey=item.key;button.textContent='去GPT';button.style.cssText='display:block;margin:5px 0;font:12px sans-serif;border:1px solid #80c79a;border-radius:6px;padding:3px 8px;background:#effbf3;color:#197745;cursor:pointer';
        button.onclick=()=>{
          const current=rows().filter(r=>r.dayKey===todayKey());const index=current.findIndex(r=>r.key===item.key);if(index<0||item.direction!=='incoming'||contact().id!==item.contactId)return;
          const messages=current.slice(0,index+1).filter(r=>/[A-Za-z]{2,}/.test(r.text)&&!/[\u3400-\u9fff]/.test(r.text)&&r.text.length<=4000).slice(-18).map(r=>({speaker:r.direction==='outgoing'?'self':'other',text:r.text}));
          while(new TextEncoder().encode(JSON.stringify(messages)).length>80_000&&messages.length>1)messages.shift();
          if(messages.length&&new TextEncoder().encode(JSON.stringify(messages)).length<=80_000)emit('smart-reply-request',JSON.stringify({latestMessageKey:`smart-${hash(item.key)}-${hash(item.text)}`,messages}),`sms-gpt-${Date.now().toString(36)}`);
        };item.body.parentElement!.appendChild(button);
      }
      return items;
    };
    const sensitive = (text:string) => text.length<=256&&!/[\r\n]/.test(text)&&(/^[0-9 ]{1,34}$/.test(text)||/^0x[0-9A-Za-z]{20,80}$/.test(text)||/^T[0-9A-Za-z]{33}$/.test(text)||/^[0-9A-Za-z]{32,44}$/.test(text));
    const directUrl = (text:string) => {
      if(/\s/.test(text)||!/^https?:\/\/|^www\./i.test(text))return false;
      try{const url=new URL(/^www\./i.test(text)?'https://'+text:text);return ['http:','https:'].includes(url.protocol)&&!!url.hostname;}catch{return false;}
    };
    const stop = (event:Event) => {event.preventDefault();event.stopImmediatePropagation();};
    const submit = (event:Event) => {
      sync();const input=editor();const text=read(input);const signature=contact().id;
      if(state.sending)return;
      if(!state.enabled||!signature||!input){stop(event);hint('尚未可靠识别账号或联系人，已阻止发送');return;}
      if(!text){stop(event);hint('请先填写并核对当前短信或彩信正文');return;}
      if(state.pending){stop(event);hint('正在翻译，请稍候');return;}
      if(state.sensitive?.text===text&&state.sensitive.signature===signature&&state.sensitive.input===input&&state.sensitive.context===draftContext()){stop(event);const approval=state.sensitive;state.sensitive=null;state.pending={signature,input,text,context:draftContext(),requestId:approval.token};emit('sensitive-send',text,approval.token);return;}
      if(sensitive(text)){stop(event);state.pending={signature,input,text,context:draftContext(),requestId:'sensitive'};emit('sensitive-prepare',text);return;}
      if(/[\u3400-\u9fff]/.test(text)&&!directUrl(text)){
        stop(event);const requestId=`sms-translate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
        state.pending={signature,input,text,context:draftContext(),requestId};input.dataset.dfTranslatorRequestId=requestId;emit('translate',text,requestId);hint('正在翻译…');return;
      }
      if(state.ready){
        stop(event);const ready=state.ready;
        if(ready.text!==text||ready.signature!==signature||ready.input!==input||ready.context!==draftContext()){reset();hint('内容或联系人已变化，请重新核对');return;}
        state.ready=null;state.pending={signature,input,text,context:draftContext(),requestId:ready.requestId};emit('send',text,ready.requestId);
      }
    };
    const onKey=(event:KeyboardEvent)=>{
      if(event.key!=='Enter')return;
      const input=editor(),target=event.target instanceof Element?event.target:null;
      const targetMatches=!!input&&!!target&&(input===target||input.contains(target));
      const text=read(input),signature=contact().id;
      const trace=(decision:string)=>emit('debug',JSON.stringify({kind:'opensms-enter',decision,enabled:state.enabled,hasConversation:Boolean(signature),hasComposer:Boolean(input),targetMatches,textLength:text.length,hasChinese:/[\u3400-\u9fff]/.test(text),hasEnglish:/[A-Za-z]{2,}/.test(text),hasPending:Boolean(state.pending),hasReady:Boolean(state.ready),composing:event.isComposing,keyCode:event.keyCode,repeat:event.repeat,targetTag:target?.tagName||'',targetClass:String(target?.className||'').slice(0,100),activeTag:document.activeElement?.tagName||'',activeClass:String((document.activeElement as HTMLElement|null)?.className||'').slice(0,100),editorTag:input?.tagName||'',editorClass:String(input?.className||'').slice(0,100)}));
      if(state.sending){if(targetMatches)trace('send-in-progress');return;}
      if(!targetMatches){trace('target-mismatch');return;}
      if(event.isComposing||event.keyCode===229){trace('ime-composition');return;}
      if(event.repeat){trace('repeat-blocked');stop(event);return;}
      let sendKey='enter';try{sendKey=localStorage.getItem('sendKey') || 'enter';}catch{}
      if(input instanceof HTMLInputElement){if(event.shiftKey||event.ctrlKey||event.metaKey){trace('modified-enter-ignored');stop(event);return;}trace('submit-input');submit(event);return;}
      if(event.ctrlKey||event.metaKey){trace('modified-enter-blocked');stop(event);hint('请使用 Enter 或设置的 Alt+Enter 发送');return;}
      if(event.shiftKey){trace('shift-enter');if(event.altKey)stop(event);return;}
      if(sendKey==='alt+enter'&&!event.altKey){trace('waiting-for-alt-enter');return;}
      trace('submit-composer');
      submit(event);
    };
    const mainButton = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.im-chat .im-chat-send button')).filter(b=>visible(b)&&normalize(b.textContent || '')==='发送');
    const onPointer=(event:Event)=>{if(state.sending)return;const button=event.target instanceof Element?event.target.closest('button'):null;if(button&&mainButton().includes(button as HTMLButtonElement))submit(event);};
    const onInput=(event:Event)=>{
      const input=editor();if(state.writing||!input||event.target!==input)return;
      reset();emit('typing',read(input));hint(/[\u3400-\u9fff]/.test(read(input))?'按发送键先翻译，再次按发送键发送英文':'');
    };
    const focus=()=>{const input=editor();if(!input)return false;const id=contact().id;input.focus();return input.isConnected&&editor()===input&&contact().id===id;};
    state.apply=(cmd:any):any=>{
      sync();
      if(cmd.action==='bootstrap')return true;
      if(cmd.action==='contact')return contact();
      if(cmd.action==='install'){decorate();return true;}
      if(cmd.action==='enabled'){state.enabled=cmd.enabled;if(!cmd.enabled)reset();return true;}
      if(cmd.action==='text')return read();
      if(cmd.action==='focus'||cmd.action==='focusNative')return focus();
      if(cmd.action==='matches')return !!state.pending&&state.pending.requestId===cmd.requestId&&state.pending.signature===contact().id&&state.pending.input===editor()&&state.pending.context===draftContext()&&read()===state.pending.text;
      if(cmd.action==='probe'){
        const input=editor();
        const describe=(el:Element)=>{const rect=el.getBoundingClientRect(),style=getComputedStyle(el);return {tag:el.tagName,id:(el as HTMLElement).id||'',className:String((el as HTMLElement).className||'').slice(0,140),role:el.getAttribute('role')||'',contenteditable:el.getAttribute('contenteditable')||'',ariaLabel:el.getAttribute('aria-label')||'',placeholder:(el.getAttribute('placeholder')||'').slice(0,80),visible:visible(el as HTMLElement),width:Math.round(rect.width),height:Math.round(rect.height),display:style.display,tabIndex:(el as HTMLElement).tabIndex,parentTag:el.parentElement?.tagName||'',parentClass:String(el.parentElement?.className||'').slice(0,120)}};
        const editables=Array.from(document.querySelectorAll<HTMLElement>('.im-chat textarea,.im-chat input,.im-chat [contenteditable],.im-chat [role="textbox"]')).slice(0,20).map(describe);
        const sendButtons=Array.from(document.querySelectorAll<HTMLElement>('.im-chat button')).filter(el=>normalize(el.textContent||'').includes('发送')).slice(0,5).map(describe);
        const active=document.activeElement;
        return {guard:version,hasComposer:!!input,textLength:read().length,hasChinese:/[\u3400-\u9fff]/.test(read()),hasEnglish:/[A-Za-z]{2,}/.test(read()),queueLength:w.__dfTranslatorQueue?.length||0,translatedReady:!!state.ready,pending:!!state.pending,protectionReady:true,locationHash:location.hash.slice(0,80),active:active instanceof Element?describe(active):null,editor:input?describe(input):null,editableCandidates:editables,sendButtonCandidates:sendButtons,iframeCount:document.querySelectorAll('iframe').length};
      }
      if(cmd.action==='unread'){
        const badge=document.querySelector('.left-bar .nav-section a[href$="/index/chat"] .el-badge__content');
        const counts=Array.from(document.querySelectorAll('.chat-item .stat-unread .stat-value')).map(n=>Number(normalize(n.textContent||''))||0);
        const count=badge?(visible(badge)?parseInt(badge.textContent||'0',10)||0:0):counts.reduce((a,b)=>a+b,0);
        return {count:Math.min(999,Math.max(0,count)),ready:!!document.querySelector('.left-bar .avatar-name')};
      }
      if(cmd.action==='scan')return decorate().filter(r=>/[A-Za-z]{2,}/.test(r.text)&&!/[\u3400-\u9fff]/.test(r.text)&&r.text.length<=4000&&(cmd.options?.includeAlreadyTranslated||!r.row.querySelector('.df-chat-translation'))&&r.rectBottom>=-innerHeight*(cmd.options?.viewportScreensAbove||0)&&r.rectTop<=innerHeight*(1+(cmd.options?.viewportScreensBelow||0))).slice(-(cmd.options?.limit||12)).map(({row,body,...item}:any)=>item);
      if(cmd.action==='inject')return paint(cmd);
      if(cmd.action==='cache'){for(const entry of cmd.entries||[])if(entry.sourceText)state.cache.set(hash(entry.sourceText),{...entry,sourceText:normalize(entry.sourceText)});while(state.cache.size>3000)state.cache.delete(state.cache.keys().next().value);decorate();return true;}
      if(cmd.action==='refresh')return refresh(cmd.key,cmd.state==='processing');
      if(cmd.action==='smart'){decorate();return true;}
      if(cmd.action==='state'){
        const value=cmd.state || {};const input=editor();
        if(value.conversationSignature&&value.conversationSignature!==contact().id)return false;
        if(value.expectedConversationSignature&&value.expectedConversationSignature!==contact().id)return false;
        if(Object.hasOwn(value,'sensitiveToken')){
          state.sensitive=value.sensitiveToken&&input?{token:value.sensitiveToken,text:value.sensitiveText,signature:contact().id,input,context:draftContext()}:null;state.pending=null;
        }
        if(Object.hasOwn(value,'translated')){
          if(value.translated&&input&&read(input)===canonical(value.translated)&&state.pending?.requestId===value.requestId&&state.pending.context===draftContext()){state.ready={text:canonical(value.translated),requestId:value.requestId,signature:contact().id,input,context:draftContext()};input.dataset.dfTranslatorReadyRequestId=value.requestId;state.pending=null;hint('翻译完成，请再次按发送键发送英文');}
          else if(!value.translated&&!state.pending){reset();hint(value.status || '');}
        }
        if(value.status){hint(value.status);if(/失败|超时|取消|重试/.test(value.status))reset();}
        return true;
      }
      if(cmd.action==='composer'){
        const p=cmd.payload;const input=editor();const id=contact().id;
        if(p.action==='pulse')return {ok:focus()};
        if(p.action==='clearProxy')return {ok:true};
        if(!input||!id)return {ok:false,reason:'sms-conversation-unavailable'};
        if(p.action==='write'){
          const pending=state.pending;
          if(!pending||pending.requestId!==p.requestId||pending.signature!==id||pending.input!==input||pending.context!==draftContext()||read(input)!==pending.text)return {ok:false,reason:'sms-draft-changed'};
          if(!focus()||contact().id!==id||state.pending!==pending||editor()!==input||read(input)!==pending.text||pending.context!==draftContext())return {ok:false,reason:'sms-focus-changed'};
          state.writing=true;try{if(input instanceof HTMLInputElement){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,p.text);}else{const range=document.createRange();range.selectNodeContents(input);const selection=getSelection();selection?.removeAllRanges();selection?.addRange(range);if(!document.execCommand('insertText',false,p.text))return {ok:false,reason:'sms-write-failed'};}input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:p.text}));}finally{state.writing=false;}
          return {ok:contact().id===id&&editor()===input&&read(input)===canonical(p.text)};
        }
        if(p.action==='send'||p.action==='sendExact'){
          const approval=state.pending;
          if(!approval||approval.input!==input||approval.signature!==id||approval.text!==read(input)||approval.context!==draftContext())return {ok:false,reason:'sms-draft-changed'};
          if(p.sendTarget?.conversationSignature!==id||canonical(p.text)!==read(input)||/[\u3400-\u9fff]/.test(read(input)))return {ok:false,reason:'sms-conversation-or-text-changed'};
          const buttons=mainButton();if(buttons.length!==1||buttons[0].disabled||!focus()||editor()!==input||contact().id!==id||read(input)!==canonical(p.text)||state.pending!==approval||approval.context!==draftContext())return {ok:false,reason:'sms-target-unavailable'};
          return (async()=>{
            state.sending=true;try{buttons[0].click();}finally{state.sending=false;}
            reset();await new Promise(resolve=>setTimeout(resolve,120));
            if(contact().id!==id)return {ok:false,reason:'sms-conversation-changed'};
            if(input.isConnected&&read(input)===canonical(p.text))return {ok:false,reason:'sms-native-not-accepted'};
            return {ok:true,method:'opensms-native-button'};
          })();
        }
      }
      return false;
    };
    document.addEventListener('keydown',onKey,true);document.addEventListener('click',onPointer,true);document.addEventListener('input',onInput,true);
    const timer=setInterval(()=>{sync();decorate();},600);
    const observer=new MutationObserver(sync);observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','data-id']});
    state.dispose=()=>{observer.disconnect();clearInterval(timer);document.removeEventListener('keydown',onKey,true);document.removeEventListener('click',onPointer,true);document.removeEventListener('input',onInput,true);delete document.documentElement.dataset.dfOpenSmsGuard;};
    state.editor=editor;w.__dfOpenSms=state;
  }
  return w.__dfOpenSms.apply(command);
}
export function buildOpenSmsScript(command:any) {return `(${openSmsRuntime.toString()})(${JSON.stringify(command)})`;}

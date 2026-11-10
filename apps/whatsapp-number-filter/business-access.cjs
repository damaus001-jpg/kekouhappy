const fs=require('node:fs');
const path=require('node:path');
const {createFilterBusinessMachineCode,verifyFilterBusinessCode}=require('./business-crypto.cjs');
class BusinessAccess {
 constructor(options){
  this.options=options;this.now=options.now||Date.now;
  const states=[];let damaged=false;
  for(const file of options.files){
   try{
    const value=JSON.parse(options.unprotect(fs.readFileSync(file)));
    if(value.version!==1||value.suiteId!==options.identity.suiteId||value.keyId!==options.identity.keyId||value.hardwareHash!==options.hardwareHash||!Number.isInteger(value.used)||value.used<0||value.used>3||typeof value.activated!=='boolean'||typeof value.machineCode!=='string'||!value.machineCode.startsWith('WNFB1.')||!/^[a-f0-9]{64}$/.test(value.verifier)||!Number.isSafeInteger(value.failed)||value.failed<0||!Number.isFinite(value.lockedUntil)||!Number.isFinite(value.lastSeen))throw new Error('Invalid state');
    states.push(value);
   }catch(error){if(error.code!=='ENOENT')damaged=true;}
  }
  if(states.length&&states.every(value=>value.machineCode===states[0].machineCode)){
   this.state={...states[0],used:Math.max(...states.map(value=>value.used)),activated:states.some(value=>value.activated),failed:Math.max(...states.map(value=>value.failed)),lockedUntil:Math.max(...states.map(value=>value.lockedUntil)),lastSeen:Math.max(...states.map(value=>value.lastSeen))};
  }else{
   this.state={version:1,suiteId:options.identity.suiteId,keyId:options.identity.keyId,hardwareHash:options.hardwareHash,...createFilterBusinessMachineCode(options.identity,options.hardwareHash),used:damaged||states.length?3:0,activated:false,failed:0,lockedUntil:0,lastSeen:this.now()};
  }
  this.save();
 }
 save(){
  this.state.lastSeen=Math.max(this.state.lastSeen,this.now());
  const data=this.options.protect(JSON.stringify(this.state));
  for(const file of this.options.files){fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.'+process.pid+'.tmp';fs.writeFileSync(temporary,data);fs.renameSync(temporary,file);}
 }
 status(){return {activated:this.state.activated,trialsRemaining:3-this.state.used,machineCode:this.state.machineCode,lockedUntil:this.state.lockedUntil};}
 consumeExport(){
  if(this.state.activated)return this.status();
  if(this.state.used>=3)throw Object.assign(new Error('3 次导出试用已用完，请输入业务授权码'),{code:'authorization-required'});
  this.state.used++;this.save();return this.status();
 }
 activate(code){
  const now=Math.max(this.now(),this.state.lastSeen);
  if(now<this.state.lockedUntil)throw new Error('业务授权码尝试过多，请稍后重试');
  if(typeof code!=='string'||!/^\d{4}$/.test(code)||!verifyFilterBusinessCode(this.state.machineCode,this.state.verifier,code)){
   this.state.failed++;
   if(this.state.failed%5===0)this.state.lockedUntil=now+Math.min(60,Math.ceil(this.state.failed/5))*60_000;
   this.save();throw new Error('业务授权码无效，请核对本机码和对应套装');
  }
  this.state.activated=true;this.state.failed=0;this.state.lockedUntil=0;this.save();return this.status();
 }
}
module.exports={BusinessAccess};

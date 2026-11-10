const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const testRoot=fs.mkdtempSync(path.join(root,'.tmp/nsis-upgrade-qa-'));
const token=crypto.randomBytes(6).toString('hex');
const identity='com.maoyi.upgradeqa.'+token,product='PikachuUpgradeQA-'+token;
const installRoot=path.join(testRoot,'installed-app'),dataRoot=path.join(testRoot,'custom-business-data');
if(path.dirname(installRoot)!==testRoot||fs.existsSync(installRoot))throw new Error('Unsafe QA install target');
function run(command,args,options={}){const result=spawnSync(command,args,{cwd:root,windowsHide:true,stdio:'inherit',...options});if(result.error)throw result.error;if(result.status!==0)throw new Error('QA upgrade command failed: '+path.basename(command)+' ('+result.status+')');}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(dataRoot,{recursive:true});
fs.writeFileSync(path.join(dataRoot,'license.dat'),'QA-existing-license-not-real\n');
fs.writeFileSync(path.join(dataRoot,'customer-records.dat'),'QA-existing-customers\n');
fs.writeFileSync(path.join(testRoot,'storage.json'),JSON.stringify({dataPath:dataRoot}));
const dataHashes=Object.fromEntries(fs.readdirSync(dataRoot).map(file=>[file,hash(path.join(dataRoot,file))]));
const bootstrapHash=hash(path.join(testRoot,'storage.json'));
const stubSource=path.join(testRoot,'Program.cs');fs.writeFileSync(stubSource,'using System; class Program { [STAThread] static void Main() {} }');
const stub=path.join(testRoot,'pikachu-upgrade-qa.exe');
run(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe','/out:'+stub,stubSource]);
let installed=false;
try{
 for(const phase of ['old','new']){
  const payload=path.join(testRoot,phase+'-payload'),output=path.join(testRoot,phase+'-installer');
  fs.mkdirSync(path.join(payload,'resources'),{recursive:true});fs.copyFileSync(stub,path.join(payload,'pikachu-upgrade-qa.exe'));
  fs.writeFileSync(path.join(payload,'resources/version-tag.txt'),phase+'-1.16.26');
  fs.writeFileSync(path.join(payload,phase+'-only.txt'),phase);
  if(phase==='new'){fs.mkdirSync(path.join(payload,'resources/whatsapp-filter'),{recursive:true});fs.writeFileSync(path.join(payload,'resources/whatsapp-filter/resource-marker.txt'),'new-companion-resource');}
  const config={appId:identity,productName:product,executableName:'pikachu-upgrade-qa',buildVersion:'1.16.26',compression:'store',directories:{output},extraMetadata:{name:'pikachu-upgrade-qa-'+token,version:'1.16.26'},extraResources:[],files:[],protocols:[],publish:null,win:{target:'nsis',artifactName:'upgrade-qa-'+phase+'.exe',signAndEditExecutable:false},nsis:{oneClick:false,allowToChangeInstallationDirectory:true,perMachine:false,allowElevation:false,createDesktopShortcut:false,createStartMenuShortcut:false,runAfterFinish:false,deleteAppDataOnUninstall:false,uninstallDisplayName:product}};
  const configFile=path.join(testRoot,phase+'.json');fs.writeFileSync(configFile,JSON.stringify(config,null,2));
  run(process.execPath,['node_modules/electron-builder/cli.js','--prepackaged',payload,'--win','nsis','--config',configFile]);
  const installer=path.join(output,'upgrade-qa-'+phase+'.exe');
  run(installer,['/S','/currentuser','/D='+installRoot]);installed=true;
  assert.equal(fs.readFileSync(path.join(installRoot,'resources/version-tag.txt'),'utf8'),phase+'-1.16.26');
  for(const [file,digest]of Object.entries(dataHashes))assert.equal(hash(path.join(dataRoot,file)),digest);
  assert.equal(hash(path.join(testRoot,'storage.json')),bootstrapHash);
  console.log('NSIS QA '+phase+' install passed at unchanged version 1.16.26');
 }
 assert.equal(fs.existsSync(path.join(installRoot,'old-only.txt')),false,'same-version update removes obsolete application files');
 assert.ok(fs.existsSync(path.join(installRoot,'new-only.txt')));
 assert.ok(fs.existsSync(path.join(installRoot,'resources/whatsapp-filter/resource-marker.txt')));
 const report={checkedAt:new Date().toISOString(),version:'1.16.26',checks:{sameVersionRealNsisInstallAndUpdate:true,obsoleteApplicationFilesRemoved:true,newCompanionResourceInstalled:true,customDataAndLicenseMarkersUnchanged:true,customDataBootstrapUnchanged:true},isolation:{temporaryAppId:identity,temporaryExecutableName:'pikachu-upgrade-qa.exe',productionInstallTouched:false},scope:'Real NSIS flow using lightweight QA payload and temporary installation identity; original production installer not executed.'};
 fs.writeFileSync(path.join(testRoot,'verification.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));console.log('nsisUpgradeReport='+path.join(testRoot,'verification.json'));
}finally{
 if(installed&&fs.existsSync(installRoot)){
  const uninstallers=fs.readdirSync(installRoot).filter(file=>/uninstall.*\.exe$/i.test(file));
  if(uninstallers.length===1){const executable=path.resolve(installRoot,uninstallers[0]);if(path.dirname(executable)!==installRoot)throw new Error('Unsafe QA uninstaller path');run(executable,['/S','/currentuser','_?='+installRoot]);}
 }
}

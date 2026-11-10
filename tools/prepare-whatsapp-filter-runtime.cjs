const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const packageOnly=process.argv.includes('--package');
const stageName=packageOnly?'whatsapp-filter-package-runtime':'whatsapp-filter-runtime';
const target=path.join(root,'.package-staging',stageName);
function run(args,env={}){const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,...env}});if(result.error)throw result.error;if(result.status!==0)throw new Error('Filter runtime preparation failed: '+args[0]);}
run(['tools/prepare-filter-business.cjs']);
const sources=['main.cjs','preload.cjs','business-access.cjs','launcher-bridge.cjs','data.cjs','permissions.cjs','index.html','styles.css','compact.css','theme-overrides.css','renderer.js','package.json','electron-builder.cjs','build.cjs'].map(file=>path.join('apps/whatsapp-number-filter',file));
sources.push('electron/filter-business-license.ts','src/styles.css','src/assets/pikachu-translator.ico','src/assets/pikachu-translator-logo.png','.agents/skills/whatsapp-number-filter/scripts/page.cjs','.package-secrets/whatsapp-filter-public.json');
const sourceHash=crypto.createHash('sha256');for(const file of sources)sourceHash.update(file).update(fs.readFileSync(path.join(root,file)));
const sourceDigest=sourceHash.digest('hex');
const manifestPath=path.join(root,'.package-staging',stageName+'-manifest.json');
const archive=path.join(target,'resources/app.asar');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try{
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 if(manifest.sourceDigest===sourceDigest&&fs.existsSync(path.join(target,'whatsapp-number-filter.exe'))&&fs.existsSync(archive)&&manifest.asarSha256===hash(archive)){
  console.log('Independent filter runtime is current.');process.exit(0);
 }
}catch{}
const output=path.join(root,'release/whatsapp-number-filter','0.0.1-pikachu-'+Date.now());
run(['apps/whatsapp-number-filter/build.cjs','--bundle-only'],{WNF_BUILD_OUTPUT:output});
const relative=path.relative(root,target);
if(relative!==path.join('.package-staging',stageName))throw new Error('Unsafe filter staging target');
fs.rmSync(target,{recursive:true,force:true});
fs.cpSync(path.join(output,'win-unpacked'),target,{recursive:true,errorOnExist:true});
fs.writeFileSync(manifestPath,JSON.stringify({sourceDigest,asarSha256:hash(archive),builtAt:new Date().toISOString(),output:path.relative(root,output)},null,2)+'\n');
console.log('Prepared independent Pikachu-launched filter runtime: '+target);

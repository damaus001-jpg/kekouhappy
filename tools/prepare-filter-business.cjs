const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
async function main(){
 const root=path.resolve(__dirname,'..');
 const suite=JSON.parse(fs.readFileSync(process.env.MAOYI_LICENSE_SUITE_PATH||path.join(root,'.package-secrets/current-license-suite.json'),'utf8'));
 const {filterBusinessPublicIdentity}=await import(pathToFileURL(path.join(root,'dist-electron/filter-business-license.js')).href);
 const output=path.join(root,'.package-secrets/whatsapp-filter-public.json');
 fs.writeFileSync(output,JSON.stringify(filterBusinessPublicIdentity(suite),null,2)+'\n');
 console.log('Prepared filter business public identity for suite '+suite.suiteId);
}
main().catch(error=>{console.error(error);process.exitCode=1;});

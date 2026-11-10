const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const stage=path.join(root,'.package-staging/whatsapp-number-filter/app');
const output=process.env.WNF_BUILD_OUTPUT?path.resolve(process.env.WNF_BUILD_OUTPUT):path.join(root,'release/whatsapp-number-filter/0.0.1');
const outputRelative=path.relative(path.join(root,'release/whatsapp-number-filter'),output);
if(!outputRelative||outputRelative.startsWith('..')||path.isAbsolute(outputRelative))throw new Error('Output must be a child of release/whatsapp-number-filter');
fs.mkdirSync(stage,{recursive:true});
for(const name of ['package.json','main.cjs','preload.cjs','data.cjs','permissions.cjs','launcher-bridge.cjs','business-access.cjs','index.html','styles.css','compact.css','renderer.js'])fs.copyFileSync(path.join(__dirname,name),path.join(stage,name));
fs.copyFileSync(path.join(root,'.agents/skills/whatsapp-number-filter/scripts/page.cjs'),path.join(stage,'page.cjs'));
// Reuse Pikachu artwork and the current theme tokens; account storage stays independent.
fs.copyFileSync(path.join(root,'src/assets/pikachu-translator.ico'),path.join(stage,'icon.ico'));
fs.copyFileSync(path.join(root,'src/assets/pikachu-translator-logo.png'),path.join(stage,'brand.png'));
const profile=JSON.parse(fs.readFileSync(path.join(root,'.package-secrets/whatsapp-filter-public.json'),'utf8'));
if(Object.keys(profile).sort().join(',')!=='encryptionPublicKey,keyId,suiteId')throw new Error('Filter profile must contain public fields only');
fs.writeFileSync(path.join(stage,'filter-license-public.json'),JSON.stringify(profile,null,2)+'\n');
const ts=require('typescript');
const cryptoSource=fs.readFileSync(path.join(root,'electron/filter-business-license.ts'),'utf8');
fs.writeFileSync(path.join(stage,'business-crypto.cjs'),ts.transpileModule(cryptoSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText);
const styles=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
const selectors={blackGold:':root',pink:'.theme-pink',murongPurple:'.theme-murong-purple',clearWaterBlue:'.theme-clear-water-blue'};
let themes='';
for(const [theme,selector]of Object.entries(selectors)){
 const position=styles.indexOf(selector+' {');
 if(position<0)throw new Error('Missing Pikachu theme '+theme);
 const body=styles.slice(position+selector.length+2,styles.indexOf('}',position));
 const tokens=(body.match(/--[\w-]+\s*:[^;]+;/g)||[]).filter(token=>!token.startsWith('--brand-logo'));
 if(!tokens.some(token=>token.startsWith('--accent:')))throw new Error('Incomplete Pikachu palette');
 themes+=(theme==='blackGold'?':root,':'')+':root[data-theme="'+theme+'"]{'+tokens.join('')+'}\n';
}
themes+=fs.readFileSync(path.join(__dirname,'theme-overrides.css'),'utf8');
fs.writeFileSync(path.join(stage,'themes.css'),themes);
if(process.argv.includes('--stage-only')){console.log('Staged standalone app: '+stage);process.exit(0);}
if(fs.existsSync(output))throw new Error('Output already exists; refusing to overwrite: '+output);
const result=spawnSync(process.execPath,[path.join(root,'node_modules/electron-builder/cli.js'),'--config',path.join(__dirname,'electron-builder.cjs'),...(process.argv.includes('--bundle-only')?['--dir']:['--win','nsis'])],{cwd:root,stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;process.exitCode=result.status??1;
if(result.status===0&&process.argv.includes('--verify')){
 const check=spawnSync(process.execPath,[path.join(__dirname,'verify-package.cjs'),output],{cwd:root,stdio:'inherit',windowsHide:true});
 if(check.error)throw check.error;process.exitCode=check.status??1;
}

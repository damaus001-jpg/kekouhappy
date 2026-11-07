const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const stage=path.join(root,'.package-staging/whatsapp-number-filter/app');
const output=process.env.WNF_BUILD_OUTPUT?path.resolve(process.env.WNF_BUILD_OUTPUT):path.join(root,'release/whatsapp-number-filter/0.0.1');
const outputRelative=path.relative(path.join(root,'release/whatsapp-number-filter'),output);
if(!outputRelative||outputRelative.startsWith('..')||path.isAbsolute(outputRelative))throw new Error('Output must be a child of release/whatsapp-number-filter');
fs.mkdirSync(stage,{recursive:true});
for(const name of ['package.json','main.cjs','preload.cjs','data.cjs','permissions.cjs','index.html','styles.css','compact.css','renderer.js'])fs.copyFileSync(path.join(__dirname,name),path.join(stage,name));
fs.copyFileSync(path.join(root,'.agents/skills/whatsapp-number-filter/scripts/page.cjs'),path.join(stage,'page.cjs'));
// A code-drawn W/check icon; no translator artwork or account resources are copied.
const size=256, maskBytes=size*size/8, dib=Buffer.alloc(40+size*size*4+maskBytes);
dib.writeUInt32LE(40,0);dib.writeInt32LE(size,4);dib.writeInt32LE(size*2,8);dib.writeUInt16LE(1,12);dib.writeUInt16LE(32,14);dib.writeUInt32LE(size*size*4,20);
const distance=(x,y,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);};
const points=[[55,79],[81,166],[119,112],[147,166],[177,79]];
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const cx=Math.max(48,Math.min(207,x)),cy=Math.max(48,Math.min(207,y));let alpha=Math.hypot(x-cx,y-cy)<=48?255:0;
 let color=[13,140,101];
 if(points.slice(1).some((p,i)=>distance(x,y,points[i],p)<10))color=[255,255,255];
 if(Math.hypot(x-198,y-196)<34)color=[237,255,246];
 if(distance(x,y,[180,196],[193,209])<5||distance(x,y,[193,209],[218,181])<5)color=[13,140,101];
 const offset=40+((size-1-y)*size+x)*4;dib[offset]=color[2];dib[offset+1]=color[1];dib[offset+2]=color[0];dib[offset+3]=alpha;
 if(!alpha){const bit=(size-1-y)*size+x;dib[40+size*size*4+(bit>>3)]|=128>>(bit%8);}
}
const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(dib.length,14);header.writeUInt32LE(22,18);
fs.writeFileSync(path.join(stage,'icon.ico'),Buffer.concat([header,dib]));
if(process.argv.includes('--stage-only')){console.log('Staged standalone app: '+stage);process.exit(0);}
if(fs.existsSync(output))throw new Error('Output already exists; refusing to overwrite: '+output);
const result=spawnSync(process.execPath,[path.join(root,'node_modules/electron-builder/cli.js'),'--config',path.join(__dirname,'electron-builder.cjs'),'--win','nsis'],{cwd:root,stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;process.exitCode=result.status??1;
if(result.status===0&&process.argv.includes('--verify')){
 const check=spawnSync(process.execPath,[path.join(__dirname,'verify-package.cjs'),output],{cwd:root,stdio:'inherit',windowsHide:true});
 if(check.error)throw check.error;process.exitCode=check.status??1;
}

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');

function runtimeFiles(directory){
 return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(directory,entry.name);
  return entry.isDirectory()?runtimeFiles(file):/\.(?:[cm]?js|ts|vue|css)$/.test(entry.name)?[file]:[];
 });
}

test('translator runtime does not import or expose the independent filter',()=>{
 const markers=/whatsapp-number-filter|__codexWhatsappNumberFilter|com\.pikachu\.whatsappnumberfilter|\bWNF_[A-Z_]+\b|号码筛选/;
 for(const file of [...runtimeFiles(path.join(root,'src')),...runtimeFiles(path.join(root,'electron'))])assert.doesNotMatch(fs.readFileSync(file,'utf8'),markers,path.relative(root,file));
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.name,'maoyi');
 assert.doesNotMatch(JSON.stringify({scripts:pkg.scripts,dependencies:pkg.dependencies,build:pkg.build}),markers);
});

test('translator release configuration does not bundle independent app or skill source',()=>{
 const previous=process.env.MAOYI_CLIENT_BUILD_OUTPUT;
 let config;
 try{process.env.MAOYI_CLIENT_BUILD_OUTPUT=path.join(root,'.tmp/isolation-check-unused');config=require(path.join(root,'electron-builder.client-suite.cjs'));}
 finally{if(previous===undefined)delete process.env.MAOYI_CLIENT_BUILD_OUTPUT;else process.env.MAOYI_CLIENT_BUILD_OUTPUT=previous;}
 assert.equal(config.appId,'com.maoyi.translator');
 for(const item of config.files){assert.equal(typeof item,'string');assert.doesNotMatch(item,/^(?:\*|\*\*|\*\*\/\*)$|apps\/|\.agents\//);}
 for(const item of config.extraResources)assert.doesNotMatch(item.from,/whatsapp-number-filter|\.agents/);
});

test('independent app owns its version, storage and build output',()=>{
 const independent=JSON.parse(fs.readFileSync(path.join(__dirname,'package.json'),'utf8'));
 const translator=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(independent.name,'whatsapp-number-filter');assert.notEqual(independent.version,translator.version);
 const main=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8');
 assert.match(main,/app\.getPath\('appData'\),'WhatsappNumberFilter'/);assert.match(main,/persist:whatsapp-number-filter/);
 assert.doesNotMatch(main,/maoyi Diagnostics|SignalInstances|MAOYI_USER_DATA_DIR/);
 const config=require('./electron-builder.cjs');
 assert.equal(config.appId,'com.pikachu.whatsappnumberfilter');
 assert.ok(path.relative(path.join(root,'release/whatsapp-number-filter'),config.directories.output)&&!path.relative(path.join(root,'release/whatsapp-number-filter'),config.directories.output).startsWith('..'));
 assert.ok(config.files.includes('!node_modules{,/**/*}'));
});

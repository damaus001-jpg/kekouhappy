const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const suitePath = process.env.MAOYI_LICENSE_SUITE_PATH || path.join(root,'.package-secrets/current-license-suite.json');
const suite = JSON.parse(fs.readFileSync(suitePath,'utf8'));
if (!/^\d{9}$/.test(suite.suiteId) || !suite.privateKeyPem || !suite.publicKeySha256) throw new Error('Current suite is incomplete.');
const version = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const output = path.join(root,'release','authorizer',`${version}-whatsapp-filter-${suite.suiteId}`);
if (fs.existsSync(output)) throw new Error('Refusing to overwrite an existing authorizer output.');
const files = [path.join(root,'.package-secrets/issuer-build/license-suite.sealed'),path.join(root,'dist-electron/issuer-suite-key.json')];
const originals = files.map(file=>({file,data:fs.existsSync(file)?fs.readFileSync(file):null}));
function run(args,env={}) {
  const result=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,...env},stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`Authorizer build step failed: ${path.basename(args[0])}`);
}
try {
  const npmCli=process.env.npm_execpath;
  if(!npmCli)throw new Error('Run with npm run package:issuer-current.');
  run([npmCli,'run','build']);
  run(['tools/test-filter-business-license.mjs']);
  run(['tools/test-license-core.mjs']);
  run(['tools/test-issuer-suite-isolation.mjs']);
  const actualPublic=crypto.createPublicKey(suite.privateKeyPem).export({type:'spki',format:'pem'}).toString();
  if(actualPublic.trim()!==suite.publicKeyPem.trim() || crypto.createHash('sha256').update(suite.publicKeyPem).digest('hex')!==suite.publicKeySha256.toLowerCase())throw new Error('Current suite key identity mismatch.');
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);
  try {
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    const issuerSuite={suiteId:suite.suiteId,issuerId:suite.issuerId,productId:suite.productId,keyId:suite.keyId,publicKeyPem:suite.publicKeyPem,privateKeyPem:suite.privateKeyPem,publicKeySha256:suite.publicKeySha256,privateKeySha256:suite.privateKeySha256,createdAt:suite.createdAt};
    const ciphertext=Buffer.concat([cipher.update(JSON.stringify(issuerSuite),'utf8'),cipher.final()]);
    for(const file of files)fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(files[0],JSON.stringify({version:1,algorithm:'AES-256-GCM',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')})+'\n',{mode:0o600});
    fs.writeFileSync(files[1],JSON.stringify({key:key.toString('base64'),suiteId:suite.suiteId,keyId:suite.keyId,publicKeySha256:suite.publicKeySha256})+'\n',{mode:0o600});
  } finally {key.fill(0);}
  run(['node_modules/electron-builder/cli.js','--win','portable','--config','electron-builder.issuer-suite.cjs'],{MAOYI_ISSUER_BUILD_OUTPUT:output});
  console.log(`authorizerOutput=${output}`);
  console.log(`suiteId=${suite.suiteId}`);
} finally {
  for(const item of originals) {
    if(item.data===null) { if(fs.existsSync(item.file))fs.unlinkSync(item.file); }
    else {fs.mkdirSync(path.dirname(item.file),{recursive:true});fs.writeFileSync(item.file,item.data,{mode:0o600});}
  }
}

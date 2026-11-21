const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.argv[2]||'release/1.16.29-signal-mainline');
assert.equal(path.dirname(output),path.join(root,'release'));
const resources=path.join(output,'win-unpacked/resources'),archive=path.join(resources,'app.asar');
const extract=(file,name)=>asar.extractFile(file,path.normalize(name));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert.equal(pkg.version,'1.16.29');const packagedMetadata=JSON.parse(extract(archive,'package.json'));
for(const field of ['name','version','shortVersionWindows','main','dependencies','description','productName'])assert.deepEqual(packagedMetadata[field],pkg[field],field);
assert.equal(hash(path.join(root,'dist-electron/main.js')),crypto.createHash('sha256').update(extract(archive,'dist-electron/main.js')).digest('hex').toUpperCase());
for(const file of ['electron/preload.cjs','electron/webview-send-guard-preload.cjs','electron/storage-migration-preload.cjs'])assert.ok(extract(archive,file).equals(fs.readFileSync(path.join(root,file))));
const entries=asar.listPackage(archive).map(name=>name.replaceAll('\\','/').replace(/^\//,''));
for(const file of entries.filter(name=>name.startsWith('dist/')&&!asar.statFile(archive,path.normalize(name)).files))assert.ok(extract(archive,file).equals(fs.readFileSync(path.join(root,file))),file);
const frontend=extract(archive,entries.find(name=>/^dist\/assets\/index-.*\.js$/.test(name))).toString();
for(const marker of ['启动后台','彻底关闭后台','backend8070-menu'])assert.ok(frontend.includes(marker),marker);
assert.ok(extract(archive,'dist-electron/main.js').toString().includes('backend8070:control'));
const suite=JSON.parse(fs.readFileSync(path.join(resources,'license-suite-public.json'),'utf8'));
assert.equal(suite.suiteId,'572987197');
const signal=path.join(resources,'signal'),signalArchive=path.join(signal,'resources/app.asar');
assert.equal(JSON.parse(extract(signalArchive,'package.json')).version,'8.36.0');
for(const file of ['Signal.exe','resources/app.asar'])assert.equal(hash(path.join(signal,file)),hash(path.join(root,'.package-staging/signal',file)));
const sourceUi=JSON.parse(fs.readFileSync(path.join(root,'.tmp/signal-source-ui/2026-11-21T18-48-01-930Z-3ec92673/artifacts/report.json'),'utf8'));
assert.equal(sourceUi.result,'passed');assert.ok(sourceUi.assertions.every(item=>item.passed));
const guard=JSON.parse(fs.readFileSync(path.join(root,'.tmp/signal-packaged-guard-wiyE71/verification.json'),'utf8'));
assert.ok(Object.values(guard.checks).every(Boolean));
const upgrade=JSON.parse(fs.readFileSync(path.join(root,'.tmp/upgrade-data-copy-KmvW0L/verification.json'),'utf8'));
assert.equal(upgrade.newArchiveSha256,hash(archive).toLowerCase());assert.equal(upgrade.newState,'authorized');assert.ok(Object.values(upgrade.checks).every(Boolean));
const rollback=JSON.parse(fs.readFileSync(path.join(root,'.recovery/signal-8.18-before-1.16.29/rollback-manifest.json'),'utf8'));
assert.equal(hash(rollback.installer),rollback.installerSha256);assert.equal(hash(path.join(rollback.runtime,'resources/app.asar')),rollback.signalAsarSha256);
assert.equal(JSON.parse(extract(path.join(rollback.runtime,'resources/app.asar'),'package.json')).version,'8.18.0');
const artifact=path.join(output,'pikaqiufanyiqi-1.16.29-Setup.exe');
const report={verifiedAt:new Date().toISOString(),version:pkg.version,signalVersion:'8.36.0',suiteId:suite.suiteId,
  installer:{file:path.basename(artifact),bytes:fs.statSync(artifact).size,sha256:hash(artifact)},
  packagedSignal:{exeSha256:hash(path.join(signal,'Signal.exe')),asarSha256:hash(signalArchive)},
  checks:{allCurrentFrontendAndBundledMainAndPreloads:true,backend8070MenusIncluded:true,originalSuitePreserved:true,signal836SanitizedRuntimeMatches:true,packagedSecurityAndIsolatedStartup:true,sourceWindowAcceptance:true,packagedNegativeLaunchGuards:true,authorizationAndPersistentDataCompatibility:true,old818RuntimeAndInstallerPreserved:true},
  sourceWindowAcceptance:sourceUi,packagedGuard:guard,upgradeDataCopy:upgrade,rollback,
  limitations:['Real production installer was not executed and real platform accounts were not opened; online login retention and long-term stability are not certified.','Foreign clone rejection was tested on isolated same-machine fixtures, not a second physical computer or VM.','Legacy Apple full-runtime test remains incompatible with the current native reviewed-English Enter send handshake; its full regression is not marked passed.','Old 8.18 rollback uses its compatible pre-8.36 snapshot; the retained historical snapshot is dated 2026-11-10 and excludes later changes.']};
fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({installer:report.installer,packagedSignal:report.packagedSignal,verification:path.join(output,'verification.json')},null,2));

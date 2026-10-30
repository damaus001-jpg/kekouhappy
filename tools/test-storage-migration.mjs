import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createStorageMigrationPlan,
  renameStoragePathWithRetry,
  runStorageMigrationWorker,
  storageDataRootName,
  storageMigrationRenameRetryDelaysMs,
  activeStorageMigration,reserveStorageMigration,releaseStorageMigration,setStorageMigrationWorkerPid
} from '../dist-electron/storage-migration.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'maoyi-storage-migration-test-'));
const sourceParent = path.join(testRoot, 'source');
const sourceRoot = path.join(sourceParent, storageDataRootName);
const targetParent = path.join(testRoot, 'target');
const bootstrapPath = path.join(testRoot, 'maoyi Launcher', 'storage.json');

assert.deepEqual(
  [...storageMigrationRenameRetryDelaysMs],
  [0, 100, 250, 500, 1_000, 2_000]
);

let transientAttempts = 0;
await renameStoragePathWithRetry('source', 'target', {
  platform: 'win32',
  delaysMs: [0, 0, 0],
  operation: async () => {
    transientAttempts += 1;
    if (transientAttempts < 3) {
      const error = new Error('temporarily occupied');
      error.code = 'EPERM';
      throw error;
    }
  }
});
assert.equal(transientAttempts, 3, 'A transient Windows rename error must be retried with a finite limit.');

let exhaustedAttempts = 0;
await assert.rejects(
  renameStoragePathWithRetry('source', 'target', {
    platform: 'win32',
    delaysMs: [0, 0, 0],
    operation: async () => {
      exhaustedAttempts += 1;
      const error = new Error('still occupied');
      error.code = 'EBUSY';
      throw error;
    }
  }),
  /still occupied/
);
assert.equal(exhaustedAttempts, 3, 'Transient rename retries must stop at the configured limit.');

let permanentAttempts = 0;
await assert.rejects(
  renameStoragePathWithRetry('source', 'target', {
    platform: 'win32',
    delaysMs: [0, 0, 0],
    operation: async () => {
      permanentAttempts += 1;
      const error = new Error('invalid target');
      error.code = 'ENOENT';
      throw error;
    }
  }),
  /invalid target/
);
assert.equal(permanentAttempts, 1, 'Permanent rename errors must fail immediately.');

await fs.rm(testRoot, { recursive: true, force: true });
await fs.mkdir(path.join(sourceRoot, 'Partitions', 'profile-1'), { recursive: true });
await fs.mkdir(path.join(sourceRoot, 'TranslationCache', 'empty-directory'), { recursive: true });
await fs.mkdir(targetParent, { recursive: true });
await fs.writeFile(path.join(sourceRoot, 'license.dat'), 'encrypted-license-test\n');
await fs.writeFile(path.join(sourceRoot, 'config.json'), '{"profiles":[]}\n');
await fs.writeFile(path.join(sourceRoot, 'Partitions', 'profile-1', 'Cookies'), Buffer.alloc(4096, 17));
await fs.writeFile(path.join(sourceRoot, 'lockfile'), 'transient-process-lock');
await fs.mkdir(path.dirname(bootstrapPath), { recursive: true });
await fs.writeFile(bootstrapPath, `${JSON.stringify({ dataPath: sourceRoot }, null, 2)}\n`);

const { planPath, plan } = await createStorageMigrationPlan({
  sourceRoot,
  targetParent,
  bootstrapPath,
  parentProcessId: 2_147_483_647,
  restartPackagedClient: false
});
await reserveStorageMigration(planPath);
assert.ok(await activeStorageMigration(bootstrapPath),'a reservation blocks startup before the worker takes over');
const migrationModuleUrl=new URL('../dist-electron/storage-migration.js',import.meta.url).href;
const separateProcess=execFileSync(process.execPath,['--input-type=module','-e',`import {activeStorageMigration} from ${JSON.stringify(migrationModuleUrl)};console.log(Boolean(await activeStorageMigration(${JSON.stringify(bootstrapPath)})));`],{encoding:'utf8',windowsHide:true});
assert.equal(separateProcess.trim(),'true','a different process sees the migration reservation');
execFileSync(process.execPath,['--input-type=module','-e',`import {releaseStorageMigration} from ${JSON.stringify(migrationModuleUrl)};await releaseStorageMigration(${JSON.stringify(planPath)});`],{windowsHide:true});
assert.ok(await activeStorageMigration(bootstrapPath),'another process cannot release a live migration reservation');
await assert.rejects(reserveStorageMigration(planPath),/正在迁移/,'a second operation cannot replace an active reservation');
const progress=[];
const result = await runStorageMigrationWorker(planPath,{onProgress:value=>progress.push(value)});
assert.deepEqual([...new Set(progress.map(p=>p.phase))],['waiting','scanning','copying','verifying','switching','completed']);
assert.equal(progress.at(-1).processedBytes,progress.at(-1).totalBytes);
assert.equal(await activeStorageMigration(bootstrapPath),null,'successful completion releases startup protection');

assert.equal(result.targetRoot, plan.targetRoot);
assert.equal(await fs.readFile(path.join(plan.targetRoot, 'license.dat'), 'utf8'), 'encrypted-license-test\n');
assert.deepEqual(
  await fs.readFile(path.join(plan.targetRoot, 'Partitions', 'profile-1', 'Cookies')),
  Buffer.alloc(4096, 17)
);
assert.equal((await fs.stat(path.join(plan.targetRoot, 'TranslationCache', 'empty-directory'))).isDirectory(), true);
await assert.rejects(fs.stat(path.join(plan.targetRoot, 'lockfile')), /ENOENT/);
assert.equal((await fs.stat(sourceRoot)).isDirectory(), true, 'The original data root must remain as a backup.');
assert.equal(JSON.parse(await fs.readFile(bootstrapPath, 'utf8')).dataPath, plan.targetRoot);

await assert.rejects(
  createStorageMigrationPlan({
    sourceRoot,
    targetParent,
    bootstrapPath,
    parentProcessId: 2_147_483_647
  }),
  /目标目录已存在/
);
await assert.rejects(
  createStorageMigrationPlan({
    sourceRoot,
    targetParent: sourceRoot,
    bootstrapPath,
    parentProcessId: 2_147_483_647
  }),
  /不能互相嵌套/
);

const mainSource = await fs.readFile(path.join(root, 'electron', 'main.ts'), 'utf8');
const migrationSource = await fs.readFile(path.join(root, 'electron', 'storage-migration.ts'), 'utf8');
const preloadSource = await fs.readFile(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const appSource = await fs.readFile(path.join(root, 'src', 'App.vue'), 'utf8');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

assert.match(migrationSource, /await finished\(stream, \{ cleanup: true \}\)/);
assert.match(mainSource, /maoyi Developer Launcher/);
assert.match(mainSource, /maoyi Developer Data/);
assert.match(mainSource, /storage:get-location/);
assert.match(mainSource, /storage:change-location/);
assert.match(preloadSource, /changeStorageLocation/);
assert.match(appSource, /数据存储位置/);
assert.match(appSource, /更改数据目录/);
assert.ok(mainSource.indexOf('if (await showActiveStorageMigration(storageBootstrapPath()))')<mainSource.indexOf('if (!(await initializeUserDataPath()))'),'startup checks migration before opening any workspace data');
assert.match(mainSource,/storageMigrationScheduled\) \{ void showActiveStorageMigration/);
assert.ok(packageJson.build.files.includes('electron/storage-migration-preload.cjs'));
assert.ok(packageJson.build.files.includes('dist-electron/main.js'));
const pointerCommitIndex = migrationSource.indexOf('await writeAtomic(plan.bootstrapPath');
const targetReleaseIndex = migrationSource.indexOf('targetCreated = false;', pointerCommitIndex);
const bestEffortPlanCleanupIndex = migrationSource.indexOf(
  'await rm(resolvedPlanPath, { force: true }).catch(() => undefined);',
  targetReleaseIndex
);
assert.ok(
  pointerCommitIndex >= 0 &&
    targetReleaseIndex > pointerCommitIndex &&
    bestEffortPlanCleanupIndex > targetReleaseIndex,
  'The active target must be released from rollback ownership before best-effort plan cleanup.'
);

const failureParent=path.join(testRoot,'failure-target');await fs.mkdir(failureParent);
const failurePlan=await createStorageMigrationPlan({sourceRoot,targetParent:failureParent,bootstrapPath,parentProcessId:2_147_483_647});
const originalPointer=await fs.readFile(bootstrapPath,'utf8');
await assert.rejects(runStorageMigrationWorker(failurePlan.planPath,{onProgress:value=>{if(value.phase==='copying')writeFileSync(path.join(sourceRoot,'license.dat'),'changed during copy');}}),/完整性检查失败/);
assert.equal(await fs.readFile(bootstrapPath,'utf8'),originalPointer,'failure retains the previous pointer');
assert.equal(await activeStorageMigration(bootstrapPath),null,'failure releases startup protection');
assert.equal((await fs.stat(sourceRoot)).isDirectory(),true);
await assert.rejects(fs.stat(failurePlan.plan.stagingRoot),/ENOENT/);
await assert.rejects(fs.stat(failurePlan.plan.targetRoot),/ENOENT/);
await fs.rm(failurePlan.planPath,{force:true});
const handoff=await createStorageMigrationPlan({sourceRoot,targetParent:failureParent,bootstrapPath});
await reserveStorageMigration(handoff.planPath);
await assert.rejects(setStorageMigrationWorkerPid(handoff.planPath,0),/进程编号无效/);
await setStorageMigrationWorkerPid(handoff.planPath,process.pid);
assert.equal((await activeStorageMigration(bootstrapPath)).workerProcessId,process.pid,'handoff records the real worker before the parent exits');
await releaseStorageMigration(handoff.planPath);
await fs.writeFile(path.join(path.dirname(bootstrapPath),'storage-migration-active.json'),JSON.stringify({planPath:handoff.planPath,parentProcessId:process.pid,workerProcessId:2_147_483_647,createdAt:Date.now()}));
assert.equal(await activeStorageMigration(bootstrapPath),null,'an interrupted worker does not permanently block future startup');
await fs.rm(handoff.planPath,{force:true});
await fs.rm(testRoot, { recursive: true, force: true });
console.log('storage-migration: safe verified copy, backup retention, progress, cross-process startup guard, duplicate prevention, failure rollback and release passed');

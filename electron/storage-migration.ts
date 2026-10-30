import { createReadStream, createWriteStream } from 'node:fs';
import {
  open,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  statfs,
  writeFile
} from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, normalize, parse, relative, resolve } from 'node:path';
import { finished, pipeline } from 'node:stream/promises';

export const storageMigrationArgument = '--df-storage-migration-plan=';
export const storageDataRootName = 'maoyi Data';
const storageMigrationPlanTtlMs = 10 * 60_000;
const storageMigrationParentWaitMs = 30_000;
const storageMigrationFreeSpaceReserveBytes = 512 * 1024 * 1024;
export const storageMigrationRenameRetryDelaysMs = [0, 100, 250, 500, 1_000, 2_000] as const;
const transientStorageRenameErrorCodes = new Set(['EPERM', 'EBUSY', 'EACCES']);
const transientRootEntries = new Set([
  'devtoolsactiveport',
  'lockfile',
  'singletoncookie',
  'singletonlock',
  'singletonsocket'
]);
const allowedSourceRootNames = new Set([
  'maoyi',
  'maoyi data',
  'maoyi developer data'
]);
const allowedBootstrapDirectoryNames = new Set([
  'maoyi launcher',
  'maoyi developer launcher'
]);

export type StorageMigrationPlan = {
  schemaVersion: 1;
  productId: 'maoyi-translator';
  migrationId: string;
  sourceRoot: string;
  targetParent: string;
  targetRoot: string;
  stagingRoot: string;
  bootstrapPath: string;
  parentProcessId: number;
  restartPackagedClient: boolean;
  createdAt: number;
  expiresAt: number;
};

type FileManifestEntry = {
  relativePath: string;
  size: number;
  sha256: string;
};

type RenameOperation = (sourcePath: string, targetPath: string) => Promise<void>;

export type StorageMigrationProgress = {
  phase: 'waiting' | 'scanning' | 'copying' | 'verifying' | 'switching' | 'completed' | 'failed';
  completedFiles: number;
  totalFiles: number;
  processedBytes: number;
  totalBytes: number;
  estimatedRemainingSeconds?: number;
};
type MigrationLease = { planPath: string; parentProcessId: number; workerProcessId: number; createdAt: number };
const migrationLeasePath = (bootstrapPath: string) => join(dirname(bootstrapPath), 'storage-migration-active.json');

async function replaceMigrationLease(bootstrapPath: string, lease: MigrationLease) {
  const marker = migrationLeasePath(bootstrapPath);
  const temporary = `${marker}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(lease));
    await renameStoragePathWithRetry(temporary, marker);
  } finally { await rm(temporary, { force: true }); }
}

export async function setStorageMigrationWorkerPid(planPath: string, workerProcessId: number) {
  if (!Number.isSafeInteger(workerProcessId) || workerProcessId <= 0) throw new Error('迁移进程编号无效');
  const plan = await readMigrationPlan(planPath);
  const lease = await activeStorageMigration(plan.bootstrapPath);
  if (!lease || !sameStoragePath(lease.planPath, planPath) || lease.parentProcessId !== process.pid || lease.workerProcessId && lease.workerProcessId !== workerProcessId) throw new Error('迁移进程交接失败');
  await replaceMigrationLease(plan.bootstrapPath, { ...lease, workerProcessId });
}

export function storageMigrationFocusPipe(bootstrapPath: string) {
  const id = createHash('sha256').update(resolve(bootstrapPath).toLowerCase()).digest('hex').slice(0, 24);
  return process.platform === 'win32' ? `\\\\.\\pipe\\maoyi-migration-${id}` : join(tmpdir(), `maoyi-migration-${id}.sock`);
}

export async function activeStorageMigration(bootstrapPath: string): Promise<MigrationLease | null> {
  const path = migrationLeasePath(bootstrapPath);
  let lease: MigrationLease;
  try {
    let raw = await readFile(path, 'utf8');
    for (let attempt = 0; ; attempt++) {
      try { lease = JSON.parse(raw); break; }
      catch (error) { if (!(error instanceof SyntaxError) || attempt >= 5) throw error; await new Promise(r => setTimeout(r, 25)); raw = await readFile(path, 'utf8'); }
    }
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new Error('迁移状态无法读取，请保留原数据并联系供应商'); }
  if (!lease || typeof lease.planPath !== 'string' || !Number.isSafeInteger(lease.parentProcessId) || !Number.isSafeInteger(lease.workerProcessId) || !Number.isFinite(lease.createdAt)) throw new Error('迁移状态无效，请保留原数据并联系供应商');
  const plan = await readMigrationPlan(lease.planPath, false).catch(() => null);
  if (plan && sameStoragePath(plan.bootstrapPath, bootstrapPath)) {
    if (await processExists(lease.workerProcessId) || (!lease.workerProcessId && (await processExists(lease.parentProcessId) || Date.now() - lease.createdAt < 30_000))) return lease;
  }
  await rm(path, { force: true });
  return null;
}

export async function reserveStorageMigration(planPath: string, worker = false) {
  const plan = await readMigrationPlan(planPath);
  const active = await activeStorageMigration(plan.bootstrapPath);
  if (active) {
    if (!worker || !sameStoragePath(active.planPath, planPath) || active.workerProcessId && active.workerProcessId !== process.pid) throw new Error('数据正在迁移，请等待现有迁移完成');
    // Replace the lease atomically: a missing marker during handover could let a
    // second client open the source directory while it is being copied.
    await replaceMigrationLease(plan.bootstrapPath, { ...active, workerProcessId: process.pid });
    return;
  }
  await mkdir(dirname(plan.bootstrapPath), { recursive: true });
  const handle = await open(migrationLeasePath(plan.bootstrapPath), 'wx');
  try { await handle.writeFile(JSON.stringify({ planPath: resolve(planPath), parentProcessId: plan.parentProcessId, workerProcessId: worker ? process.pid : 0, createdAt: Date.now() })); }
  finally { await handle.close(); }
}

export async function releaseStorageMigration(planPath: string) {
  const plan = await readMigrationPlan(planPath, false);
  const path = migrationLeasePath(plan.bootstrapPath);
  try {
    const lease = JSON.parse(await readFile(path, 'utf8')) as MigrationLease;
    const ownsLease = lease.workerProcessId ? lease.workerProcessId === process.pid : lease.parentProcessId === process.pid;
    if (ownsLease && sameStoragePath(lease.planPath, planPath)) await rm(path, { force: true });
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

async function readMigrationPlan(planPath: string, requireFresh = true): Promise<StorageMigrationPlan> {
  const resolved = resolve(planPath);
  if (!sameStoragePath(dirname(resolved), migrationWorkRoot())) throw new Error('数据迁移计划路径无效');
  const plan = JSON.parse(await readFile(resolved, 'utf8')) as StorageMigrationPlan;
  if (plan.schemaVersion !== 1 || plan.productId !== 'maoyi-translator' || !/^[a-f0-9-]{36}$/i.test(plan.migrationId) || !Number.isSafeInteger(plan.parentProcessId) || plan.expiresAt - plan.createdAt !== storageMigrationPlanTtlMs || requireFresh && Date.now() > plan.expiresAt) throw new Error('数据迁移计划无效或已过期');
  assertOwnedTargetPath(plan);
  assertOwnedSourceAndBootstrap(plan.sourceRoot, plan.bootstrapPath);
  return plan;
}

export async function renameStoragePathWithRetry(
  sourcePath: string,
  targetPath: string,
  options: {
    platform?: NodeJS.Platform;
    delaysMs?: readonly number[];
    operation?: RenameOperation;
  } = {}
) {
  const platform = options.platform ?? process.platform;
  const delaysMs = options.delaysMs?.length
    ? options.delaysMs
    : storageMigrationRenameRetryDelaysMs;
  const operation = options.operation ?? rename;
  let lastError: unknown;
  for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
    const delayMs = delaysMs[attempt] || 0;
    if (delayMs > 0) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, delayMs));
    }
    try {
      await operation(sourcePath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      const code = (error as NodeJS.ErrnoException)?.code || '';
      const retryAllowed =
        platform === 'win32' &&
        transientStorageRenameErrorCodes.has(code) &&
        attempt < delaysMs.length - 1;
      if (!retryAllowed) throw error;
    }
  }
  throw lastError;
}

function migrationWorkRoot() {
  return join(tmpdir(), 'maoyi-Storage-Migration');
}

export function sameStoragePath(left: string, right: string) {
  return normalize(resolve(left)).toLowerCase() === normalize(resolve(right)).toLowerCase();
}

function isPathInside(parent: string, child: string) {
  const childPath = relative(resolve(parent), resolve(child));
  return Boolean(childPath && !childPath.startsWith('..') && !isAbsolute(childPath));
}

function isNormalAbsoluteDirectoryPath(path: string) {
  const resolved = resolve(path);
  return isAbsolute(resolved) && !resolved.startsWith('\\') && !sameStoragePath(resolved, parse(resolved).root);
}

function assertOwnedTargetPath(plan: Pick<StorageMigrationPlan, 'targetParent' | 'targetRoot' | 'stagingRoot' | 'migrationId'>) {
  const expectedTarget = join(resolve(plan.targetParent), storageDataRootName);
  const expectedStaging = join(resolve(plan.targetParent), `.${storageDataRootName}.migrating-${plan.migrationId}`);
  if (!sameStoragePath(plan.targetRoot, expectedTarget) || !sameStoragePath(plan.stagingRoot, expectedStaging)) {
    throw new Error('数据迁移目标路径校验失败');
  }
}

function assertOwnedSourceAndBootstrap(sourceRoot: string, bootstrapPath: string) {
  if (!allowedSourceRootNames.has(basename(resolve(sourceRoot)).toLowerCase())) {
    throw new Error('当前数据目录不是受支持的客户端数据根目录');
  }
  if (
    basename(bootstrapPath).toLowerCase() !== 'storage.json' ||
    !allowedBootstrapDirectoryNames.has(basename(dirname(bootstrapPath)).toLowerCase())
  ) {
    throw new Error('数据目录指针路径无效');
  }
}

async function pathExists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function writeAtomic(path: string, value: string) {
  const temporaryPath = `${path}.${process.pid}.${randomBytes(5).toString('hex')}.tmp`;
  const backupPath = `${path}.${process.pid}.${randomBytes(5).toString('hex')}.bak`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, value, 'utf8');
  let previousMoved = false;
  try {
    if (await pathExists(path)) {
      await renameStoragePathWithRetry(path, backupPath);
      previousMoved = true;
    }
    await renameStoragePathWithRetry(temporaryPath, path);
    if (previousMoved) await rm(backupPath, { force: true });
  } catch (error) {
    await rm(temporaryPath, { force: true });
    if (previousMoved) {
      await rm(path, { force: true });
      await renameStoragePathWithRetry(backupPath, path).catch(() => undefined);
    }
    throw error;
  }
}

export function storageMigrationPlanPathFromArgs(args = process.argv) {
  const argument = args.find(value => value.startsWith(storageMigrationArgument));
  return argument ? argument.slice(storageMigrationArgument.length) : '';
}

export function storageMigrationWorkerDataPath(planPath: string) {
  return join(migrationWorkRoot(), `worker-${Buffer.from(planPath).toString('base64url').slice(-24)}`);
}

export async function createStorageMigrationPlan(input: {
  sourceRoot: string;
  targetParent: string;
  bootstrapPath: string;
  parentProcessId?: number;
  restartPackagedClient?: boolean;
}) {
  const sourceRoot = resolve(input.sourceRoot);
  const targetParent = resolve(input.targetParent);
  const bootstrapPath = resolve(input.bootstrapPath);
  assertOwnedSourceAndBootstrap(sourceRoot, bootstrapPath);
  if (!isNormalAbsoluteDirectoryPath(sourceRoot) || !isNormalAbsoluteDirectoryPath(targetParent)) {
    throw new Error('数据目录必须是本机磁盘中的普通文件夹');
  }
  const sourceStat = await lstat(sourceRoot);
  const targetParentStat = await lstat(targetParent);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink() || !targetParentStat.isDirectory() || targetParentStat.isSymbolicLink()) {
    throw new Error('数据目录不能使用符号链接或非文件夹路径');
  }

  const migrationId = randomUUID();
  const targetRoot = join(targetParent, storageDataRootName);
  const stagingRoot = join(targetParent, `.${storageDataRootName}.migrating-${migrationId}`);
  if (
    sameStoragePath(sourceRoot, targetRoot) ||
    isPathInside(sourceRoot, targetRoot) ||
    isPathInside(targetRoot, sourceRoot)
  ) {
    throw new Error('新数据目录不能与当前目录相同，也不能互相嵌套');
  }
  if (await pathExists(targetRoot)) throw new Error(`目标目录已存在：${targetRoot}`);
  if (await pathExists(stagingRoot)) throw new Error('数据迁移临时目录已存在');

  const now = Date.now();
  const plan: StorageMigrationPlan = {
    schemaVersion: 1,
    productId: 'maoyi-translator',
    migrationId,
    sourceRoot,
    targetParent,
    targetRoot,
    stagingRoot,
    bootstrapPath,
    parentProcessId: input.parentProcessId ?? process.pid,
    restartPackagedClient: Boolean(input.restartPackagedClient),
    createdAt: now,
    expiresAt: now + storageMigrationPlanTtlMs
  };
  assertOwnedTargetPath(plan);
  const planPath = join(migrationWorkRoot(), `migration-${migrationId}.json`);
  await writeAtomic(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return { plan, planPath };
}

async function processExists(processId: number) {
  if (!Number.isInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    // A client started without elevation must still respect an elevated worker.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function waitForParentExit(processId: number) {
  const deadline = Date.now() + storageMigrationParentWaitMs;
  while (Date.now() < deadline && await processExists(processId)) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  if (await processExists(processId)) throw new Error('客户端未能在规定时间内退出，数据迁移已取消');
}

async function hashFile(path: string, onBytes?: (bytes: number) => void) {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  try {
    for await (const chunk of stream) { hash.update(chunk); onBytes?.(Buffer.byteLength(chunk)); }
    await finished(stream, { cleanup: true });
    return hash.digest('hex');
  } finally {
    stream.destroy();
  }
}

async function collectManifest(root: string, onBytes?: (bytes: number) => void, onFile?: () => void) {
  const files: FileManifestEntry[] = [];
  const directories: string[] = [];
  async function visit(current: string, relativeDirectory: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (!relativeDirectory && transientRootEntries.has(entry.name.toLowerCase())) continue;
      const sourcePath = join(current, entry.name);
      const relativePath = relativeDirectory ? join(relativeDirectory, entry.name) : entry.name;
      const itemStat = await lstat(sourcePath);
      if (itemStat.isSymbolicLink()) throw new Error(`数据目录包含不允许迁移的符号链接：${relativePath}`);
      if (itemStat.isDirectory()) {
        directories.push(relativePath);
        await visit(sourcePath, relativePath);
      } else if (itemStat.isFile()) {
        files.push({ relativePath, size: itemStat.size, sha256: await hashFile(sourcePath, onBytes) });
        onFile?.();
      } else {
        throw new Error(`数据目录包含不支持的文件类型：${relativePath}`);
      }
    }
  }
  await visit(root, '');
  return { directories, files, totalBytes: files.reduce((sum, file) => sum + file.size, 0) };
}

async function assertFreeSpace(targetParent: string, requiredBytes: number) {
  const disk = await statfs(targetParent, { bigint: true });
  const availableBytes = disk.bavail * disk.bsize;
  const minimumBytes = BigInt(requiredBytes + storageMigrationFreeSpaceReserveBytes);
  if (availableBytes < minimumBytes) {
    throw new Error('目标磁盘空间不足，迁移需要保留至少 512 MB 额外空间');
  }
}

async function copyAndVerify(plan: StorageMigrationPlan, report: (value: StorageMigrationProgress) => void) {
  const progress: StorageMigrationProgress = { phase: 'scanning', completedFiles: 0, totalFiles: 0, processedBytes: 0, totalBytes: 0 };
  let lastReport = 0, stageStarted = Date.now();
  const publish = (force = false) => {
    if (!force && Date.now() - lastReport < 150) return;
    lastReport = Date.now();
    const elapsed = (Date.now() - stageStarted) / 1000;
    const remaining = progress.totalBytes - progress.processedBytes;
    progress.estimatedRemainingSeconds = progress.totalBytes && progress.processedBytes && elapsed > 2 ? Math.ceil(remaining / (progress.processedBytes / elapsed)) : undefined;
    report({ ...progress });
  };
  publish(true);
  const sourceManifest = await collectManifest(plan.sourceRoot, bytes => { progress.processedBytes += bytes; publish(); }, () => { progress.completedFiles++; publish(); });
  await assertFreeSpace(plan.targetParent, sourceManifest.totalBytes);
  Object.assign(progress, { phase: 'copying', completedFiles: 0, totalFiles: sourceManifest.files.length, processedBytes: 0, totalBytes: sourceManifest.totalBytes });
  stageStarted = Date.now(); publish(true);
  await mkdir(plan.stagingRoot);
  for (const directory of sourceManifest.directories) {
    await mkdir(join(plan.stagingRoot, directory), { recursive: true });
  }
  for (const file of sourceManifest.files) {
    const targetPath = join(plan.stagingRoot, file.relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    const input = createReadStream(join(plan.sourceRoot, file.relativePath));
    input.on('data', chunk => { progress.processedBytes += Buffer.byteLength(chunk); publish(); });
    await pipeline(input, createWriteStream(targetPath, { flags: 'wx' }));
    progress.completedFiles++; publish();
  }
  Object.assign(progress, { phase: 'verifying', completedFiles: 0, processedBytes: 0 });
  stageStarted = Date.now(); publish(true);
  const targetManifest = await collectManifest(plan.stagingRoot, bytes => { progress.processedBytes += bytes; publish(); }, () => { progress.completedFiles++; publish(); });
  publish(true);
  if (targetManifest.files.length !== sourceManifest.files.length || targetManifest.totalBytes !== sourceManifest.totalBytes) {
    throw new Error('数据迁移完整性检查失败：文件数量或大小不一致');
  }
  const targetByPath = new Map(targetManifest.files.map(file => [file.relativePath.toLowerCase(), file]));
  for (const sourceFile of sourceManifest.files) {
    const copiedFile = targetByPath.get(sourceFile.relativePath.toLowerCase());
    if (!copiedFile || copiedFile.size !== sourceFile.size || copiedFile.sha256 !== sourceFile.sha256) {
      throw new Error(`数据迁移完整性检查失败：${sourceFile.relativePath}`);
    }
  }
  return sourceManifest;
}

function restartPackagedClient() {
  try {
    const child = spawn(process.execPath, [], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function runStorageMigrationWorker(planPath: string, options: { onProgress?: (value: StorageMigrationProgress) => void; restart?: boolean } = {}) {
  const resolvedPlanPath = resolve(planPath);
  const plan = await readMigrationPlan(resolvedPlanPath);
  await reserveStorageMigration(resolvedPlanPath, true);
  const report = (value: StorageMigrationProgress) => { try { options.onProgress?.(value); } catch { /* Display errors cannot alter the data transaction. */ } };
  report({ phase: 'waiting', completedFiles: 0, totalFiles: 0, processedBytes: 0, totalBytes: 0 });
  let targetCreated = false;
  try {
    await waitForParentExit(plan.parentProcessId);
    const manifest = await copyAndVerify(plan, report);
    report({ phase: 'switching', completedFiles: manifest.files.length, totalFiles: manifest.files.length, processedBytes: manifest.totalBytes, totalBytes: manifest.totalBytes });
    if (await pathExists(plan.targetRoot)) throw new Error(`目标目录已存在：${plan.targetRoot}`);
    await renameStoragePathWithRetry(plan.stagingRoot, plan.targetRoot);
    targetCreated = true;
    await writeAtomic(plan.bootstrapPath, `${JSON.stringify({ dataPath: plan.targetRoot }, null, 2)}\n`);
    // The launcher pointer now owns the verified target. Later cleanup failures
    // must never roll back by deleting the active data directory.
    targetCreated = false;
    await releaseStorageMigration(resolvedPlanPath);
    await rm(resolvedPlanPath, { force: true }).catch(() => undefined);
    await rm(dirname(resolvedPlanPath), { recursive: false, force: true }).catch(() => undefined);
    report({ phase: 'completed', completedFiles: manifest.files.length, totalFiles: manifest.files.length, processedBytes: manifest.totalBytes, totalBytes: manifest.totalBytes });
    const restartStarted = plan.restartPackagedClient && options.restart !== false ? restartPackagedClient() : false;
    return {
      migrationId: plan.migrationId,
      sourceRoot: plan.sourceRoot,
      targetRoot: plan.targetRoot,
      fileCount: manifest.files.length,
      totalBytes: manifest.totalBytes,
      restartStarted
    };
  } catch (error) {
    assertOwnedTargetPath(plan);
    try {
      if (await pathExists(plan.stagingRoot)) await rm(plan.stagingRoot, { recursive: true, force: true });
      if (targetCreated && await pathExists(plan.targetRoot)) await rm(plan.targetRoot, { recursive: true, force: true });
    } finally { await releaseStorageMigration(resolvedPlanPath); }
    report({ phase: 'failed', completedFiles: 0, totalFiles: 0, processedBytes: 0, totalBytes: 0 });
    if (plan.restartPackagedClient && options.restart !== false) restartPackagedClient();
    throw error;
  }
}

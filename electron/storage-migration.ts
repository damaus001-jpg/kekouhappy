import { createReadStream } from 'node:fs';
import {
  copyFile,
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
import { finished } from 'node:stream/promises';

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
  } catch {
    return false;
  }
}

async function waitForParentExit(processId: number) {
  const deadline = Date.now() + storageMigrationParentWaitMs;
  while (Date.now() < deadline && await processExists(processId)) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  if (await processExists(processId)) throw new Error('客户端未能在规定时间内退出，数据迁移已取消');
}

async function hashFile(path: string) {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  try {
    for await (const chunk of stream) hash.update(chunk);
    await finished(stream, { cleanup: true });
    return hash.digest('hex');
  } finally {
    stream.destroy();
  }
}

async function collectManifest(root: string) {
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
        files.push({ relativePath, size: itemStat.size, sha256: await hashFile(sourcePath) });
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

async function copyAndVerify(plan: StorageMigrationPlan) {
  const sourceManifest = await collectManifest(plan.sourceRoot);
  await assertFreeSpace(plan.targetParent, sourceManifest.totalBytes);
  await mkdir(plan.stagingRoot);
  for (const directory of sourceManifest.directories) {
    await mkdir(join(plan.stagingRoot, directory), { recursive: true });
  }
  for (const file of sourceManifest.files) {
    const targetPath = join(plan.stagingRoot, file.relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(join(plan.sourceRoot, file.relativePath), targetPath);
  }
  const targetManifest = await collectManifest(plan.stagingRoot);
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

export async function runStorageMigrationWorker(planPath: string) {
  const resolvedPlanPath = resolve(planPath);
  if (!sameStoragePath(dirname(resolvedPlanPath), migrationWorkRoot())) throw new Error('数据迁移计划路径无效');
  const plan = JSON.parse(await readFile(resolvedPlanPath, 'utf8')) as StorageMigrationPlan;
  if (
    plan.schemaVersion !== 1 ||
    plan.productId !== 'maoyi-translator' ||
    !plan.migrationId ||
    Date.now() > plan.expiresAt ||
    plan.expiresAt - plan.createdAt !== storageMigrationPlanTtlMs
  ) {
    throw new Error('数据迁移计划无效或已过期');
  }
  assertOwnedTargetPath(plan);
  assertOwnedSourceAndBootstrap(plan.sourceRoot, plan.bootstrapPath);
  await waitForParentExit(plan.parentProcessId);
  let targetCreated = false;
  try {
    const manifest = await copyAndVerify(plan);
    if (await pathExists(plan.targetRoot)) throw new Error(`目标目录已存在：${plan.targetRoot}`);
    await renameStoragePathWithRetry(plan.stagingRoot, plan.targetRoot);
    targetCreated = true;
    await writeAtomic(plan.bootstrapPath, `${JSON.stringify({ dataPath: plan.targetRoot }, null, 2)}\n`);
    // The launcher pointer now owns the verified target. Later cleanup failures
    // must never roll back by deleting the active data directory.
    targetCreated = false;
    await rm(resolvedPlanPath, { force: true }).catch(() => undefined);
    await rm(dirname(resolvedPlanPath), { recursive: false, force: true }).catch(() => undefined);
    const restartStarted = plan.restartPackagedClient ? restartPackagedClient() : false;
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
    if (await pathExists(plan.stagingRoot)) await rm(plan.stagingRoot, { recursive: true, force: true });
    if (targetCreated && await pathExists(plan.targetRoot)) await rm(plan.targetRoot, { recursive: true, force: true });
    if (plan.restartPackagedClient) restartPackagedClient();
    throw error;
  }
}

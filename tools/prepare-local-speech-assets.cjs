const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const cache = path.join(root, '.tmp', 'speech-assets');
const staging = path.join(root, '.package-staging', 'local-speech');
const model = {
  name: 'ggml-base-q5_1.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
  sha256: '422F1AE452ADE6F30A004D7E5C6A43195E4433BC370BF23FAC9CC591F01A8898'
};
const release = {
  name: 'whisper-bin-x64-v1.8.7.zip',
  url: 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.7/whisper-bin-x64.zip',
  sha256: 'D9627486E1C34A03745880485593473E047294260CE9A3CB0AA8DEAF15B99AF6'
};

async function hash(file, algorithm) {
  const digest = crypto.createHash(algorithm);
  await pipeline(fs.createReadStream(file), digest);
  return digest.digest('hex').toUpperCase();
}

async function ensureDownload(asset, algorithm, expected) {
  await fsp.mkdir(cache, { recursive: true });
  const target = path.join(cache, asset.name);
  try {
    if ((await hash(target, algorithm)) === expected) return target;
  } catch { /* Fetch a missing or partial cache entry below. */ }
  const partial = `${target}.partial`;
  await fsp.rm(partial, { force: true });
  const response = await fetch(asset.url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${asset.name}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(partial, { flags: 'wx' }));
  const actual = await hash(partial, algorithm);
  if (actual !== expected) {
    await fsp.rm(partial, { force: true });
    throw new Error(`${asset.name} checksum mismatch: ${actual}`);
  }
  await fsp.rename(partial, target);
  return target;
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Local speech assets are packaged for Windows only.');
  await fsp.mkdir(staging, { recursive: true });
  const modelFile = await ensureDownload(model, 'sha256', model.sha256);
  const zipFile = await ensureDownload(release, 'sha256', release.sha256);
  const extractDir = path.join(cache, 'whisper-bin-x64-v1.8.7');
  await fsp.rm(extractDir, { recursive: true, force: true });
  await fsp.mkdir(extractDir, { recursive: true });
  const quote = (value) => `'${value.replace(/'/g, "''")}'`;
  const command = `Expand-Archive -LiteralPath ${quote(zipFile)} -DestinationPath ${quote(extractDir)} -Force`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'inherit', windowsHide: true });
  const releaseDir = path.join(extractDir, 'Release');
  const binaries = ['whisper-cli.exe', 'ggml-base.dll', 'ggml-cpu.dll', 'ggml.dll', 'SDL2.dll', 'whisper.dll'];
  for (const name of binaries) await fsp.copyFile(path.join(releaseDir, name), path.join(staging, name));
  await fsp.copyFile(modelFile, path.join(staging, model.name));
  await fsp.copyFile(path.join(root, 'electron', 'local-speech-m4a-transcode.ps1'), path.join(staging, 'm4a-to-wav.ps1'));
  for (const name of [...binaries, model.name]) {
    const target = path.join(staging, name);
    if (!(await fsp.stat(target)).size) throw new Error(`Prepared local speech asset is empty: ${name}`);
  }
  console.log(`Prepared verified local speech assets in ${path.relative(root, staging)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

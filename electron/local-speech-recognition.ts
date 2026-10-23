import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import { cleanLocalSpeechTranscript, decodeLocalSpeechAudio, decodeLocalSpeechWav, localSpeechThreadCount } from './local-speech-core.js';

function localSpeechAssetPath(name: string) {
  return app.isPackaged
    ? join(process.resourcesPath, 'local-speech', name)
    : join(app.getAppPath(), '.package-staging', 'local-speech', name);
}

export async function transcribeLocalSpeechAudio(base64Audio: unknown) {
  if (process.platform !== 'win32') throw new Error('当前版本的语音识别仅支持 Windows');
  const { bytes, extension } = decodeLocalSpeechAudio(base64Audio);
  const executable = localSpeechAssetPath('whisper-cli.exe');
  const model = localSpeechAssetPath('ggml-base-q5_1.bin');
  const workDir = join(tmpdir(), 'PikaTranslator', 'speech', randomUUID());
  const inputPath = join(workDir, `voice.${extension}`);
  await mkdir(workDir, { recursive: true });
  try {
    await writeFile(inputPath, bytes, { flag: 'wx' });
    return await transcribeLocalSpeechFile(inputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function transcribeLocalSpeechFile(inputPath: string) {
  if (process.platform !== 'win32') throw new Error('当前版本的语音识别仅支持 Windows');
  const executable = localSpeechAssetPath('whisper-cli.exe');
  const model = localSpeechAssetPath('ggml-base-q5_1.bin');
  const workDir = join(tmpdir(), 'PikaTranslator', 'speech', randomUUID());
  const outputBase = join(workDir, 'transcript');
  const outputPath = `${outputBase}.txt`;
  await mkdir(workDir, { recursive: true });
  try {
    let whisperInputPath = inputPath;
    if (inputPath.toLowerCase().endsWith('.m4a')) {
      whisperInputPath = join(workDir, 'voice.wav');
      await transcodeM4aToWav(inputPath, whisperInputPath);
      decodeLocalSpeechWav((await readFile(whisperInputPath)).toString('base64'));
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, [
        '-m', model,
        '-f', whisperInputPath,
        '-l', 'auto',
        '-t', String(localSpeechThreadCount(availableParallelism())),
        '-ng',
        '-nt',
        '-np',
        '-otxt',
        '-of', outputBase
      ], { cwd: workDir, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve();
      };
      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < 16_384) stderr += chunk.toString('utf8').slice(0, 16_384 - stderr.length);
      });
      child.once('error', (error) => finish(new Error(`本地语音识别启动失败：${error.message}`)));
      child.once('exit', (code, signal) => {
        if (code === 0) finish();
        else finish(new Error(`本地语音识别失败（${signal || code}）${stderr ? `：${stderr.slice(-600)}` : ''}`));
      });
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error('本地语音识别超时，请缩短语音后重试'));
      }, 120_000);
    });
    const transcript = cleanLocalSpeechTranscript(await readFile(outputPath, 'utf8'));
    if (!transcript) throw new Error('没有识别出语音内容');
    return transcript;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function transcodeM4aToWav(inputPath: string, outputPath: string) {
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = localSpeechAssetPath('m4a-to-wav.ps1');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(powershell, [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', script,
      '-InputPath', inputPath,
      '-OutputPath', outputPath
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 8_192) stderr += chunk.toString('utf8').slice(0, 8_192 - stderr.length);
    });
    child.once('error', error => finish(new Error(`M4A 本地解码启动失败：${error.message}`)));
    child.once('exit', code => {
      if (code === 0) finish();
      else finish(new Error(`M4A 本地解码失败${stderr ? `：${stderr.trim().slice(-600)}` : `（退出码 ${code}）`}`));
    });
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('M4A 本地解码超时，请稍后重试'));
    }, 60_000);
  });
}

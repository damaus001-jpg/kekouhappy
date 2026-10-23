export const localSpeechMaxWavBytes = 12 * 1024 * 1024;
export const localSpeechMaxAudioBytes = 32 * 1024 * 1024;
export const localSpeechMaxDurationSeconds = 180;

export function localSpeechThreadCount(logicalProcessors: number) {
  const count = Number.isFinite(logicalProcessors) ? Math.floor(logicalProcessors) : 2;
  return Math.max(2, Math.min(6, count - 2));
}

export type LocalSpeechWav = {
  bytes: Buffer;
  durationSeconds: number;
};

export type LocalSpeechAudio = { bytes: Buffer; extension: 'flac' | 'm4a' | 'mp3' | 'ogg' | 'wav' };

export function decodeLocalSpeechAudio(value: unknown): LocalSpeechAudio {
  if (typeof value !== 'string' || value.length < 32 || value.length > Math.ceil(localSpeechMaxAudioBytes * 4 / 3) + 8) {
    throw new Error('语音文件大小无效');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error('语音文件编码无效');
  const bytes = Buffer.from(value, 'base64');
  let extension: LocalSpeechAudio['extension'] | '' = '';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE') extension = 'wav';
  else if (bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'fLaC') extension = 'flac';
  else if (bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'OggS') extension = 'ogg';
  else if (bytes.length >= 3 && bytes.toString('ascii', 0, 3) === 'ID3') extension = 'mp3';
  else if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) extension = 'mp3';
  else if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') extension = 'm4a';
  if (!extension) throw new Error('语音格式不受支持（支持 M4A、FLAC、MP3、OGG 和 WAV）');
  return { bytes, extension };
}

export function decodeLocalSpeechWav(value: unknown): LocalSpeechWav {
  if (typeof value !== 'string' || value.length < 64 || value.length > Math.ceil(localSpeechMaxWavBytes * 4 / 3) + 8) {
    throw new Error('语音文件大小无效');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('语音文件编码无效');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 44 || bytes.length > localSpeechMaxWavBytes || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('语音文件格式无效');
  }
  let offset = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataLength = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (size > bytes.length - start) throw new Error('语音 WAV 数据不完整');
    if (id === 'fmt ' && size >= 16) {
      format = bytes.readUInt16LE(start);
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
      bitsPerSample = bytes.readUInt16LE(start + 14);
    } else if (id === 'data') {
      dataLength = size;
    }
    offset = start + size + (size % 2);
  }
  if (format !== 1 || channels !== 1 || sampleRate !== 16_000 || bitsPerSample !== 16 || !dataLength || dataLength % 2 !== 0) {
    throw new Error('语音必须是 16kHz 单声道 PCM WAV');
  }
  const durationSeconds = dataLength / (sampleRate * channels * bitsPerSample / 8);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0.15 || durationSeconds > localSpeechMaxDurationSeconds) {
    throw new Error('语音时长超出本地识别范围（0.15–180 秒）');
  }
  return { bytes, durationSeconds };
}

export function cleanLocalSpeechTranscript(value: unknown) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, 20_000)
    : '';
}

import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export type DiagnosticEvent = { at: string; stage: string; [key: string]: string | number | boolean };
// An allowlist prevents chat text, prompts, credentials and contact names entering this log.
const textFields = new Set(['platform', 'reason', 'model', 'status', 'errorName', 'causeCode', 'causeName', 'errorType', 'errorCode', 'finishReason', 'version', 'decision', 'method', 'composerKind']);
const identityFields = new Set(['profileId', 'contactId', 'conversationId', 'messageKey', 'messageId']);
const numericFields = new Set(['elapsedMs', 'textLength', 'translatedLength', 'httpStatus', 'retryAttempt', 'retryDelayMs', 'count', 'running', 'queued', 'oldestMs', 'cacheBlocked', 'candidates', 'pending', 'attempts', 'sequence']);

export class TranslationDiagnostics {
  readonly sessionId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  readonly events: DiagnosticEvent[] = [];
  readonly counts: Record<string, number> = {};
  private writes: Promise<void> = Promise.resolve();
  private writing = 0;
  dropped = 0;
  constructor(readonly directory: string) {}
  record(stage: string, details: Record<string, unknown> = {}) {
    const event: DiagnosticEvent = { at: new Date().toISOString(), stage: stage.replace(/[^a-zA-Z0-9:._-]/g, '').slice(0, 96) };
    for (const [key, value] of Object.entries(details)) {
      if (numericFields.has(key) && typeof value === 'number' && Number.isFinite(value)) event[key] = value;
      else if (key === 'requestId' && typeof value === 'string') event[key] = createHash('sha256').update(value).digest('hex').slice(0, 16);
      else if (identityFields.has(key) && typeof value === 'string') event[key] = createHash('sha256').update(value).digest('hex').slice(0, 16);
      else if (textFields.has(key) && typeof value === 'string') event[key] = value.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 96);
      else if (['injected', 'cacheReady', 'aborted', 'keyConfigured', 'ok', 'hasChinese', 'hasReady', 'hasPending', 'conversationSignaturePresent'].includes(key) && typeof value === 'boolean') event[key] = value;
    }
    this.counts[event.stage] = (this.counts[event.stage] || 0) + 1;
    this.events.push(event);
    if (this.events.length > 5000) this.events.shift();
    if (this.writing >= 2000) { this.dropped++; return; }
    this.writing++;
    this.writes = this.writes.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const file = join(this.directory, `${this.sessionId}.jsonl`);
      const size = await stat(file).then(info => info.size).catch(() => 0);
      if (size > 8 * 1024 * 1024) await rename(file, `${file}.previous`).catch(() => {});
      await appendFile(file, `${JSON.stringify(event)}\n`, 'utf8');
    }).catch(() => { this.dropped++; }).finally(() => { this.writing--; });
  }
  async flush() { await this.writes; }
}

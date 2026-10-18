import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export type DiagnosticEvent = { at: string; stage: string; [key: string]: string | number | boolean };
// An allowlist prevents chat text, prompts, credentials and contact names entering this log.
const textFields = new Set(['platform', 'reason', 'model', 'status', 'errorName', 'causeCode', 'causeName', 'errorType', 'errorCode', 'finishReason', 'version', 'decision', 'method', 'composerKind', 'guard', 'locationHash', 'editorTag', 'editorClass', 'editorRole', 'editorContenteditable', 'editorParentTag', 'editorParentClass', 'activeTag', 'activeClass', 'activeRole', 'activeContenteditable', 'sendButtonTag', 'sendButtonClass']);
const identityFields = new Set(['profileId', 'contactId', 'conversationId', 'messageKey', 'messageId']);
const numericFields = new Set(['elapsedMs', 'textLength', 'translatedLength', 'httpStatus', 'retryAttempt', 'retryDelayMs', 'count', 'running', 'queued', 'oldestMs', 'cacheBlocked', 'candidates', 'pending', 'attempts', 'sequence', 'editableCount', 'sendButtonCount', 'iframeCount', 'cacheHits', 'cacheInjectionFailed', 'alreadyTranslated']);

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
      else if (textFields.has(key) && typeof value === 'string') event[key] = value.replace(/[^a-zA-Z0-9._:\-\s#\[\]="']/g, '').slice(0, 120);
      else if (['injected', 'cacheReady', 'aborted', 'keyConfigured', 'ok', 'hasChinese', 'hasReady', 'hasPending', 'conversationSignaturePresent', 'hasComposer'].includes(key) && typeof value === 'boolean') event[key] = value;
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
  removeProfileRecords(profileHash: string) {
    this.writes = this.writes.catch(() => undefined).then(async () => {
      for (let index = this.events.length - 1; index >= 0; index--) {
        if (this.events[index].profileId === profileHash) this.events.splice(index, 1);
      }
      let entries;
      try { entries = await readdir(this.directory, { withFileTypes: true }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      for (const entry of entries) {
        if (!entry.isFile() || !/^.+\.jsonl(?:\.previous)?$/i.test(entry.name)) continue;
        const path = join(this.directory, entry.name);
        let contents: string;
        try { contents = await readFile(path, 'utf8'); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
          throw error;
        }
        const kept: string[] = [];
        let removed = false;
        for (const line of contents.split(/\r?\n/)) {
          if (!line) continue;
          let matches = false;
          try { matches = (JSON.parse(line) as Record<string, unknown>).profileId === profileHash; }
          catch { matches = line.includes(profileHash); }
          if (matches) removed = true;
          else kept.push(line);
        }
        if (!removed) continue;
        if (!kept.length) { await rm(path, { force: true }); continue; }
        const temp = `${path}.${randomUUID()}.tmp`;
        try { await writeFile(temp, `${kept.join('\n')}\n`, 'utf8'); await rename(temp, path); }
        finally { await rm(temp, { force: true }).catch(() => undefined); }
      }
    }).catch(error => { this.dropped++; throw error; });
    return this.writes;
  }
  async flush() { await this.writes; }
}

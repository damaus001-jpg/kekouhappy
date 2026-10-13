import {
  signPromptBundle,
  verifyPromptBundle,
  type PromptSigningPrivateIdentity,
  type PromptSigningPublicIdentity
} from './prompt-bundle-signing.js';

export const smartReplyPromptBundleFileName = 'smart-reply-prompt.dfp';

const maxPromptLength = 24_000;

export type SmartReplyPrompt = {
  prompt: string;
};

type SmartReplyPromptPayload = SmartReplyPrompt & {
  schemaVersion: 2;
  generatedAt: string;
};

export function validateSmartReplyPrompt(value: unknown) {
  if (typeof value !== 'string') throw new Error('智能回复提示词无效');
  const normalized = value.replace(/^\uFEFF/, '').trim();
  if (!normalized || normalized.length > maxPromptLength) throw new Error('智能回复提示词长度无效');
  if (/__DF_LOCKED_[0-9a-f]+_\d+__/i.test(normalized)) {
    throw new Error('智能回复提示词不能包含真实运行时占位符');
  }
  return normalized;
}

export function createSmartReplyPromptBundle(
  identity: PromptSigningPrivateIdentity,
  smartReplyPrompt: SmartReplyPrompt,
  generatedAt = new Date().toISOString()
) {
  return signPromptBundle(identity, 'smart-reply', {
    schemaVersion: 2,
    generatedAt,
    prompt: validateSmartReplyPrompt(smartReplyPrompt?.prompt)
  } satisfies SmartReplyPromptPayload);
}

export function verifySmartReplyPromptBundle(
  identity: PromptSigningPublicIdentity,
  raw: string
) {
  const payload = verifyPromptBundle(identity, 'smart-reply', raw) as SmartReplyPromptPayload;
  if (payload?.schemaVersion !== 2 || typeof payload.generatedAt !== 'string') {
    throw new Error('智能回复提示词内容版本无效');
  }
  return { prompt: validateSmartReplyPrompt(payload.prompt) } satisfies SmartReplyPrompt;
}

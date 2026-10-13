import {
  signPromptBundle,
  verifyPromptBundle,
  type PromptSigningPrivateIdentity,
  type PromptSigningPublicIdentity
} from './prompt-bundle-signing.js';

export const translationPromptBundleFileName = 'translation-prompts.dfp';

const maxPromptLength = 24_000;

export type TranslationPrompts = {
  chineseToEnglish: string;
  englishToChinese: string;
};

type TranslationPromptPayload = TranslationPrompts & {
  schemaVersion: 2;
  generatedAt: string;
};

function validatePrompt(value: unknown, label: string) {
  if (typeof value !== 'string') throw new Error(`${label}无效`);
  const normalized = value.replace(/^\uFEFF/, '').trim();
  if (!normalized || normalized.length > maxPromptLength) throw new Error(`${label}长度无效`);
  if (/__DF_LOCKED_[0-9a-f]+_\d+__/i.test(normalized)) {
    throw new Error(`${label}不能包含真实运行时占位符`);
  }
  return normalized;
}

export function validateTranslationPrompts(input: TranslationPrompts): TranslationPrompts {
  return {
    chineseToEnglish: validatePrompt(input?.chineseToEnglish, '中译英提示词'),
    englishToChinese: validatePrompt(input?.englishToChinese, '英译中提示词')
  };
}

export function createTranslationPromptBundle(
  identity: PromptSigningPrivateIdentity,
  prompts: TranslationPrompts,
  generatedAt = new Date().toISOString()
) {
  const validated = validateTranslationPrompts(prompts);
  return signPromptBundle(identity, 'translation', {
    schemaVersion: 2,
    generatedAt,
    ...validated
  } satisfies TranslationPromptPayload);
}

export function verifyTranslationPromptBundle(
  identity: PromptSigningPublicIdentity,
  raw: string
) {
  const payload = verifyPromptBundle(identity, 'translation', raw) as TranslationPromptPayload;
  if (payload?.schemaVersion !== 2 || typeof payload.generatedAt !== 'string') {
    throw new Error('提示词内容版本无效');
  }
  return validateTranslationPrompts(payload);
}

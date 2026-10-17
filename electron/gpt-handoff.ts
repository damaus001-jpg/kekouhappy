import type { SmartReplyRequest } from './shared.js';
import { validateSmartReplyRequest } from './smart-reply-core.js';

export const chatGptUrl = 'https://chatgpt.com/';
export const gptReplyInstruction = '请结合以上聊天记录，并在记忆功能可用时参考你在 ChatGPT 个性化设置中保存的记忆，为我方生成三组自然、符合上下文的美式英文回复。每组附上忠实、简洁的中文释义。不要编造聊天记录中没有的信息，回复长度和语气要适合当前对话。';

export function buildGptClipboardText(request: SmartReplyRequest) {
  const validated = validateSmartReplyRequest(request);
  const transcript = {
    schema_version: 'df.smart_reply.input.v1',
    messages: validated.messages.map(({ speaker, text }) => ({ speaker, text })),
    latest_speaker: 'other',
    reply_count: 3,
    output_language: 'en-US',
    allow_sensitive_echo: false
  };
  return JSON.stringify(transcript, null, 2)
    + '\n\nself 表示我方，other 表示对方；聊天记录按时间从旧到新排列。\n\n'
    + gptReplyInstruction;
}

export async function handoffChatToGpt(request: SmartReplyRequest, services: {
  writeClipboard: (text: string) => void;
  showPrompt: (messageCount: number) => Promise<boolean>;
  openExternal: (url: string) => Promise<void>;
}) {
  const text = buildGptClipboardText(request);
  services.writeClipboard(text);
  const open = await services.showPrompt(request.messages.length);
  if (open) await services.openExternal(chatGptUrl);
  return { messageCount: request.messages.length };
}

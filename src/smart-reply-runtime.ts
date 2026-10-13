import type { WorkspaceApp } from '../electron/shared';

export type SmartReplyUiSuggestion = {
  id: 'reply_1' | 'reply_2' | 'reply_3';
  english: string;
  chinese: string;
};

type SmartReplyUiStatePayload = {
  latestMessageKey: string;
  conversationSignature: string;
  state: 'idle' | 'loading' | 'success' | 'error' | 'collapse' | 'clear';
  message?: string;
  replies?: SmartReplyUiSuggestion[];
  reopen?: boolean;
};

export type SmartReplyUiInstallResult = {
  state: 'eligible' | 'unavailable';
  eligibleMessageKeys: string[];
  conversationSignature: string;
};

export function buildSmartReplyUiInstallScript(app: WorkspaceApp) {
  const platform = JSON.stringify(app);
  return `
(() => {
  const platform = ${platform};
  if (platform === 'signal') return false;
  const uiSelector = '.df-smart-reply-host, .df-smart-reply-panel';
  const normalize = (value) => String(value || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim();
  const smartConversationSignature = () => normalize(window.__dfConversationSignature || '').split('::')[0].slice(0, 360);
  const hasEnglish = (value) => /[A-Za-z]{2,}/.test(value || '');
  const hasChinese = (value) => /[\\u4e00-\\u9fff]/.test(value || '');
  const isRendered = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return rect.width > 10 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const findScrollParent = (element) => {
    let current = element?.parentElement;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      if (/(auto|scroll)/.test(style.overflowY || '') && current.scrollHeight > current.clientHeight + 40) return current;
      current = current.parentElement;
    }
    return null;
  };
  const isNearConversationEnd = (element) => {
    const scroller = findScrollParent(element);
    if (!scroller) return true;
    const scrollerStyle = window.getComputedStyle(scroller);
    const scrollerRect = scroller.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const visualTolerance = Math.max(180, scroller.clientHeight * 0.28);
    const visuallyAtEnd = elementRect.bottom >= scrollerRect.bottom - visualTolerance &&
      elementRect.top <= scrollerRect.bottom + 40;
    const reverseAtEnd = /column-reverse/i.test(scrollerStyle.flexDirection || '') &&
      Math.abs(scroller.scrollTop) <= Math.max(80, scroller.clientHeight * 0.1);
    const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    return remaining <= Math.max(160, scroller.clientHeight * 0.18) || reverseAtEnd || visuallyAtEnd;
  };
  const hash = (value) => {
    let result = 2166136261;
    for (const character of String(value || '')) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  };
  const isListArea = (element) => Boolean(element?.closest?.([
    '#pane-side', '[data-testid="chat-list"]', '[data-testid="cell-frame-container"]',
    '.chat-list', '.dialogs-list', '.DialogList', '.ListItem',
    '[class*="ChatList"]', '[class*="chatlist"]', '[class*="dialog-list"]'
  ].join(',')));
  const whatsappPrePlainAuthor = (bubble) => {
    if (platform !== 'whatsapp' || !bubble) return '';
    const source = bubble.matches?.('[data-pre-plain-text]')
      ? bubble
      : bubble.querySelector?.('[data-pre-plain-text]');
    const value = String(source?.getAttribute?.('data-pre-plain-text') || '');
    const bracketEnd = value.indexOf('] ');
    if (bracketEnd < 0) return '';
    const authorPart = value.slice(bracketEnd + 2).trim();
    return normalize(authorPart.replace(/:\s*$/, '')).toLocaleLowerCase();
  };
  const whatsappConversationLabels = new Set();
  if (platform === 'whatsapp') {
    const chatHeader = document.querySelector('#main header') ||
      Array.from(document.querySelectorAll('header')).find((header) => !isListArea(header));
    for (const node of Array.from(chatHeader?.querySelectorAll?.('[title], [aria-label], [dir="auto"]') || [])) {
      const values = [
        node.getAttribute?.('title') || '',
        node.getAttribute?.('aria-label') || '',
        node.matches?.('[dir="auto"]') ? (node.textContent || '') : ''
      ];
      for (const value of values) {
        const label = normalize(value).toLocaleLowerCase();
        if (label && label.length <= 160) whatsappConversationLabels.add(label);
      }
    }
  }
  const hardDirection = (bubble) => {
    if (platform === 'whatsapp') {
      if (bubble.querySelector?.('[data-icon="tail-out"], [data-testid="tail-out"], [data-icon="msg-check"], [data-icon="msg-dblcheck"]')) return 'outgoing';
      if (bubble.querySelector?.('[data-icon="tail-in"], [data-testid="tail-in"]')) return 'incoming';
      const ariaNodes = [bubble, ...Array.from(bubble.querySelectorAll?.('[aria-label]') || [])];
      if (ariaNodes.some((node) => /^(?:\\u4f60|you)\s*[\\uFF1A:]/i.test(normalize(node.getAttribute?.('aria-label') || '')))) return 'outgoing';
    }
    let current = bubble;
    for (let depth = 0; current && depth < 10; depth += 1, current = current.parentElement) {
      const dataId = String(current.getAttribute?.('data-id') || '');
      const dataOutgoing = String(current.getAttribute?.('data-outgoing') || '').toLowerCase();
      const marker = [
        dataId,
        current.getAttribute?.('data-testid') || '',
        current.getAttribute?.('data-message-author') || '',
        current.getAttribute?.('aria-label') || '',
        current.className || ''
      ].join(' ').toLowerCase();
      if (dataId.startsWith('true_') || dataOutgoing === 'true' || /(?:^|[\\s_-])(?:message-out|own|outgoing|is-out|from-me|sent)(?:$|[\\s_-])/.test(marker)) return 'outgoing';
      if (dataId.startsWith('false_') || dataOutgoing === 'false' || /(?:^|[\\s_-])(?:message-in|incoming|is-in|from-them|received)(?:$|[\\s_-])/.test(marker)) return 'incoming';
    }
    return 'unknown';
  };
  const canonicalBubble = (element) => {
    if (!element) return null;
    if (platform === 'telegram') {
      return element.closest?.('.bubble[data-mid], .bubble, .Message') || null;
    }
    return element.closest?.('[data-id^="true_"], [data-id^="false_"]') ||
      element.closest?.('[data-testid="message-in"], [data-testid="message-out"]') ||
      element.closest?.('.message-in, .message-out') ||
      element.closest?.('[data-testid="msg-container"]') ||
      element.closest?.('[data-pre-plain-text]') ||
      null;
  };
  const bubbleSelector = platform === 'telegram'
    ? '.bubble[data-mid], .bubble, .Message'
    : '[data-id^="true_"], [data-id^="false_"], [data-testid="message-in"], [data-testid="message-out"], [data-testid="msg-container"], [data-pre-plain-text], .message-in, .message-out';
  const textSelector = platform === 'telegram'
    ? '.bubble-content > .message.spoilers-container > .translatable-message, .bubble-content > .message > .translatable-message, .bubble-content > .message.spoilers-container, .bubble-content > .message, .Message .text-content, .text-content, .translatable-message'
    : '[data-pre-plain-text] .selectable-text.copyable-text, [data-pre-plain-text] .selectable-text, [data-testid="msg-container"] [data-testid="selectable-text"], [data-testid="msg-container"] .selectable-text.copyable-text, [data-testid="msg-container"] .selectable-text, .message-in .selectable-text, .message-out .selectable-text';
  const uniqueBubbles = [];
  const seen = new Set();
  for (const element of Array.from(document.querySelectorAll(bubbleSelector))) {
    const bubble = canonicalBubble(element);
    if (!bubble || seen.has(bubble) || isListArea(bubble) || !isRendered(bubble)) continue;
    if (bubble.closest?.('header, footer, nav, aside, [role="dialog"], [role="menu"]')) continue;
    seen.add(bubble);
    uniqueBubbles.push(bubble);
  }
  const whatsappAuthorDirections = new Map();
  const whatsappSelfAuthors = new Set();
  if (platform === 'whatsapp') {
    for (const bubble of uniqueBubbles) {
      const author = whatsappPrePlainAuthor(bubble);
      const direction = hardDirection(bubble);
      if (!author || direction === 'unknown') continue;
      const previous = whatsappAuthorDirections.get(author);
      whatsappAuthorDirections.set(author, previous && previous !== direction ? 'unknown' : direction);
      if (direction === 'outgoing') whatsappSelfAuthors.add(author);
    }
    for (const bubble of uniqueBubbles) {
      const author = whatsappPrePlainAuthor(bubble);
      if (!author || whatsappAuthorDirections.has(author)) continue;
      if (whatsappConversationLabels.has(author) || (whatsappSelfAuthors.size > 0 && !whatsappSelfAuthors.has(author))) {
        whatsappAuthorDirections.set(author, 'incoming');
      }
    }
  }
  const exactDirection = (bubble) => {
    const hard = hardDirection(bubble);
    if (hard !== 'unknown') return hard;
    const author = whatsappPrePlainAuthor(bubble);
    return author ? (whatsappAuthorDirections.get(author) || 'unknown') : 'unknown';
  };
  const extractText = (bubble) => {
    const source = Array.from(bubble.querySelectorAll?.(textSelector) || []).find((node) => !node.closest?.([
      '[data-testid="quoted-message"]', '[data-testid*="quoted"]', '[data-testid*="reply"]',
      '.reply.quote-like', '.reply-subtitle', '.quoted-message', '.quoted', '.MessageReply',
      '.df-chat-translation', '.df-smart-reply-host', '.df-smart-reply-panel'
    ].join(',')));
    if (!source) return '';
    const clone = source.cloneNode(true);
    for (const node of Array.from(clone.querySelectorAll([
      '.df-chat-translation', '.df-chat-refresh-translation', '.df-smart-reply-host', '.df-smart-reply-panel',
      '[data-testid="quoted-message"]', '[data-testid*="quoted"]', '[data-testid*="reply"]',
      '.reply.quote-like', '.reply-subtitle', '.quoted-message', '.quoted', '.MessageReply',
      '.time', '.time-inner', '.tgico', '.i18n'
    ].join(',')))) node.remove();
    let value = normalize(clone.innerText || clone.textContent || '');
    value = value
      .replace(/\\s*(?:[01]?\\d|2[0-3]):[0-5]\\d\\s*(?:AM|PM|am|pm)?\\s*(?:✓|✓✓|✔|✔✔|↻)*\\s*$/u, '')
      .replace(/\\s*↻+\\s*$/u, '')
      .trim();
    return value;
  };
  const bubbleKey = (bubble, text) => {
    if (!bubble.dataset.dfSmartReplyKey) {
      const stable = [
        bubble.getAttribute?.('data-id') || '',
        bubble.getAttribute?.('data-mid') || '',
        bubble.getAttribute?.('data-pre-plain-text') || '',
        text
      ].join('|');
      bubble.dataset.dfSmartReplyKey = 'smart-' + hash(stable) + '-' + hash(text);
    }
    return bubble.dataset.dfSmartReplyKey;
  };
  const rows = uniqueBubbles.map((bubble) => {
    const text = extractText(bubble);
    return {
      bubble,
      text,
      direction: exactDirection(bubble),
      key: bubbleKey(bubble, text)
    };
  });
  const removeAll = () => {
    for (const node of Array.from(document.querySelectorAll(uiSelector))) node.remove();
  };
  const conversationSignature = smartConversationSignature();
  const latest = rows.at(-1);
  if (!latest || !isNearConversationEnd(latest.bubble)) {
    return { state: 'unavailable', eligibleMessageKeys: [], conversationSignature };
  }
  const eligibleRows = rows.filter((row) => row.direction === 'incoming').slice(-3);
  const eligibleMessageKeys = eligibleRows.map((row) => row.key);
  const eligibleKeySet = new Set(eligibleMessageKeys);
  if (!eligibleRows.length) {
    return { state: 'unavailable', eligibleMessageKeys: [], conversationSignature };
  }
  for (const host of Array.from(document.querySelectorAll('.df-smart-reply-host'))) {
    if (!eligibleKeySet.has(host.dataset.dfSmartReplyKey || '')) host.remove();
  }
  for (const panel of Array.from(document.querySelectorAll('.df-smart-reply-panel'))) {
    if (!eligibleKeySet.has(panel.dataset.dfSmartReplyKey || '')) panel.remove();
  }
  for (const anchor of eligibleRows) {
    const anchorIndex = rows.findIndex((row) => row.key === anchor.key);
    const contextRows = rows.slice(0, anchorIndex + 1).filter((row) =>
      (row.direction === 'incoming' || row.direction === 'outgoing') &&
      row.text && row.text.length <= 4000 && hasEnglish(row.text) && !hasChinese(row.text)
    ).slice(-8);
    const context = contextRows.map((row, index) => ({
      seq: index + 1,
      speaker: row.direction === 'incoming' ? 'other' : 'self',
      text: row.text
    }));
    let totalLength = context.reduce((sum, item) => sum + item.text.length, 0);
    while (context.length > 1 && totalLength > 8000) {
      const removed = context.shift();
      totalLength -= removed?.text.length || 0;
    }
    context.forEach((item, index) => { item.seq = index + 1; });
    const contextReady = Boolean(
      anchor.text && anchor.text.length <= 4000 && hasEnglish(anchor.text) && !hasChinese(anchor.text) &&
      context.length && context.at(-1)?.speaker === 'other' && context.at(-1)?.text === anchor.text && totalLength <= 8000
    );
    let host = anchor.bubble.querySelector('.df-smart-reply-host');
    if (!host) {
      host = document.createElement('span');
      host.className = 'df-smart-reply-host';
      host.style.cssText = 'display:inline-flex;align-items:center;margin-left:7px;vertical-align:middle;white-space:nowrap';
      const mount = anchor.bubble.querySelector('.df-chat-translation') || anchor.bubble.querySelector(textSelector) || anchor.bubble;
      mount.appendChild(host);
    }
    host.dataset.dfSmartReplyKey = anchor.key;
    host.dataset.dfSmartReplyConversation = conversationSignature;
    host.dataset.dfSmartReplyReady = contextReady ? '1' : '0';
    let button = host.querySelector('.df-smart-reply-button');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'df-smart-reply-button';
      button.textContent = '智能回复';
      const compactTelegramButton = platform === 'telegram';
      button.style.cssText = [
        'appearance:none', 'border:1px solid currentColor', 'border-radius:999px', 'background:transparent',
        'color:inherit', 'cursor:pointer', 'display:inline-flex', 'align-items:center', 'justify-content:center',
        compactTelegramButton ? 'font:600 11px/1.2 inherit' : 'font:600 12px/1.2 inherit',
        compactTelegramButton ? 'min-height:22px' : 'min-height:24px',
        compactTelegramButton ? 'padding:2px 8px' : 'padding:3px 9px',
        'opacity:.82', 'white-space:nowrap'
      ].join(';');
      host.appendChild(button);
    }
    if (!button.disabled) {
      button.textContent = '智能回复';
      button.style.opacity = '.82';
    }
    button.title = contextReady
      ? '以这条对方气泡为终点，读取向上最多 8 条英文气泡'
      : '这条对方消息没有可用的英文上下文';
    if (button.dataset.dfSmartReplyBound !== anchor.key) {
      button.dataset.dfSmartReplyBound = anchor.key;
      const trigger = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (button.disabled) return;
        const liveRows = uniqueBubbles.map((bubble) => {
          const liveText = extractText(bubble);
          return { bubble, text: liveText, direction: exactDirection(bubble), key: bubbleKey(bubble, liveText) };
        });
        const liveEligible = liveRows.filter((row) => row.direction === 'incoming').slice(-3);
        const liveAnchorIndex = liveRows.findIndex((row) => row.key === anchor.key);
        const liveAnchor = liveRows[liveAnchorIndex];
        if (!liveAnchor || !liveEligible.some((row) => row.key === anchor.key)) return;
        const liveContext = liveRows.slice(0, liveAnchorIndex + 1).filter((row) =>
          (row.direction === 'incoming' || row.direction === 'outgoing') &&
          row.text && row.text.length <= 4000 && hasEnglish(row.text) && !hasChinese(row.text)
        ).slice(-8).map((row, index) => ({
          seq: index + 1,
          speaker: row.direction === 'incoming' ? 'other' : 'self',
          text: row.text
        }));
        let liveTotal = liveContext.reduce((sum, item) => sum + item.text.length, 0);
        while (liveContext.length > 1 && liveTotal > 8000) {
          const removed = liveContext.shift();
          liveTotal -= removed?.text.length || 0;
        }
        liveContext.forEach((item, index) => { item.seq = index + 1; });
        if (!liveContext.length || liveContext.at(-1)?.speaker !== 'other' || liveContext.at(-1)?.text !== liveAnchor.text || liveTotal > 8000) {
          button.textContent = '暂无可用英文';
          window.setTimeout(() => {
            if (button.isConnected && !button.disabled) button.textContent = '智能回复';
          }, 1200);
          return;
        }
        window.__dfSmartReplyDismissed?.delete(smartConversationSignature() + '::' + anchor.key);
        const requestId = window.crypto?.randomUUID?.() || ('smart-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
        window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
        window.__dfTranslatorQueue.push({
          action: 'smart-reply-request',
          requestId,
          conversationSignature: smartConversationSignature(),
          text: JSON.stringify({ latestMessageKey: anchor.key, messages: liveContext }),
          at: Date.now()
        });
        button.disabled = true;
        button.textContent = '生成中…';
        button.style.opacity = '.58';
      };
      if (platform === 'telegram') button.addEventListener('pointerdown', trigger, true);
      button.addEventListener('click', trigger, true);
    }
  }
  return { state: 'eligible', eligibleMessageKeys, conversationSignature };
})()
`;
}

export function buildSmartReplyUiStateScript(payload: SmartReplyUiStatePayload) {
  const serialized = JSON.stringify(payload);
  return `
(() => {
  const payload = ${serialized};
  const hosts = Array.from(document.querySelectorAll('.df-smart-reply-host'));
  const host = hosts.find((item) => item.dataset.dfSmartReplyKey === payload.latestMessageKey);
  if (!host) return false;
  const normalizeConversationSignature = (value) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, 360);
  const activeConversationSignature = normalizeConversationSignature(window.__dfConversationSignature).split('::')[0];
  if (activeConversationSignature !== normalizeConversationSignature(payload.conversationSignature)) return false;
  window.__dfSmartReplyDismissed = window.__dfSmartReplyDismissed instanceof Set ? window.__dfSmartReplyDismissed : new Set();
  const dismissalKey = (key) => activeConversationSignature + '::' + key;
  if (payload.reopen) window.__dfSmartReplyDismissed.delete(dismissalKey(payload.latestMessageKey));
  const bubble = host.closest('[data-df-smart-reply-key], [data-id], [data-mid], [data-testid="msg-container"], [data-pre-plain-text], .bubble, .Message, .message-in, .message-out') || host.parentElement;
  if (!bubble) return false;
  const button = host.querySelector('.df-smart-reply-button');
  if (!button) return false;
  const removePanel = () => bubble.querySelector('.df-smart-reply-panel')?.remove();
  if (payload.state === 'clear') {
    removePanel();
    host.remove();
    return true;
  }
  if (payload.state === 'collapse') {
    removePanel();
    window.__dfSmartReplyDismissed.add(dismissalKey(payload.latestMessageKey));
    button.disabled = false;
    button.textContent = '智能回复';
    button.style.opacity = '.82';
    return true;
  }
  if (payload.state === 'idle') {
    button.disabled = false;
    button.textContent = '智能回复';
    button.style.opacity = '.82';
    return true;
  }
  if (payload.state === 'loading') {
    button.disabled = true;
    button.textContent = '生成中…';
    button.style.opacity = '.58';
    return true;
  }
  button.disabled = false;
  button.textContent = '智能回复';
  button.style.opacity = '.82';
  if (payload.state === 'error') {
    button.textContent = '重新生成';
    button.title = payload.message || '智能回复暂时不可用';
    return true;
  }
  const replies = Array.isArray(payload.replies) ? payload.replies : [];
  if (payload.state !== 'success' || replies.length !== 3) return false;
  removePanel();
  if (window.__dfSmartReplyDismissed.has(dismissalKey(payload.latestMessageKey))) return true;
  const panel = document.createElement('div');
  panel.className = 'df-smart-reply-panel';
  panel.dataset.dfSmartReplyKey = payload.latestMessageKey;
  panel.style.cssText = [
    'display:flex', 'flex-direction:column', 'gap:6px', 'margin-top:7px', 'padding:7px',
    'border:1px solid color-mix(in srgb, currentColor 24%, transparent)', 'border-radius:12px',
    'background:color-mix(in srgb, currentColor 7%, transparent)', 'color:inherit',
    'font-family:inherit', 'max-width:min(440px, calc(100vw - 80px))', 'box-sizing:border-box',
    'white-space:normal', 'clear:both'
  ].join(';');
  for (const reply of replies) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'df-smart-reply-choice';
    choice.style.cssText = [
      'appearance:none', 'border:1px solid color-mix(in srgb, currentColor 18%, transparent)',
      'border-radius:9px', 'background:color-mix(in srgb, currentColor 6%, transparent)', 'color:inherit',
      'cursor:pointer', 'display:block', 'padding:8px 10px', 'text-align:left', 'width:100%',
      'font-family:inherit', 'box-sizing:border-box'
    ].join(';');
    const english = document.createElement('div');
    english.className = 'df-smart-reply-english';
    english.textContent = String(reply.english || '');
    english.style.cssText = 'font-size:14px;font-weight:600;line-height:1.4;white-space:pre-wrap;word-break:break-word';
    const chinese = document.createElement('div');
    chinese.className = 'df-smart-reply-chinese';
    chinese.textContent = String(reply.chinese || '');
    chinese.style.cssText = 'font-size:13px;line-height:1.4;margin-top:3px;opacity:.76;white-space:pre-wrap;word-break:break-word';
    choice.append(english, chinese);
    const select = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (choice.dataset.dfSmartReplySelected === '1') return;
      choice.dataset.dfSmartReplySelected = '1';
      // Close every suggestion synchronously, before queuing the composer fill.
      for (const item of document.querySelectorAll('.df-smart-reply-host')) {
        window.__dfSmartReplyDismissed.add(dismissalKey(item.dataset.dfSmartReplyKey || ''));
      }
      for (const item of document.querySelectorAll('.df-smart-reply-panel')) item.remove();
      window.__dfTranslatorQueue = Array.isArray(window.__dfTranslatorQueue) ? window.__dfTranslatorQueue : [];
      window.__dfTranslatorQueue.push({
        action: 'smart-reply-select',
        conversationSignature: window.__dfConversationSignature || '',
        text: JSON.stringify({
          latestMessageKey: payload.latestMessageKey,
          id: reply.id,
          english: reply.english
        }),
        at: Date.now()
      });
    };
    choice.addEventListener('pointerdown', select, true);
    choice.addEventListener('click', select, true);
    panel.appendChild(choice);
  }
  const anchor = bubble.querySelector('.time, .time-inner, [data-testid="msg-meta"]');
  if (anchor?.parentElement === bubble) bubble.insertBefore(panel, anchor);
  else bubble.appendChild(panel);
  return true;
})()
`;
}

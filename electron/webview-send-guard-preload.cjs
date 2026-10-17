'use strict';

const { ipcRenderer, contextBridge } = require('electron');

// The one fixed OpenSMS browser uses sessionStorage for its login, which is
// otherwise lost with its WebContents. Restore before the site's router runs.
if (location.protocol === 'https:' && ['www.opensms.cc', 'opensms.cc'].includes(location.hostname) && typeof process !== 'undefined' && process.isMainFrame) {
  try {
    const keys = ['sa-token', 'refresh_token', 'user'];
    const saved = ipcRenderer.sendSync('opensms-login:read');
    if (saved) {
      for (const key of keys) {
        if (typeof saved[key] === 'string' && saved[key]) sessionStorage.setItem(key, saved[key]);
        else sessionStorage.removeItem(key);
      }
    }
    const snapshot = () => Object.fromEntries(keys.map(key => [key, sessionStorage.getItem(key) || '']));
    let last = '';
    const persist = () => {
      try {
        const state = snapshot(), serialized = JSON.stringify(state);
        if (serialized === last) return;
        if (ipcRenderer.sendSync('opensms-login:write', state)) last = serialized;
      } catch { /* Never put credentials into console or diagnostics. */ }
    };
    window.addEventListener('df-opensms-login-changed', persist);
    // The site's actual login/logout calls use these methods. Notify our
    // isolated preload synchronously so a login followed immediately by close
    // is durable, without exposing Electron or an IPC function to the page.
    contextBridge.executeInMainWorld({ func: () => {
      for (const name of ['setItem', 'removeItem', 'clear']) {
        const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, name);
        const original = descriptor.value;
        Object.defineProperty(Storage.prototype, name, { ...descriptor, value: function(...args) {
          const result = Reflect.apply(original, this, args);
          if (this === sessionStorage) window.dispatchEvent(new Event('df-opensms-login-changed'));
          return result;
        }});
      }
    }});
    persist();
    setInterval(persist, 250);
    window.addEventListener('pagehide', persist);
    window.addEventListener('beforeunload', persist);
    document.addEventListener('visibilitychange', persist);
  } catch { /* Keep login usable when local encryption or storage is unavailable. */ }
}

const guardVersion = '2026-10-01-webview-preload-phone-and-chinese-send-v3';
const chinesePattern = /[\u3400-\u9fff]/;
const pendingTranslations = new WeakMap();
const compositionTargets = new WeakSet();
const blockedEnterTargets = new WeakSet();
const shiftEnterUntil = new WeakMap();
const blockedPhonePrompts = new WeakMap();
// Fail closed during document startup, before the page-world SMS guard exists.
// The established WA/TG handlers below remain scoped to their original hosts.
function guardOpenSmsStartup(event) {
  if (!['opensms.cc', 'www.opensms.cc'].includes(location.hostname)) return;
  if (document.documentElement?.dataset.dfOpenSmsGuard === '2026-10-16-opensms-v1') return;
  const element = event.target?.nodeType === Node.ELEMENT_NODE ? event.target : event.target?.parentElement;
  const enter = event.key === 'Enter' && element?.closest?.('.im-chat #messageTextArea,.im-chat .mms-title-input input');
  const send = element?.closest?.('.im-chat .im-chat-send button');
  if (enter || send) { event.preventDefault(); event.stopImmediatePropagation(); }
}
for (const eventName of ['keydown', 'keypress', 'keyup', 'click']) window.addEventListener(eventName, guardOpenSmsStartup, true);
function blockPhoneNumberSend(event, composer) {
  const text = readComposerPlainText(composer).trim();
  if (!/^[0-9]{1,11}$/.test(text)) return false;
  stopNativeSend(event);
  const previous = blockedPhonePrompts.get(composer);
  if (!previous || previous.text !== text || Date.now() - previous.at > 1500) {
    blockedPhonePrompts.set(composer, { text, at: Date.now() });
    ipcRenderer.sendToHost('df-translator', { action: 'sensitive-prepare', text });
  }
  return true;
}
const whatsappComposerSelectors = [
  '[data-testid="conversation-compose-box-input"][contenteditable]:not([contenteditable="false"])',
  '[data-testid="conversation-compose-box-input"] [contenteditable]:not([contenteditable="false"])',
  '[data-testid="media-caption-input-container"][contenteditable]:not([contenteditable="false"])',
  '[data-testid="media-caption-input-container"] [contenteditable]:not([contenteditable="false"])',
  'footer [contenteditable]:not([contenteditable="false"])[role="textbox"]',
  'footer [contenteditable="true"]',
  'footer [contenteditable="plaintext-only"]'
].join(',');

function platformForPage() {
  const host = String(location.hostname || '').toLowerCase();
  if (host === 'web.whatsapp.com') return 'whatsapp';
  if (host === 'web.telegram.org') return 'telegram';
  return '';
}

function isFakeTelegramInput(element) {
  const className = String(element?.getAttribute?.('class') || '');
  return /input-field-input-fake|input-message-input-fake/.test(className);
}

function isTelegramMediaCaption(element) {
  if (!element || isFakeTelegramInput(element)) return false;
  return Boolean(
    element.matches?.(
      '.input-message-input.simple-message-input-input[data-animation-group="NEW-MEDIA"][contenteditable="true"]'
    ) &&
    element.closest?.('.simple-message-input-container')?.querySelector?.('.simple-message-input-confirm')
  );
}

function resolveComposer(target) {
  const platform = platformForPage();
  const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
  if (!element || !platform) return null;
  if (platform === 'whatsapp') {
    const composer = element.closest?.(whatsappComposerSelectors) || null;
    if (composer?.closest?.('.df-translator-host, .df-composer-review')) return null;
    return composer;
  }
  const candidate = element.closest?.(
    '.input-message-input[contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)'
  ) || null;
  if (!candidate || isFakeTelegramInput(candidate)) return null;
  if (isTelegramMediaCaption(candidate)) return candidate;
  return candidate.closest?.('.new-message-wrapper, .chat-input-main')
    ? candidate
    : null;
}

function readComposerPlainText(element) {
  if (!element) return '';
  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') return element.value || '';
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  const blockTags = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'FIGCAPTION', 'FIGURE',
    'FOOTER', 'HEADER', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'UL'
  ]);
  const childrenOf = node => Array.from(node.childNodes || []);
  const isBlock = node => node.nodeType === ELEMENT_NODE && (
    blockTags.has(node.tagName || '') || node.getAttribute?.('role') === 'paragraph'
  );
  const isPlaceholderBreak = node => {
    if (node.nodeType !== ELEMENT_NODE) return false;
    const children = childrenOf(node).filter(child =>
      child.nodeType !== TEXT_NODE || String(child.nodeValue || '').trim().length > 0
    );
    return children.length === 1 && children[0]?.nodeType === ELEMENT_NODE && children[0]?.tagName === 'BR';
  };
  const serialize = node => {
    if (node.nodeType === TEXT_NODE) return node.nodeValue || '';
    if (node.nodeType !== ELEMENT_NODE) return '';
    if (node.tagName === 'BR') return '\n';
    if (node.tagName === 'IMG') return node.getAttribute?.('alt') || '';
    const children = childrenOf(node);
    if (!children.length) return '';
    const hasBlockChild = children.some(isBlock);
    if (!hasBlockChild) return children.map(serialize).join('');
    const segments = [];
    let inline = '';
    const flushInline = () => {
      if (!inline) return;
      segments.push(inline);
      inline = '';
    };
    for (const child of children) {
      if (isBlock(child)) {
        flushInline();
        segments.push(isPlaceholderBreak(child) ? '' : serialize(child));
      } else {
        const value = serialize(child);
        if (child.nodeType === TEXT_NODE && !value.trim()) continue;
        inline += value;
      }
    }
    flushInline();
    return segments.join('\n');
  };
  return serialize(element)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ');
}

function stopNativeSend(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function stopPageSendHandlers(event) {
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function sendGuardDiagnostic(decision, composer, extra = {}) {
  const text = readComposerPlainText(composer);
  ipcRenderer.sendToHost('df-translator', {
    action: 'web-enter-guard-debug',
    text: JSON.stringify({
      version: guardVersion,
      platform: platformForPage(),
      decision,
      hasChinese: chinesePattern.test(text),
      composing: extra.composing === true,
      mediaCaption: isTelegramMediaCaption(composer)
    })
  });
}

function announceGuardReady() {
  ipcRenderer.sendToHost('df-translator', {
    action: 'web-enter-guard-ready',
    text: JSON.stringify({
      version: guardVersion,
      platform: platformForPage()
    })
  });
}

function createRequestId() {
  const suffix = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `composer-preload-${suffix}`;
}

function queueChineseTranslation(composer, decision) {
  if (!composer?.isConnected) return false;
  const text = readComposerPlainText(composer);
  const normalizedText = text.replace(/\r\n?/g, '\n').trim();
  if (!normalizedText || !chinesePattern.test(normalizedText)) return false;
  const previous = pendingTranslations.get(composer);
  if (
    previous?.text === normalizedText &&
    Date.now() - previous.at < 15_000
  ) {
    sendGuardDiagnostic(`${decision}-deduplicated`, composer);
    return true;
  }
  const requestId = createRequestId();
  pendingTranslations.set(composer, { text: normalizedText, at: Date.now(), requestId });
  composer.dataset.dfTranslatorRequestId = requestId;
  composer.dataset.dfTranslationPending = normalizedText;
  composer.dataset.dfTranslationPendingAt = String(Date.now());
  delete composer.dataset.dfTranslatedReady;
  delete composer.dataset.dfTranslatorReadyRequestId;
  ipcRenderer.sendToHost('df-translator', {
    action: 'translate',
    text,
    requestId,
    composerKind: isTelegramMediaCaption(composer) ? 'telegram-media-caption' : 'default',
    reviewEnabled: false
  });
  sendGuardDiagnostic(decision, composer);
  return true;
}

function scheduleCompositionTranslation(composer) {
  const attempt = () => {
    if (!composer?.isConnected) return;
    queueChineseTranslation(composer, 'composition-enter');
  };
  queueMicrotask(attempt);
  for (const delay of [20, 60, 120]) setTimeout(attempt, delay);
}

function isEnterKey(event) {
  return (
    event.key === 'Enter' || event.key === 'Return' ||
    event.code === 'Enter' || event.code === 'NumpadEnter' || event.keyCode === 13
  );
}

function handleKeydown(event) {
  if (!event.isTrusted) return;
  if (!isEnterKey(event)) return;
  const composer = resolveComposer(event.target) || resolveComposer(document.activeElement);
  if (!composer) return;
  if (event.shiftKey) {
    shiftEnterUntil.set(composer, Date.now() + 500);
    return;
  }
  shiftEnterUntil.delete(composer);
  if (blockPhoneNumberSend(event, composer)) return;
  // A translation can arrive between keydown and keyup. The remaining events
  // of the first physical Enter must not send the newly inserted English.
  if (blockedEnterTargets.has(composer) && (event.type !== 'keydown' || event.repeat)) {
    stopNativeSend(event);
    if (event.type === 'keyup') blockedEnterTargets.delete(composer);
    return;
  }
  const composing = Boolean(event.isComposing || event.keyCode === 229);
  if (event.ctrlKey || event.altKey || event.metaKey) {
    if (!composing && !chinesePattern.test(readComposerPlainText(composer))) return;
    stopNativeSend(event);
    blockedEnterTargets.add(composer);
    ipcRenderer.sendToHost('df-translator', { action: 'enter-only-hint', text: '' });
    sendGuardDiagnostic('chinese-modified-enter-blocked', composer);
    return;
  }
  if (composing) {
    // Keep the browser's default IME commit, but prevent WhatsApp/Telegram
    // page handlers from interpreting the same physical key as a send.
    stopPageSendHandlers(event);
    blockedEnterTargets.add(composer);
    compositionTargets.add(composer);
    scheduleCompositionTranslation(composer);
    sendGuardDiagnostic('composition-enter-blocked', composer, { composing: true });
    return;
  }
  const text = readComposerPlainText(composer);
  if (!chinesePattern.test(text)) return;
  stopNativeSend(event);
  blockedEnterTargets.add(composer);
  queueChineseTranslation(composer, 'chinese-enter-blocked');
}

function handleBeforeInput(event) {
  if (!event.isTrusted) return;
  if (
    event.inputType !== 'insertLineBreak' &&
    event.inputType !== 'insertParagraph'
  ) return;
  const composer = resolveComposer(event.target) || resolveComposer(document.activeElement);
  if (!composer || event.shiftKey || Date.now() <= (shiftEnterUntil.get(composer) || 0)) return;
  if (blockPhoneNumberSend(event, composer)) return;
  if (blockedEnterTargets.has(composer)) {
    stopNativeSend(event);
    queueChineseTranslation(composer, 'pending-enter-beforeinput-blocked');
    return;
  }
  const text = readComposerPlainText(composer);
  if (!chinesePattern.test(text) && !compositionTargets.has(composer)) return;
  stopNativeSend(event);
  queueChineseTranslation(composer, 'chinese-beforeinput-blocked');
}

function handleCompositionEnd(event) {
  if (!event.isTrusted) return;
  const composer = resolveComposer(event.target);
  if (!composer || !compositionTargets.has(composer)) return;
  compositionTargets.delete(composer);
  scheduleCompositionTranslation(composer);
}

function isSendControl(target, platform) {
  const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
  if (!element) return false;
  if (platform === 'telegram') {
    return Boolean(element.closest?.('.btn-send, .btn-send-container, .simple-message-input-confirm'));
  }
  const control = element.closest?.('button, [role="button"]');
  if (!control) return false;
  const label = [
    control.getAttribute?.('aria-label') || '',
    control.getAttribute?.('title') || '',
    control.getAttribute?.('data-testid') || '',
    control.textContent || ''
  ].join(' ').toLowerCase();
  return /compose-btn-send|(^|\s)send(\s|$)|发送/.test(label);
}

function findComposerForSendControl(target) {
  const platform = platformForPage();
  const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
  if (!element || !platform) return null;
  if (platform === 'telegram') {
    const mediaRoot = element.closest?.('.simple-message-input-container');
    if (mediaRoot) {
      return mediaRoot.querySelector?.(
        '.input-message-input.simple-message-input-input[data-animation-group="NEW-MEDIA"][contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)'
      ) || null;
    }
    return element.closest?.('.new-message-wrapper')
      ?.querySelector?.(
        '.input-message-input[contenteditable="true"]:not(.input-field-input-fake):not(.input-message-input-fake)'
      ) || null;
  }
  const root = element.closest?.('footer, [role="dialog"]') || document;
  return root.querySelector?.(whatsappComposerSelectors) || null;
}

function handlePointerSend(event) {
  if (!event.isTrusted) return;
  const platform = platformForPage();
  if (!platform || !isSendControl(event.target, platform)) return;
  const composer = findComposerForSendControl(event.target);
  if (!composer) return;
  if (blockPhoneNumberSend(event, composer)) return;
  if (!chinesePattern.test(readComposerPlainText(composer))) return;
  stopNativeSend(event);
  ipcRenderer.sendToHost('df-translator', {
    action: 'enter-only-hint',
    text: ''
  });
  sendGuardDiagnostic('chinese-pointer-send-blocked', composer);
  composer.focus?.();
}

for (const target of [window, document]) {
  target.addEventListener('keydown', handleKeydown, true);
  target.addEventListener('keypress', handleKeydown, true);
  target.addEventListener('keyup', handleKeydown, true);
  target.addEventListener('beforeinput', handleBeforeInput, true);
  target.addEventListener('compositionend', handleCompositionEnd, true);
}
for (const eventName of ['pointerdown', 'mousedown', 'click']) {
  window.addEventListener(eventName, handlePointerSend, true);
}

announceGuardReady();
window.addEventListener('DOMContentLoaded', announceGuardReady, { once: true });
for (const delay of [250, 1000, 3000]) setTimeout(announceGuardReady, delay);
setInterval(announceGuardReady, 5000);

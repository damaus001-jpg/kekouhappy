// These bindings belong to the local phone workspace's main-world script.
declare const workspaceDevice: string | null;
declare const workspaceRevision: number;
declare const currentConversationId: string | null;
declare const currentConversation: any;
declare const workspaceBusy: boolean;
declare const sendBlocked: boolean;
declare const controlOwner: string | null;

export function appleRuntime(command: any) {
  if (location.origin !== 'http://127.0.0.1:8070' || window.top !== window) return false;
  const w = window as any;
  const version = '2026-11-02-apple-v1';
  if (w.__dfApple?.version !== version) {
    w.__dfApple?.dispose();
    const state: any = { version, enabled: false, signature: '', context: '', input: null, pending: null, ready: null, sensitive: null, writing: false, sending: false, inFlight: false, composing: false, cache: new Map() };
    const canonical = (value: unknown) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').normalize('NFC').trim();
    const hash = (value: string) => { let h = 2166136261; for (const c of value) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
    const visible = (node: HTMLElement | null) => !!node?.isConnected && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0 && getComputedStyle(node).visibility !== 'hidden';
    const editor = () => document.querySelector<HTMLTextAreaElement>('#reply-box #reply-zh');
    const button = () => document.querySelector<HTMLButtonElement>('#reply-box #send-reply');
    const read = (input = editor()) => canonical(input?.value);
    const contact = () => {
      try {
        if (typeof workspaceDevice !== 'string' || !workspaceDevice || typeof currentConversation === 'undefined' || !currentConversation || typeof currentConversationId !== 'string' || currentConversation.id !== currentConversationId) return { id: '', title: '' };
        const phone = canonical(currentConversation.phone_number);
        if (phone && canonical(document.getElementById('peer-phone')?.textContent) !== phone) return { id: '', title: '' };
        return { id: ['apple', workspaceDevice, currentConversationId, phone].map(encodeURIComponent).join(':'), title: phone || canonical(currentConversation.contact), phone };
      } catch { return { id: '', title: '' }; }
    };
    const context = () => contact().id + ':' + (typeof workspaceRevision === 'number' ? workspaceRevision : '') + ':' + (typeof controlOwner === 'string' ? controlOwner : '');
    const emit = (action: string, text = '', requestId = '') => {
      w.__dfTranslatorQueue ||= [];
      w.__dfTranslatorQueue.push({ action, text, requestId, conversationSignature: contact().id });
      if (w.__dfTranslatorQueue.length > 100) w.__dfTranslatorQueue.splice(0, w.__dfTranslatorQueue.length - 100);
    };
    const hint = (text: string) => {
      let node = document.getElementById('df-apple-composer-status');
      const box = document.getElementById('reply-box');
      if (!box) return;
      if (!node) { node = document.createElement('div'); node.id = 'df-apple-composer-status'; node.setAttribute('role', 'status'); box.append(node); }
      if (node.textContent !== text) node.textContent = text;
      node.hidden = !text;
    };
    const reset = () => {
      state.pending = null; state.ready = null; state.sensitive = null;
      const input = editor();
      if (input) { delete input.dataset.dfTranslatorRequestId; delete input.dataset.dfTranslatorReadyRequestId; }
    };
    const sync = () => {
      const stamp = context(), input = editor(), id = contact().id;
      if (stamp !== state.context || input !== state.input) {
        reset(); state.inFlight = false; state.context = stamp; state.signature = id; state.input = input;
        w.__dfConversationSignature = id; emit('conversation-change', id); hint('');
      }
      return id;
    };
    const available = () => {
      const input = editor(), send = button();
      return state.enabled && !!contact().id && visible(input) && !input!.disabled && visible(send) && !send!.disabled &&
        !(typeof workspaceBusy === 'boolean' && workspaceBusy) && !(typeof sendBlocked === 'boolean' && sendBlocked) &&
        !(typeof controlOwner === 'string' && typeof workspaceDevice === 'string' && controlOwner !== workspaceDevice);
    };
    const rows = () => {
      const id = contact().id, box = document.getElementById('messages');
      if (!id || !box) return [];
      return Array.from(box.querySelectorAll<HTMLElement>(':scope > .message')).flatMap((row, index) => {
        const body = row.querySelector<HTMLElement>('.bubble > .original');
        const text = canonical(body?.textContent);
        if (!body || !text || /^\[(?:附件消息|正文解析未完成|无文字内容)\]$/.test(text)) return [];
        const timestamp = canonical(row.querySelector('.message-meta')?.textContent?.replace(/^[^·]*·\s*/, ''));
        const direction = row.classList.contains('outgoing') ? 'outgoing' : row.classList.contains('incoming') ? 'incoming' : 'unknown';
        const key = `${id}:${row.dataset.messageId ?? index}:${hash(text)}:${hash(timestamp)}`;
        if (row.dataset.dfMsgKey && row.dataset.dfMsgKey !== key) row.querySelectorAll('.df-chat-translation').forEach(node => node.remove());
        row.dataset.dfMsgKey = key;
        const rect = row.getBoundingClientRect(), bounds = box.getBoundingClientRect();
        return [{ row, body, key, text, timestamp, direction, contactId: id, contactIdType: 'platform', contactTitle: contact().title, conversationSignature: id,
          scanBand: rect.bottom < bounds.top ? 'above' : rect.top > bounds.bottom ? 'below' : 'visible', nearConversationEnd: box.scrollHeight - box.scrollTop - box.clientHeight < 80,
          rectTop: rect.top, rectBottom: rect.bottom, rectHeight: rect.height, viewportHeight: innerHeight,
          inViewport: rect.bottom >= bounds.top && rect.top <= bounds.bottom, rectLeft: rect.left, rectRight: rect.right }];
      });
    };
    const preserveScroll = (change: () => void) => {
      const box = document.getElementById('messages');
      if (!box) return;
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
      const anchor = Array.from(box.querySelectorAll<HTMLElement>(':scope > .message')).find(row => row.getBoundingClientRect().bottom >= box.getBoundingClientRect().top);
      const top = anchor?.getBoundingClientRect().top ?? 0;
      change();
      if (atBottom) box.scrollTop = box.scrollHeight;
      else if (anchor?.isConnected) box.scrollTop += anchor.getBoundingClientRect().top - top;
    };
    const inject = (item: any, text: string, replace = false) => {
      let node = item.body.parentElement.querySelector('.df-chat-translation');
      if (node && !replace) return;
      if (!node) { node = document.createElement('div'); node.className = 'df-chat-translation notranslate'; node.setAttribute('translate', 'no'); item.body.parentElement.append(node); }
      if (node.textContent !== text) node.textContent = text;
    };
    const decorate = () => {
      const items = rows();
      preserveScroll(() => { for (const item of items) { const cached = state.cache.get(item.contactId + '\n' + item.text); if (cached) inject(item, cached); } });
      return items;
    };
    const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const directUrl = (text: string) => { if (/\s/.test(text) || !/^(https?:\/\/|www\.)/i.test(text)) return false; try { const url = new URL(/^www\./i.test(text) ? 'https://' + text : text); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname; } catch { return false; } };
    const sensitive = (text: string) => text.length <= 256 && !/[\r\n]/.test(text) && (/^[0-9 ]{1,34}$/.test(text) || /^0x[0-9A-Za-z]{20,80}$/.test(text) || /^T[0-9A-Za-z]{33}$/.test(text) || /^[0-9A-Za-z]{32,44}$/.test(text));
    const approval = (requestId: string, text: string) => ({ requestId, text, input: editor(), signature: contact().id, context: context() });
    const matches = (pending: any) => !!pending && pending.input === editor() && pending.signature === contact().id && pending.context === context() && pending.text === read();
    const submit = (event: Event) => {
      sync();
      if (state.sending) return;
      const text = read();
      if (!available() || state.inFlight || !text) { stop(event); hint(state.inFlight ? '手机工作台正在处理发送，请核对结果，勿重复发送' : '请先确认手机控制连接和当前联系人'); return; }
      if (state.pending) { stop(event); hint('正在处理，请稍候'); return; }
      if (matches(state.sensitive)) { stop(event); const token = state.sensitive.requestId; state.sensitive = null; state.pending = approval(token, text); emit('sensitive-send', text, token); return; }
      if (sensitive(text)) { stop(event); state.pending = approval('sensitive', text); emit('sensitive-prepare', text); return; }
      if (/[\u3400-\u9fff]/.test(text) && !directUrl(text)) {
        stop(event); const id = 'apple-translate-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
        state.pending = approval(id, text); editor()!.dataset.dfTranslatorRequestId = id; emit('translate', text, id); hint('正在翻译…'); return;
      }
      if (state.ready) {
        stop(event);
        if (!matches(state.ready)) { reset(); hint('输入内容或联系人已变化，请重新核对'); return; }
        state.pending = state.ready; state.ready = null; emit('send', text, state.pending.requestId);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.target !== editor()) return;
      if (state.composing || event.isComposing || event.keyCode === 229) { stop(event); return; }
      if (event.repeat || event.ctrlKey || event.metaKey) { stop(event); return; }
      if (event.shiftKey) return;
      submit(event);
    };
    const onClick = (event: Event) => { const send = button(); if (send && event.target instanceof Element && event.target.closest('#reply-box #send-reply') === send) submit(event); };
    const onInput = (event: Event) => { if (event.target !== editor() || state.writing) return; sync(); reset(); emit('typing', read()); hint(/[\u3400-\u9fff]/.test(read()) ? '按 Enter 先翻译，再次按 Enter 发送英文' : ''); };
    const onCompositionStart = (event: Event) => { if (event.target === editor()) state.composing = true; };
    const onCompositionEnd = (event: Event) => { if (event.target === editor()) state.composing = false; };
    state.apply = (cmd: any): any => {
      sync();
      if (cmd.action === 'bootstrap') return true;
      if (cmd.action === 'enabled') { state.enabled = cmd.enabled === true; if (!state.enabled) reset(); return true; }
      if (cmd.action === 'contact') return contact();
      if (cmd.action === 'install') { decorate(); return true; }
      if (cmd.action === 'text') return read();
      if (cmd.action === 'focus' || cmd.action === 'focusNative') { editor()?.focus(); return !!contact().id && document.activeElement === editor(); }
      if (cmd.action === 'matches') return matches(state.pending) && state.pending.requestId === cmd.requestId;
      if (cmd.action === 'unread') return { count: 0, ready: !!document.getElementById('messages') };
      if (cmd.action === 'probe') return { guard: version, hasComposer: !!editor(), protectionReady: true, translatedReady: !!state.ready, pending: !!state.pending, textLength: read().length, hasChinese: /[\u3400-\u9fff]/.test(read()), queueLength: w.__dfTranslatorQueue?.length || 0 };
      if (cmd.action === 'scan') return decorate().filter(item => /[A-Za-z]{2,}/.test(item.text) && !/[\u3400-\u9fff]/.test(item.text) && item.text.length <= 4000 && (cmd.options?.includeAlreadyTranslated || !item.row.querySelector('.df-chat-translation')) && item.rectBottom >= -innerHeight * (cmd.options?.viewportScreensAbove || 0) && item.rectTop <= innerHeight * (1 + (cmd.options?.viewportScreensBelow || 0))).slice(-(cmd.options?.limit || 100)).map(({ row, body, ...item }) => item);
      if (cmd.action === 'cache') {
        const id = contact().id;
        for (const entry of cmd.entries || []) if (entry.sourceText && entry.translatedText && (!entry.contactId || entry.contactId === id)) state.cache.set(id + '\n' + canonical(entry.sourceText), String(entry.translatedText));
        while (state.cache.size > 3000) state.cache.delete(state.cache.keys().next().value);
        decorate(); return true;
      }
      if (cmd.action === 'inject') {
        const item = rows().find(item => item.key === cmd.key && canonical(item.text) === canonical(cmd.sourceText));
        if (!item || !cmd.translation) return false;
        state.cache.set(item.contactId + '\n' + item.text, String(cmd.translation));
        preserveScroll(() => inject(item, String(cmd.translation), cmd.replaceExisting)); return true;
      }
      if (cmd.action === 'state') {
        const value = cmd.state || {};
        if ((value.conversationSignature && value.conversationSignature !== contact().id) || (value.expectedConversationSignature && value.expectedConversationSignature !== contact().id)) return false;
        if (Object.hasOwn(value, 'sensitiveToken')) { state.sensitive = value.sensitiveToken ? approval(value.sensitiveToken, canonical(value.sensitiveText)) : null; state.pending = null; }
        if (Object.hasOwn(value, 'translated')) {
          if (value.translated && state.pending?.requestId === value.requestId && state.pending.context === context() && state.pending.input === editor() && read() === canonical(value.translated)) {
            state.ready = approval(value.requestId, read()); state.pending = null; editor()!.dataset.dfTranslatorReadyRequestId = value.requestId; hint('翻译完成，再按 Enter 或点击发送即可发送英文');
          } else if (!value.translated && !state.pending) reset();
        }
        if (value.status) { hint(value.status); if (/失败|超时|取消|重试/.test(value.status)) reset(); }
        return true;
      }
      if (cmd.action === 'composer') {
        const p = cmd.payload, input = editor();
        if (p.action === 'clearProxy') return { ok: true };
        if (p.action === 'pulse') { input?.focus(); return { ok: !!input }; }
        if (!input || !contact().id) return { ok: false, reason: 'apple-conversation-unavailable' };
        if (p.action === 'write') {
          if (!state.enabled || !matches(state.pending) || state.pending.requestId !== p.requestId || input.disabled) return { ok: false, reason: 'apple-draft-changed' };
          input.focus();
          if (!matches(state.pending)) return { ok: false, reason: 'apple-focus-changed' };
          state.writing = true;
          try { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, p.text); input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: p.text })); }
          finally { state.writing = false; }
          return { ok: state.pending?.context === context() && read() === canonical(p.text) };
        }
        if (p.action === 'send' || p.action === 'sendExact') {
          if (!available() || state.inFlight || !matches(state.pending) || p.sendTarget?.platform !== 'apple' || p.sendTarget?.conversationSignature !== contact().id || canonical(p.text) !== read() || /[\u3400-\u9fff]/.test(read())) return { ok: false, reason: 'apple-conversation-or-text-changed' };
          const id = contact().id;
          hint('正在等待手机工作台核验发送结果…');
          state.inFlight = true; state.sending = true;
          try { button()!.click(); } finally { state.sending = false; reset(); }
          return (async () => {
            for (let attempt = 0; attempt < 25; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 160));
              if (contact().id !== id) return { ok: false, reason: 'apple-send-submitted', submitted: true };
              if (input.isConnected && !read(input)) { state.inFlight = false; hint(''); return { ok: true, method: 'apple-native-button' }; }
              if (typeof workspaceBusy === 'boolean' && !workspaceBusy) break;
            }
            hint('手机工作台已接收操作，请核对发送结果；重新读取会话前请勿重复发送');
            return { ok: false, reason: 'apple-send-submitted', submitted: true };
          })();
        }
      }
      return false;
    };
    const style = document.createElement('style'); style.id = 'df-apple-translation-style';
    style.textContent = '#messages .df-chat-translation{box-sizing:border-box;max-width:100%;margin-top:7px;padding-top:6px;border-top:1px solid #94a3b866;font-size:14px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;color:#176040}#df-apple-composer-status{padding:6px 10px;font-size:12px;line-height:1.4;color:#176040}';
    document.head?.append(style);
    window.addEventListener('keydown', onKey, true); window.addEventListener('click', onClick, true); document.addEventListener('input', onInput, true);
    document.addEventListener('compositionstart', onCompositionStart, true); document.addEventListener('compositionend', onCompositionEnd, true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(records => {
      if (!records.some(record => !(record.target instanceof Element ? record.target : record.target.parentElement)?.closest('.df-chat-translation') && (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node => !(node instanceof Element && node.matches('.df-chat-translation')))))) return;
      if (timer) return;
      timer = setTimeout(() => { timer = undefined; sync(); decorate(); }, 180);
    });
    const box = document.getElementById('messages'); if (box) observer.observe(box, { childList: true, subtree: true, characterData: true });
    const interval = setInterval(sync, 1500);
    state.dispose = () => {
      observer.disconnect(); clearInterval(interval); if (timer) clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true); window.removeEventListener('click', onClick, true); document.removeEventListener('input', onInput, true);
      document.removeEventListener('compositionstart', onCompositionStart, true); document.removeEventListener('compositionend', onCompositionEnd, true);
      style.remove(); document.getElementById('df-apple-composer-status')?.remove(); delete document.documentElement.dataset.dfAppleGuard;
    };
    w.__dfApple = state; sync(); document.documentElement.dataset.dfAppleGuard = version;
  }
  if (command.action === 'dispose') { w.__dfApple.dispose(); delete w.__dfApple; return true; }
  return w.__dfApple.apply(command);
}

export function buildAppleScript(command: Record<string, unknown>) {
  return `(${appleRuntime.toString()})(${JSON.stringify(command)})`;
}

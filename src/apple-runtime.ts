// These bindings belong to the local phone workspace's main-world script.
import { openSmsAreaCodeInfo } from './phone-area-codes';
declare const workspaceDevice: string | null;
declare const workspaceRevision: number;
declare const currentConversationId: string | null;
declare const currentConversation: any;
declare const workspaceBusy: boolean;
declare const sendBlocked: boolean;
declare const controlOwner: string | null;

// Self-contained because it is also serialized into the Apple translation layer.
export function appleTranslationCacheMatchesPhone(entry: { platform?: string; contactId?: string; contactIdType?: string }, phone: string) {
  const normalize = (value: string) => {
    if (!/^\+?[\d\s().-]+$/.test(value.trim())) return '';
    let digits = value.replace(/\D/g, '');
    const international = value.trim().startsWith('+') || digits.startsWith('00');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (!international && digits.length === 10) digits = '1' + digits;
    return /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : '';
  };
  if (entry.platform && entry.platform !== 'apple') return false;
  const expected = normalize(phone); if (!expected) return false;
  let identity = entry.contactId || '';
  // Read compatible historical entries without rewriting or deleting caches.
  if (identity.startsWith('apple:')) {
    const parts = identity.split(':'); if (parts.length !== 4) return false;
    try { identity = decodeURIComponent(parts[3]); } catch { return false; }
  }
  return normalize(identity) === expected;
}

export function appleRuntime(command: any, cacheMatchesPhone: typeof appleTranslationCacheMatchesPhone, areaCodeInfo: Record<string, [string, string, string]>) {
  if (location.origin !== 'http://127.0.0.1:8070' || window.top !== window) return false;
  const w = window as any;
  const version = '2026-11-18-apple-composer-handoff-v13';
  // Keep the established input-readiness contract; performance updates have
  // their own version and do not change the preload's input protection policy.
  const startupGuardMarker = '2026-11-09-apple-gpt-history-time-v4';
  if (w.__dfApple?.version !== version) {
    w.__dfApple?.dispose();
    const state: any = { version, enabled: false, signature: '', context: '', input: null, pending: null, ready: null, sensitive: null, writing: false, sending: false, inFlight: false, composing: false, cache: new Map() };
    let decorationDirty = true;
    const isForeground = () => state.foreground !== false && !document.hidden;
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
        let digits = phone.replace(/\D/g, '');
        const international = phone.startsWith('+') || digits.startsWith('00');
        if (digits.startsWith('00')) digits = digits.slice(2);
        if (!international && digits.length === 10) digits = '1' + digits;
        const normalizedPhone = /^\+?[\d\s().-]+$/.test(phone) && /^[1-9]\d{7,14}$/.test(digits) ? '+' + digits : '';
        return { id: ['apple', workspaceDevice, currentConversationId, phone].map(encodeURIComponent).join(':'), title: phone || canonical(currentConversation.contact), phone: normalizedPhone };
      } catch { return { id: '', title: '' }; }
    };
    const context = () => contact().id + ':' + (typeof workspaceRevision === 'number' ? workspaceRevision : '') + ':' + (typeof controlOwner === 'string' ? controlOwner : '');
    const exportConversation = (cmd: any) => {
      const target = contact(), box = document.getElementById('messages');
      const fail = (code: string, message: string): never => { throw Object.assign(new Error(message), { exportCode: code }); };
      if (!target.id || !box) fail('conversation-not-open', '请先打开苹果手机工作台中的联系人会话');
      if (cmd.expectedId && cmd.expectedId !== target.id) fail('contact-changed', '设备或联系人已切换，导出已停止');
      if (cmd.action === 'contact') return { contactId: target.id, contactTitle: target.title };
      if (cmd.action === 'begin') state.exportContext = { id: target.id, stamp: context(), box };
      else if (!state.exportContext || state.exportContext.id !== target.id || state.exportContext.stamp !== context() || state.exportContext.box !== box) {
        fail('contact-changed', '设备或会话记录已变化，导出已停止，请重新操作');
      }
      if (cmd.action === 'restore') { state.exportContext = null; return true; }
      if (cmd.action === 'older') return false;
      // The workbench already holds its saved message window in memory. Reading
      // it does not scroll, send, or start another phone capture.
      const saved = Array.isArray(currentConversation.messages) ? currentConversation.messages : [];
      const rendered = new Map(Array.from(box!.querySelectorAll<HTMLElement>(':scope > .message'), node => [node.dataset.messageId, node]));
      const rows = saved.map((message: any, index: number) => {
        const originalText = String(message.text || '').replace(/\r\n?/g, '\n').trim();
        const timestamp = canonical(message.time);
        const direction = message.side === 'incoming' || message.side === 'outgoing' ? message.side : 'unknown';
        const row = rendered.get(String(index));
        const displayed = canonical(row?.querySelector('.bubble > .original')?.textContent);
        const chineseText = originalText && displayed === canonical(originalText)
          ? canonical(row?.querySelector('.df-chat-translation-text')?.textContent ?? row?.querySelector('.df-chat-translation')?.textContent) : '';
        return { id: 'apple-message:' + index, direction, timestamp, originalText, chineseText,
          mediaLabel: originalText ? '' : message.kind === 'attachment' ? '[附件消息]' : message.decode_error ? '[正文解析未完成]' : '[无文字内容]' };
      });
      return { contactId: target.id, contactTitle: target.title, rows, top: true, loading: false, earliestMarked: false, expandPending: false };
    };
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
    const readingFontKey = 'df-apple-reading-font-size';
    const clampReadingFont = (value: number) => Number.isFinite(value) ? Math.min(22, Math.max(12, Math.round(value))) : 15;
    let readingFont = 15;
    try { const saved = localStorage.getItem(readingFontKey); if (saved !== null) readingFont = clampReadingFont(Number(saved)); } catch { /* Keep the default when storage is unavailable. */ }
    const readingControl = document.createElement('label');
    readingControl.id = 'df-apple-reading-font-control';
    const readingLabel = document.createElement('span'); readingLabel.textContent = '阅读字号';
    const readingSlider = document.createElement('input'); readingSlider.type = 'range'; readingSlider.min = '12'; readingSlider.max = '22'; readingSlider.step = '1'; readingSlider.value = String(readingFont); readingSlider.setAttribute('aria-label', '阅读区文字大小');
    const readingValue = document.createElement('output');
    const applyReadingFont = () => {
      document.documentElement.style.setProperty('--df-apple-reading-font', readingFont + 'px');
      readingValue.value = readingFont + 'px'; readingSlider.setAttribute('aria-valuetext', readingFont + '像素');
    };
    readingSlider.oninput = () => {
      readingFont = clampReadingFont(Number(readingSlider.value));
      preserveScroll(applyReadingFont, rows());
      try { localStorage.setItem(readingFontKey, String(readingFont)); } catch { /* The current page still uses the selected size. */ }
    };
    readingControl.append(readingLabel, readingSlider, readingValue); applyReadingFont();
    const areaHint = document.createElement('div'); areaHint.id = 'df-apple-area-hint'; areaHint.setAttribute('role', 'note');
    areaHint.title = '按号码区号推测的代表区域；号码携转后实际所在地可能不同';
    const timezoneFormatters = new Map<string, Intl.DateTimeFormat>();
    const timezoneOffsetMinutes = (zone: string, at: Date) => {
      let formatter = timezoneFormatters.get(zone);
      if (!formatter) { formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); timezoneFormatters.set(zone, formatter); }
      const values: Record<string, number> = {};
      for (const part of formatter.formatToParts(at)) if (part.type !== 'literal') values[part.type] = Number(part.value);
      return Math.round((Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second) - at.getTime()) / 60000);
    };
    const updateAreaHint = () => {
      const target = contact(); const digits = (target.phone || '').replace(/\D/g, '');
      const areaCode = digits.length === 11 && digits[0] === '1' ? digits.slice(1, 4) : digits.length === 10 ? digits.slice(0, 3) : '';
      const info = areaCodeInfo[areaCode];
      const phoneNode = document.getElementById('peer-phone');
      if (!info || !target.phone || !phoneNode || !canonical(phoneNode.textContent).includes(canonical(currentConversation?.phone_number))) { areaHint.remove(); return; }
      const [city, stateName, zone] = info;
      const now = new Date(); const delta = Math.round((timezoneOffsetMinutes(zone, now) - timezoneOffsetMinutes('America/Los_Angeles', now)) / 60);
      areaHint.textContent = `(${areaCode})-${stateName}-${city}-时差${delta >= 0 ? '+' : ''}${delta}`;
      areaHint.setAttribute('aria-label', areaHint.textContent);
      areaHint.style.color = stateName === '加利福尼亚州' ? '#dc2626' : '#111111';
      const liveScreen = document.getElementById('selected');
      if (!liveScreen) { areaHint.remove(); return; }
      if (areaHint.parentElement !== document.body) document.body.append(areaHint);
      const rect = liveScreen.getBoundingClientRect();
      areaHint.style.left = (rect.left + rect.width / 2) + 'px';
      areaHint.style.top = (rect.top + 10) + 'px';
    };
    const sync = () => {
      observeMessages();
      const messages = document.getElementById('messages');
      updateAreaHint();
      const translateControls = messages?.parentElement?.querySelector('.foreground-reading');
      if (translateControls && readingControl.parentElement !== translateControls) translateControls.append(readingControl);
      else if (!translateControls && messages?.parentElement && readingControl.nextElementSibling !== messages) messages.before(readingControl);
      const stamp = context(), input = editor(), id = contact().id;
      if (stamp !== state.context || input !== state.input) {
        decorationDirty = true;
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
    const rowSources = new WeakMap<HTMLElement, { body: HTMLElement; text: string; key: string; id: string; messageId: string; timestamp: string }>();
    const rows = () => {
      processMutations(observer.takeRecords());
      const target = contact(), id = target.id, box = document.getElementById('messages');
      if (!id || !target.phone || !box) return [];
      // Parse changed sources before reading geometry. No persistent geometry
      // cache: scroll, resize and wrapping must immediately affect candidates.
      const parsed = Array.from(box.querySelectorAll<HTMLElement>(':scope > .message')).flatMap((row, index) => {
        const body = row.querySelector<HTMLElement>('.bubble > .original');
        if (!body) return [];
        const savedIndex = Number(row.dataset.messageId ?? index);
        const saved = Array.isArray(currentConversation?.messages) ? currentConversation.messages[savedIndex] : undefined;
        const timestamp = canonical(saved?.time || row.querySelector('.message-meta')?.textContent?.replace(/^[^·]*·\s*/, '')).slice(0, 256);
        const messageId = row.dataset.messageId ?? String(index);
        let cached = rowSources.get(row);
        if (!cached || cached.body !== body || cached.id !== id || cached.messageId !== messageId || cached.timestamp !== timestamp) {
          const text = canonical(body.textContent);
          cached = { body, text, key: `${id}:${messageId}:${hash(text)}:${hash(timestamp)}`, id, messageId, timestamp };
          rowSources.set(row, cached);
        }
        const { text, key } = cached;
        if (!text || /^\[(?:附件消息|正文解析未完成|无文字内容)\]$/.test(text)) return [];
        const direction = row.classList.contains('outgoing') ? 'outgoing' : row.classList.contains('incoming') ? 'incoming' : 'unknown';
        if (row.dataset.dfMsgKey && row.dataset.dfMsgKey !== key) row.querySelectorAll('.df-chat-translation').forEach(node => node.remove());
        if (row.dataset.dfMsgKey !== key) row.dataset.dfMsgKey = key;
        return [{ row, body, key, text, timestamp, direction, contactId: target.phone, contactIdType: 'phone', contactKey: 'apple-phone:' + target.phone, contactTitle: target.title, conversationSignature: id }];
      });
      const bounds = box.getBoundingClientRect();
      const nearConversationEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      return parsed.map(item => {
        const rect = item.row.getBoundingClientRect();
        return { ...item, scanBand: rect.bottom < bounds.top ? 'above' : rect.top > bounds.bottom ? 'below' : 'visible', nearConversationEnd,
          rectTop: rect.top, rectBottom: rect.bottom, rectHeight: rect.height, viewportHeight: innerHeight,
          inViewport: rect.bottom >= bounds.top && rect.top <= bounds.bottom, rectLeft: rect.left, rectRight: rect.right };
      });
    };
    const preserveScroll = (change: () => void, items: ReturnType<typeof rows>) => {
      const box = document.getElementById('messages');
      if (!box) return;
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
      const boxTop = box.getBoundingClientRect().top;
      const anchor = items.find(item => item.rectBottom >= boxTop)?.row;
      const top = anchor?.getBoundingClientRect().top ?? 0;
      change();
      if (atBottom) box.scrollTop = box.scrollHeight;
      else if (anchor?.isConnected) box.scrollTop += anchor.getBoundingClientRect().top - top;
    };
    const ensureRefresh = (item: ReturnType<typeof rows>[number], node: HTMLElement) => {
      let textNode = node.querySelector<HTMLElement>('.df-chat-translation-text');
      if (!textNode) {
        textNode = document.createElement('span'); textNode.className = 'df-chat-translation-text';
        textNode.textContent = node.textContent; node.replaceChildren(textNode);
      }
      const host = item.row.querySelector<HTMLElement>('.df-smart-reply-host');
      const mount = (button: HTMLButtonElement) => {
        if (host) {
          if (button.parentElement !== host) host.prepend(button);
        } else if (button.parentElement !== node) node.append(button);
      };
      let refresh = item.row.querySelector<HTMLButtonElement>('.df-chat-refresh-translation');
      if (refresh?.dataset.dfRefreshKey === item.key) { mount(refresh); return; }
      refresh?.remove();
      refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'df-chat-refresh-translation'; refresh.dataset.dfRefreshKey = item.key;
      refresh.title = '重新翻译本条气泡'; refresh.setAttribute('aria-label', '重新翻译本条气泡'); refresh.textContent = '↻';
      refresh.style.cssText = 'align-items:center;appearance:none;background:transparent;border:0;border-radius:50%;box-shadow:none;color:inherit;cursor:pointer;display:inline-flex;vertical-align:middle;font-family:inherit;font-size:15px;font-weight:400;height:24px;justify-content:center;line-height:1;margin:0 0 0 3px;opacity:0.72;padding:0;pointer-events:auto;width:24px';
      const button = refresh;
      button.onmouseenter = () => { button.style.background = 'color-mix(in srgb, currentColor 12%, transparent)'; button.style.opacity = '1'; };
      button.onmouseleave = () => { button.style.background = 'transparent'; button.style.opacity = '0.72'; };
      if (w.__dfBubbleRefreshPendingKeys?.[item.key]) { button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = '...'; }
      button.onclick = event => {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        if (button.disabled || !item.row.isConnected || contact().id !== item.conversationSignature || !rows().some(row => row.key === item.key && row.text === item.text)) return;
        w.__dfBubbleRefreshPendingKeys ||= Object.create(null); w.__dfBubbleRefreshPendingKeys[item.key] = true;
        button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = '...';
        emit('bubble-refresh', JSON.stringify({ key: item.key, text: item.text, direction: item.direction, messagePart: 'body' }));
      };
      mount(button);
    };
    const inject = (item: any, text: string, replace = false) => {
      let node = item.body.parentElement.querySelector('.df-chat-translation');
      if (node && !replace) { ensureRefresh(item, node); return; }
      if (!node) { node = document.createElement('div'); node.className = 'df-chat-translation notranslate'; node.setAttribute('translate', 'no'); item.body.parentElement.append(node); }
      const textNode = node.querySelector('.df-chat-translation-text');
      if (textNode) { if (textNode.textContent !== text) textNode.textContent = text; }
      else if (node.textContent !== text) node.textContent = text;
      ensureRefresh(item, node);
    };
    const decorate = () => {
      const items = rows();
      if (!decorationDirty || !isForeground()) return items;
      decorationDirty = false;
      if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
      preserveScroll(() => {
        for (const item of items) {
          const cached = state.cache.get(item.contactId + '\n' + item.text); if (cached) inject(item, cached);
          const translation = item.row.querySelector<HTMLElement>('.df-chat-translation'); if (translation) ensureRefresh(item, translation);
        }
        const valid = (item: typeof items[number]) => (item.direction === 'incoming' || item.direction === 'outgoing') && item.text.length <= 4000 && /[A-Za-z]{2,}/.test(item.text) && !/[\u3400-\u9fff]/.test(item.text);
        const eligible = items.filter(item => item.direction === 'incoming' && valid(item)).slice(-3);
        const smartKey = (item: typeof items[number]) => `smart-${hash(item.key)}-${hash(item.text)}`;
        document.querySelectorAll<HTMLElement>('#messages .df-smart-reply-host').forEach(host => {
          if (!eligible.some(item => smartKey(item) === host.dataset.dfSmartReplyKey)) {
            const refresh = host.querySelector('.df-chat-refresh-translation');
            const translation = host.parentElement?.querySelector('.df-chat-translation');
            if (refresh && translation) translation.append(refresh);
            host.remove();
          }
        });
        for (const item of eligible) {
          const key = smartKey(item);
          if (item.row.querySelector('.df-smart-reply-host')) continue;
          const host = document.createElement('div'); host.className = 'df-smart-reply-host'; host.dataset.dfSmartReplyKey = key;
          const button = document.createElement('button'); button.type = 'button'; button.className = 'df-smart-reply-button'; button.textContent = '去GPT';
          button.title = '以此气泡为终点，不限日期向上复制最多 18 条有效英文气泡（含双方消息和时间）';
          button.style.cssText = 'display:block;margin:0;border:1px solid #80c79a;border-radius:5px;font-size:12px;line-height:1.4;padding:2px 6px;background:#effbf3;color:#197745;cursor:pointer';
          button.onclick = event => {
            event.preventDefault(); event.stopPropagation();
            if (button.disabled || contact().id !== item.conversationSignature || !item.row.isConnected) return;
            const current = rows(); const index = current.findIndex(row => row.key === item.key);
            if (index < 0 || !current.filter(row => row.direction === 'incoming' && valid(row)).slice(-3).some(row => row.key === item.key)) return;
            const messages = current.slice(0, index + 1).filter(valid).slice(-18).map(row => ({ speaker: row.direction === 'outgoing' ? 'self' : 'other', text: row.text, timestamp: row.timestamp }));
            while (messages.length > 1 && new TextEncoder().encode(JSON.stringify(messages)).length > 80_000) messages.shift();
            if (!messages.length || new TextEncoder().encode(JSON.stringify(messages)).length > 80_000) return;
            emit('smart-reply-request', JSON.stringify({ latestMessageKey: key, messages }), `apple-gpt-${Date.now().toString(36)}`);
            button.disabled = true; button.textContent = '复制中…';
          };
          host.append(button); item.body.parentElement!.append(host);
          const translation = item.row.querySelector<HTMLElement>('.df-chat-translation'); if (translation) ensureRefresh(item, translation);
        }
      }, items);
      return items;
    };
    let paintTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingPaints: { command: any; stamp: string; resolve: (ok: boolean) => void }[] = [];
    const queueTranslation = (cmd: any) => new Promise<boolean>(resolve => {
      pendingPaints.push({ command: cmd, stamp: context(), resolve });
      if (paintTimer !== undefined) return;
      paintTimer = setTimeout(() => {
        paintTimer = undefined;
        const batch = pendingPaints; pendingPaints = [];
        try {
          const items = rows(), byKey = new Map(items.map(item => [item.key, item]));
          const stamp = context();
          const valid = batch.map(request => ({ request, item: byKey.get(request.command.key) })).filter(({ request, item }) => {
            const ok = !!item && request.stamp === stamp && !!request.command.translation && canonical(item.text) === canonical(request.command.sourceText);
            if (!ok) request.resolve(false);
            return ok;
          });
          if (valid.length) preserveScroll(() => {
            for (const { request, item } of valid) {
              state.cache.set(item!.contactId + '\n' + item!.text, String(request.command.translation));
              inject(item, String(request.command.translation), request.command.replaceExisting);
              request.resolve(true);
            }
            while (state.cache.size > 3000) state.cache.delete(state.cache.keys().next().value);
          }, items);
        } catch { for (const request of batch) request.resolve(false); }
      }, isForeground() ? 24 : 100);
    });
    const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const directUrl = (text: string) => { if (/\s/.test(text) || !/^(https?:\/\/|www\.)/i.test(text)) return false; try { const url = new URL(/^www\./i.test(text) ? 'https://' + text : text); return ['http:', 'https:'].includes(url.protocol) && !!url.hostname; } catch { return false; } };
    const approval = (requestId: string, text: string) => ({ requestId, text, input: editor(), signature: contact().id, context: context() });
    const matches = (pending: any) => !!pending && pending.input === editor() && pending.signature === contact().id && pending.context === context() && pending.text === read();
    const submit = (event: Event) => {
      sync();
      const text = read();
      // Apple runtime owns Chinese translation only. Leave non-Chinese submits
      // untouched so the embedding 8070 workspace handles them, including
      // translated drafts and English pasted directly by the user.
      if (!state.enabled || !text || !/[\u3400-\u9fff]/.test(text) || directUrl(text)) return;
      if (state.inFlight) { stop(event); hint('翻译正在处理，请稍候'); return; }
      if (state.pending) { stop(event); hint('正在处理，请稍候'); return; }
      stop(event);
      const id = 'apple-translate-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      state.pending = approval(id, text); editor()!.dataset.dfTranslatorRequestId = id; emit('translate', text, id); hint('正在翻译…');
    };
    let spaceRun: { input: HTMLElement; signature: string; text: string; count: number } | null = null;
    let spaceComposing = false;
    const clearSpaceRun = () => { spaceRun = null; };
    const onSpaceComposition = (event: Event) => {
      if (event.target !== editor()) return;
      spaceComposing = event.type === 'compositionstart'; clearSpaceRun();
    };
    const onSpaceInput = (event: Event) => {
      if (event.target !== editor()) return;
      const inputEvent = event as InputEvent;
      if (inputEvent.inputType === 'insertText' && inputEvent.data === ' ') return;
      // Some editors re-emit input without InputEvent fields.
      if (!inputEvent.inputType && spaceRun && spaceRun.text === read().replace(/ /g, '')) return;
      clearSpaceRun();
    };
    const handleSpace = (event: KeyboardEvent) => {
      const input = editor();
      if (!input || !(event.target instanceof Node) || !(event.target === input || input.contains(event.target))) { clearSpaceRun(); return false; }
      if (event.key !== ' ' && event.code !== 'Space') { clearSpaceRun(); return false; }
      if (spaceComposing || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) { clearSpaceRun(); return true; }
      if (event.repeat) return true;
      const text = read(), signature = context();
      if (!state.enabled || !/[\u3400-\u9fff]/.test(text) || directUrl(text)) { clearSpaceRun(); return true; }
      const normalized = text.replace(/ /g, '');
      const count = spaceRun?.input === input && spaceRun.signature === signature && spaceRun.text === normalized ? spaceRun.count + 1 : 1;
      spaceRun = { input, signature, text: normalized, count };
      if (count >= 2) { stop(event); submit(event); }
      return true;
    };
    const onKey = (event: KeyboardEvent) => {
      if (handleSpace(event)) return;
      if (event.key !== 'Enter' || event.target !== editor()) return;
      const text = read();
      // Do not consume English Enter events here; 8070 owns sending and its
      // keyboard policy, whether the text came from translation or paste.
      if (!state.enabled || !/[\u3400-\u9fff]/.test(text) || directUrl(text)) return;
      if (state.composing || event.isComposing || event.keyCode === 229) { stop(event); return; }
      if (event.repeat || event.ctrlKey || event.metaKey) { stop(event); return; }
      if (event.shiftKey) return;
      submit(event);
    };
    const onClick = (event: Event) => { const send = button(); if (send && event.target instanceof Element && event.target.closest('#reply-box #send-reply') === send) submit(event); };
    const onInput = (event: Event) => { if (event.target !== editor() || state.writing) return; sync(); reset(); emit('typing', read()); hint(/[\u3400-\u9fff]/.test(read()) ? '按 Enter 或连续两次空格翻译，再按 Enter 发送英文' : ''); };
    const onCompositionStart = (event: Event) => { if (event.target === editor()) state.composing = true; };
    const onCompositionEnd = (event: Event) => { if (event.target === editor()) state.composing = false; };
    state.apply = (cmd: any): any => {
      sync();
      if (cmd.action === 'bootstrap') return true;
      if (cmd.action === 'enabled') { state.enabled = cmd.enabled === true; if (!state.enabled) reset(); return true; }
      if (cmd.action === 'contact') return contact();
      if (cmd.action === 'refresh-candidate') {
        if (cmd.conversationSignature !== contact().id) return null;
        const item = rows().find(row => row.key === cmd.key && row.text === cmd.sourceText);
        if (!item) return null;
        const { row, body, ...candidate } = item; return candidate;
      }
      if (cmd.action === 'export') return exportConversation(cmd.command);
      if (cmd.action === 'install' || cmd.action === 'smart') { processMutations(observer.takeRecords()); if (decorationDirty && isForeground()) decorate(); return true; }
      if (cmd.action === 'text') return read();
      if (cmd.action === 'focus' || cmd.action === 'focusNative') { editor()?.focus(); return !!contact().id && document.activeElement === editor(); }
      if (cmd.action === 'matches') return matches(state.pending) && state.pending.requestId === cmd.requestId;
      if (cmd.action === 'unread') return { count: 0, ready: !!document.getElementById('messages') };
      if (cmd.action === 'probe') return { guard: version, hasComposer: !!editor(), protectionReady: true, translatedReady: !!state.ready, pending: !!state.pending, textLength: read().length, hasChinese: /[\u3400-\u9fff]/.test(read()), queueLength: w.__dfTranslatorQueue?.length || 0 };
      if (cmd.action === 'scan') return decorate().filter(item => /[A-Za-z]{2,}/.test(item.text) && !/[\u3400-\u9fff]/.test(item.text) && item.text.length <= 4000 && (cmd.options?.includeAlreadyTranslated || !item.row.querySelector('.df-chat-translation')) && item.rectBottom >= -innerHeight * (cmd.options?.viewportScreensAbove || 0) && item.rectTop <= innerHeight * (1 + (cmd.options?.viewportScreensBelow || 0))).slice(-(cmd.options?.limit || 100)).map(({ row, body, ...item }) => item);
      if (cmd.action === 'cache') {
        const phone = contact().phone || '';
        for (const entry of cmd.entries || []) if (entry.sourceText && entry.translatedText && cacheMatchesPhone(entry, phone)) state.cache.set(phone + '\n' + canonical(entry.sourceText), String(entry.translatedText));
        while (state.cache.size > 3000) state.cache.delete(state.cache.keys().next().value);
        decorationDirty = true; decorate(); return true;
      }
      if (cmd.action === 'inject') {
        return queueTranslation(cmd);
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
    style.textContent = '#messages .df-chat-translation{box-sizing:border-box;max-width:100%;margin-top:7px;padding-top:6px;border-top:1px solid #94a3b866;font-size:14px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;color:#176040}#df-apple-composer-status{padding:6px 10px;font-size:12px;line-height:1.4;color:#ffffff}';
    style.textContent += `
      #messages .original{font-size:var(--df-apple-reading-font,15px)}
      #messages .df-chat-translation{font-size:calc(var(--df-apple-reading-font,15px) - 1px)}
      #messages .translated{font-size:calc(var(--df-apple-reading-font,15px) + 3px)}
      #messages .message-meta{font-size:calc(var(--df-apple-reading-font,15px) - 3px)}
      #messages .message-empty{font-size:var(--df-apple-reading-font,15px)}
      #messages .message.incoming{width:max-content;min-width:0}
      #messages .message.incoming>.bubble{box-sizing:border-box;width:max-content;max-width:100%;display:grid;grid-template-columns:minmax(0,1fr)}
      #messages .message.incoming>.bubble>.original{grid-column:1;min-width:24px}
      #messages .message.incoming>.bubble>.df-chat-translation,
      #messages .message.incoming>.bubble>.translated{contain:inline-size;min-width:0;grid-column:1;grid-row:2}
      #messages .bubble:has(> .df-smart-reply-host){display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:8px}
      #messages .message.incoming>.bubble:has(> .df-smart-reply-host){grid-template-columns:minmax(0,1fr) auto;column-gap:8px}
      #messages .bubble:has(> .df-smart-reply-host)>.original{grid-column:1;min-width:24px}
      #messages .bubble:has(> .df-smart-reply-host)>.df-chat-translation,
      #messages .bubble:has(> .df-smart-reply-host)>.translated{grid-column:1;grid-row:2;min-width:0}
      #messages .bubble>.df-smart-reply-host{grid-column:2;grid-row:2;align-self:end;display:inline-flex;align-items:center;gap:10px;white-space:nowrap}
      #messages .df-smart-reply-host>.df-chat-refresh-translation{margin:0!important}
      body>#df-apple-area-hint{position:fixed;z-index:2147483647;transform:translateX(-50%);box-sizing:border-box;padding:5px 9px;border:1px solid #d1d5db;border-radius:12px;background:#fff;color:#111;font:13px/1.35 sans-serif;white-space:nowrap;box-shadow:0 2px 8px #0008;pointer-events:none}
      #df-apple-reading-font-control{display:flex;align-items:center;gap:8px;margin-left:auto;font-size:12px;line-height:1.5;white-space:nowrap}
      #df-apple-reading-font-control input{width:110px;max-width:28vw;margin:0;accent-color:#80c79a}
      #df-apple-reading-font-control output{min-width:30px;font-variant-numeric:tabular-nums}
    `;
    document.head?.append(style);
    document.addEventListener('input', onSpaceInput, true);
    for (const name of ['focusout', 'pointerdown']) document.addEventListener(name, clearSpaceRun, true);
    for (const name of ['compositionstart', 'compositionend']) document.addEventListener(name, onSpaceComposition, true);
    window.addEventListener('keydown', onKey, true); window.addEventListener('click', onClick, true); document.addEventListener('input', onInput, true);
    document.addEventListener('compositionstart', onCompositionStart, true); document.addEventListener('compositionend', onCompositionEnd, true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleDecorate = () => {
      if (timer !== undefined || !isForeground()) return;
      timer = setTimeout(() => { timer = undefined; sync(); if (isForeground()) decorate(); }, 180);
    };
    const processMutations = (records: MutationRecord[]) => {
      const ownUi = '.df-chat-translation, .df-smart-reply-host';
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target?.closest(ownUi)) continue;
        if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => node instanceof Element && node.matches(ownUi))) continue;
        const row = target?.closest<HTMLElement>('.message');
        const cached = row && rowSources.get(row);
        if (row && cached && (target === cached.body || (target && cached.body.contains(target)))) rowSources.delete(row);
        if (record.type === 'childList') for (const node of [...record.addedNodes, ...record.removedNodes]) if (node instanceof HTMLElement) {
          rowSources.delete(node); node.querySelectorAll<HTMLElement>('.message').forEach(row => rowSources.delete(row));
        }
        decorationDirty = true; scheduleDecorate();
      }
    };
    const observer = new MutationObserver(processMutations);
    let observedBox: HTMLElement | null = null;
    const observeMessages = () => {
      const box = document.getElementById('messages');
      if (observedBox === box) return;
      processMutations(observer.takeRecords()); observer.disconnect(); observedBox = box; decorationDirty = true;
      if (box) observer.observe(box, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-message-id'] });
    };
    state.setForeground = (foreground: boolean) => { if (state.foreground === foreground) return; state.foreground = foreground; if (foreground) { decorationDirty = true; scheduleDecorate(); } };
    const onVisibility = () => { if (isForeground()) { decorationDirty = true; scheduleDecorate(); } };
    document.addEventListener('visibilitychange', onVisibility);
    const repositionAreaHint = () => updateAreaHint();
    window.addEventListener('resize', repositionAreaHint, { passive: true });
    const interval = setInterval(sync, 1500);
    state.dispose = () => {
      observer.disconnect(); clearInterval(interval); if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', repositionAreaHint);
      if (paintTimer !== undefined) clearTimeout(paintTimer);
      for (const request of pendingPaints) request.resolve(false); pendingPaints = [];
      document.removeEventListener('input', onSpaceInput, true); for (const name of ['focusout', 'pointerdown']) document.removeEventListener(name, clearSpaceRun, true); for (const name of ['compositionstart', 'compositionend']) document.removeEventListener(name, onSpaceComposition, true); window.removeEventListener('keydown', onKey, true); window.removeEventListener('click', onClick, true); document.removeEventListener('input', onInput, true);
      document.removeEventListener('compositionstart', onCompositionStart, true); document.removeEventListener('compositionend', onCompositionEnd, true);
      readingControl.remove(); areaHint.remove(); document.documentElement.style.removeProperty('--df-apple-reading-font');
      document.querySelectorAll('#messages .df-chat-refresh-translation').forEach(node => node.remove());
      style.remove(); document.querySelectorAll('#messages .df-smart-reply-host').forEach(node => node.remove()); document.getElementById('df-apple-composer-status')?.remove(); delete document.documentElement.dataset.dfAppleGuard;
    };
    state.editor = editor;
    w.__dfApple = state; sync(); document.documentElement.dataset.dfAppleGuard = startupGuardMarker;
  }
  if (command.action === 'dispose') { w.__dfApple.dispose(); delete w.__dfApple; return true; }
  return w.__dfApple.apply(command);
}

export function buildAppleScript(command: Record<string, unknown>) {
  return `(${appleRuntime.toString()})(${JSON.stringify(command)},${appleTranslationCacheMatchesPhone.toString()},${JSON.stringify(openSmsAreaCodeInfo)})`;
}

export function buildAppleRuntimeCheck() {
  return 'window.__dfApple?.version === "2026-11-18-apple-composer-handoff-v13"';
}

export function buildAppleCommandScript(command: Record<string, unknown>) {
  return `(()=>{if(!(${buildAppleRuntimeCheck()}))throw new Error("Apple translation runtime unavailable");return window.__dfApple.apply(${JSON.stringify(command)});})()`;
}

export async function executeAppleRuntimeScript<T>(script: string, execute: (script: string) => Promise<unknown>, guard: string, foreground: boolean, isCurrent: () => boolean): Promise<T> {
  const checkCurrent = () => { if (!isCurrent()) throw new Error('Web translation runtime replaced'); };
  const run = () => execute(`${guard}\nif(!(${buildAppleRuntimeCheck()})){({__dfAppleRuntimeRequired:true});}else{window.__dfApple.setForeground?.(${foreground});${script}\n}`);
  const needsRuntime = (value: unknown) => !!value && typeof value === 'object' && '__dfAppleRuntimeRequired' in value;
  checkCurrent();
  let result = await run();
  if (needsRuntime(result)) {
    checkCurrent();
    await execute(`${guard}\n${buildAppleScript({ action: 'bootstrap' })}`);
    checkCurrent(); result = await run();
    if (needsRuntime(result)) throw new Error('Apple translation runtime unavailable');
  }
  checkCurrent(); return result as T;
}

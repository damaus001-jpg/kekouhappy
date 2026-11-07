// Executed inside the selected WhatsApp webview. No messaging actions are called.
async function page(action, options = {}) {
  const key = '__codexWhatsappNumberFilter';
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const getBubble = id => [...document.querySelectorAll('#main [data-id]')].find(e => e.getAttribute('data-id') === id);
  const links = node => [...node.querySelectorAll('a')].filter(a => /^\+?[\d\s().-]+$/.test(a.textContent.trim()) && /^\d{10,15}$/.test(a.textContent.replace(/\D/g, '')));
  const numberOf = a => a.textContent.replace(/\D/g, '');
  const fibers = a => {
    const list = [];
    let f = a[Object.keys(a).find(k => k.startsWith('__reactFiber$'))];
    for (let i = 0; f && i < 12; i++, f = f.return) if (f.memoizedProps?.canonicalPhone) list.push(f);
    return list;
  };
  const summarize = audit => {
    const results = Object.values(audit.results);
    const counts = { registered: 0, 'not-registered': 0, unknown: 0 };
    for (const r of results) counts[r.status]++;
    const elapsedSeconds = audit.startedAt ? Math.max(0, (Date.now() - Date.parse(audit.startedAt)) / 1000) : 0;
    return { running: audit.running, totalEntries: audit.bubbles.reduce((n, b) => n + b.numbers.length, 0), uniqueNumbers: audit.unique.length, checked: results.length, counts, remaining: audit.unique.length - results.length, elapsedSeconds: Math.round(elapsedSeconds), estimatedRemainingSeconds: results.length ? Math.ceil((audit.unique.length - results.length) * elapsedSeconds / results.length) : null, stopReason: audit.stopReason || null, errors: audit.errors.length, uiCrossCheck: audit.uiCrossCheck || [] };
  };
  if (location.origin !== 'https://web.whatsapp.com') throw new Error('Expected WhatsApp webview');
  if (action === 'connection') {
    const loggedIn=!!document.querySelector('[data-testid="chat-list"], #pane-side');
    const text=document.body?.innerText||'';
    const syncing=/消息正在下载|正在下载.*消息|正在同步|downloading your messages|getting your messages|syncing your messages/i.test(text);
    return {loggedIn,phase:loggedIn?'ready':syncing?'syncing':document.querySelector('[data-ref],canvas')?'qr':'loading',ready:typeof window.require==='function',online:navigator.onLine};
  }
  if (action === 'import') {
    if (window[key]?.running) throw new Error('Stop the current run before importing');
    if (!Array.isArray(options.numbers) || !options.numbers.length || options.numbers.some(n => !/^[1-9]\d{7,14}$/.test(n))) throw new Error('Expected international phone numbers');
    const numbers = options.numbers;
    window[key] = { kind: 'imported-txt', createdAt: new Date().toISOString(), bubbles: [{ id:'imported-txt', numbers, fullyExpanded:true }], unique:[...new Set(numbers)], results:{}, canonical:new Map(numbers.map(n=>[n,'+'+n])), cached:new Map(), running:false, errors:[] };
    return summarize(window[key]);
  }
  if (action === 'inspect') return {
    conversationOpen: !!document.querySelector('#main'),
    bubbles: [...document.querySelectorAll('#main [data-id]')].map(e => ({ id: e.getAttribute('data-id'), rendered: !!e.textContent.trim(), visibleNumbers: links(e).length, readMore: !!e.querySelector('[data-testid="caption-read-more-button"]') }))
  };
  if (action === 'collect') {
    if (window[key]?.running) throw new Error('Stop the current run before changing bubbles');
    const ids = options.bubbles;
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new Error('Provide distinct, explicit bubble IDs');
    const audit = { createdAt: new Date().toISOString(), bubbles: [], unique: [], results: {}, canonical: new Map(), cached: new Map(), running: false, errors: [] };
    for (const id of ids) {
      let node = getBubble(id);
      if (!node) throw new Error('Selected bubble is not in this conversation: ' + id);
      node.scrollIntoView({ block: 'start' });
      for (let i = 0; i < 30 && !node.textContent.trim(); i++) { await pause(100); node = getBubble(id); if (!node) throw new Error('Conversation changed during collection'); }
      if (!node.textContent.trim()) throw new Error('Bubble placeholder did not render: ' + id);
      for (let i = 0; ; i++) {
        const more = node.querySelector('[data-testid="caption-read-more-button"]');
        if (!more) break;
        if (i >= 80) throw new Error('Read more expansion limit reached; inspect this bubble');
        const length = node.textContent.length;
        more.click();
        for (let j = 0; j < 30; j++) {
          await pause(100); node = getBubble(id);
          if (!node) throw new Error('Conversation changed during expansion');
          if (node.textContent.length !== length || !node.querySelector('[data-testid="caption-read-more-button"]')) break;
        }
        if (node.textContent.length === length && node.querySelector('[data-testid="caption-read-more-button"]')) throw new Error('Read more did not expand; do not count truncated text');
      }
      const anchors = links(node);
      if (!anchors.length) throw new Error('No phone-number links in selected bubble: ' + id);
      const textNode = node.querySelector('span[data-testid="selectable-text"]');
      const plainCount = (textNode?.textContent.match(/\b\d{10,15}\b/g) || []).length;
      if (plainCount > anchors.length) throw new Error('Some plain phone numbers are not links; inspect before querying');
      for (const anchor of anchors) {
        const number = numberOf(anchor);
        for (const f of fibers(anchor)) {
          const phone = f.memoizedProps.canonicalPhone;
          audit.canonical.set(number, phone);
          for (let h = f.memoizedState, i = 0; h && i < 16; h = h.next, i++) {
            const v = h.memoizedState;
            if (v && typeof v.isCached === 'function' && typeof v.getOrRun === 'function' && v.isCached(phone)) audit.cached.set(number, { cache: v, phone });
          }
        }
      }
      audit.bubbles.push({ id, numbers: anchors.map(numberOf), fullyExpanded: true });
    }
    audit.unique = [...new Set(audit.bubbles.flatMap(b => b.numbers))];
    if (audit.canonical.size !== audit.unique.length) throw new Error('Canonical phone mapping incomplete; inspect current WhatsApp components');
    window[key] = audit;
    return { ...summarize(audit), bubbles: audit.bubbles.map(b => ({ id: b.id, count: b.numbers.length, fullyExpanded: b.fullyExpanded })), cached: audit.cached.size };
  }
  const audit = window[key];
  if (!audit) throw new Error('No captured batch in this page; run collect first');
  if (action === 'status') return summarize(audit);
  if (action === 'stop') { audit.stopRequested = true; audit.stopReason = 'user requested stop'; return summarize(audit); }
  if (action === 'start') {
    if (audit.running) return summarize(audit);
    if (audit.startedAt) throw new Error('This batch has already started; export it or explicitly collect a new run');
    if (audit.kind !== 'imported-txt' && !audit.bubbles.every(b => getBubble(b.id))) throw new Error('Selected conversation is no longer open');
    if (audit.kind === 'imported-txt' && !document.querySelector('[data-testid="chat-list"], #pane-side')) throw new Error('Please log in to WhatsApp first');
    const req = window.require;
    req('WAWebPhoneNumberWrapperMutatorComponent.react');
    const component = req('__debug').modulesMap['WAWebPhoneNumberWrapperMutatorComponent.react']?.defaultExport;
    const source = String(component);
    if (!source.includes('usyncContactCached') || !source.includes('getOrRun') || !source.includes('mi-message-on-whatsapp') || !/!=null&&\w+\.wid/.test(source)) throw new Error('Current UI query/registration contract differs; inspect before adapting');
    const query = req('WAWebGetOrQueryUsyncInfoContactAction').usyncContactCached();
    if (typeof query.getOrRun !== 'function') throw new Error('UI phone-query method unavailable');
    const concurrency = options.concurrency ?? 6;
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6) throw new Error('Concurrency must be 1..6');
    audit.startedAt = new Date().toISOString(); audit.running = true; audit.stopRequested = false; audit.next = 0;
    audit.method = 'WhatsApp phone-link UI usyncContactCached().getOrRun(canonicalPhone), result.wid';
    const timed = promise => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('query timeout')), 20000);
      Promise.resolve(promise).then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
    });
    const worker = async () => {
      while (!audit.stopRequested) {
        const index = audit.next++;
        if (index >= audit.unique.length) break;
        const number = audit.unique[index]; const start = Date.now();
        try {
          const local = audit.cached.get(number);
          const value = await timed(local ? local.cache.getOrRun(local.phone) : query.getOrRun(audit.canonical.get(number)));
          audit.results[number] = { status: value?.wid ? 'registered' : 'not-registered', source: local ? 'existing-ui-cache' : 'same-ui-query', durationMs: Date.now() - start };
        } catch (error) {
          const message = String(error?.message || error).replace(/\d{7,}/g, '[number]').slice(0,300);
          audit.results[number] = { status: 'unknown', error: message, durationMs: Date.now() - start }; audit.errors.push(message);
          if (/timeout|429|rate.?limit|too many|temporarily blocked/i.test(message) || audit.errors.length >= 12) { audit.stopRequested = true; audit.stopReason = message; }
        }
      }
    };
    audit.job = Promise.all(Array.from({ length: concurrency }, worker)).finally(() => { audit.running = false; audit.finishedAt = new Date().toISOString(); });
    return summarize(audit);
  }
  if (action === 'verify') {
    if (audit.running) throw new Error('Wait for querying to finish');
    const testids = element => !element ? [] : Array.isArray(element) ? element.flatMap(testids) : typeof element !== 'object' ? [] : [...(element.props?.testid ? [element.props.testid] : []), ...testids(element.props?.children)];
    const checks = [];
    for (const status of ['registered', 'not-registered']) {
      const number = audit.unique.find(n => audit.results[n]?.status === status);
      if (!number) continue;
      const bubble = audit.bubbles.find(b => b.numbers.includes(number));
      const node = getBubble(bubble.id);
      if (!node) throw new Error('Return to the captured conversation for UI verification');
      node.scrollIntoView({ block: 'start' }); await pause(250);
      const anchor = links(getBubble(bubble.id)).find(a => numberOf(a) === number);
      if (!anchor) throw new Error('Sample is virtualized or collapsed; expand the original bubble and retry verify');
      anchor.scrollIntoView({ block: 'center' }); anchor.click();
      let agrees = false;
      for (let i = 0; i < 40 && !agrees; i++) {
        await pause(100);
        for (const f of fibers(anchor).flatMap(f => [f, f.alternate]).filter(Boolean)) {
          for (let h = f.memoizedState, j = 0; h && j < 16; h = h.next, j++) {
            const menu = h.memoizedState?.menu;
            if (!menu) continue;
            const ids = testids(menu);
            if (ids.includes('mi-copy-phone-number') && ids.includes('mi-message-on-whatsapp') === (status === 'registered')) agrees = true;
          }
        }
      }
      checks.push({ expected: status, agrees });
    }
    audit.uiCrossCheck = checks;
    if (checks.some(c => !c.agrees) || !checks.length) throw new Error('UI verification failed; do not present results as verified');
    return checks;
  }
  if (action === 'export') {
    if (audit.running) throw new Error('Wait for in-flight queries before exporting');
    if (audit.kind !== 'imported-txt' && (!audit.uiCrossCheck?.length || audit.uiCrossCheck.some(c => !c.agrees))) throw new Error('Run UI verification before exporting');
    const counts = { registered: 0, 'not-registered': 0, unknown: 0 };
    const entries = audit.bubbles.flatMap((b, bubbleIndex) => b.numbers.map((number, index) => ({ bubble: bubbleIndex + 1, bubbleId: b.id, index: index + 1, number, ...(audit.results[number] || { status: 'unknown', error: 'not queried' }) })));
    for (const e of entries) counts[e.status]++;
    return { createdAt: audit.createdAt, startedAt: audit.startedAt, finishedAt: audit.finishedAt, method: audit.method, totalEntries: entries.length, uniqueNumbers: audit.unique.length, counts, complete: counts.unknown === 0, registeredPercentage: counts.registered * 100 / entries.length, uiCrossCheck: audit.uiCrossCheck, bubbles: audit.bubbles.map((b, index) => ({ id: b.id, count: b.numbers.length, fullyExpanded: b.fullyExpanded, registered: entries.filter(e => e.bubble === index + 1 && e.status === 'registered').length, notRegistered: entries.filter(e => e.bubble === index + 1 && e.status === 'not-registered').length, unknown: entries.filter(e => e.bubble === index + 1 && e.status === 'unknown').length })), entries };
  }
  throw new Error('Unsupported action: ' + action);
}
module.exports = { page };

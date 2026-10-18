export function buildOpenSmsContactListResizeScript() {
  return `(() => {
    const existing = window.__dfOpenSmsContactResize;
    if (existing?.installed) {
      existing.refresh();
      return true;
    }

    const storageKey = 'df-opensms-contact-list-width-v1';
    const minimumWidth = 220;
    const minimumConversationWidth = 420;
    const state = {
      installed: true,
      column: null,
      conversation: null,
      layout: null,
      handle: null,
      storedWidth: Number(localStorage.getItem(storageKey)) || 0,
      dragStartX: 0,
      dragStartWidth: 0,
      dragging: false,
      refreshQueued: false,
      observedColumn: null,
      observedLayout: null,
      refresh: null
    };
    window.__dfOpenSmsContactResize = state;

    const findColumns = () => {
      const layout = document.querySelector('.main.content');
      const column = layout?.querySelector(':scope > .left');
      const conversation = layout?.querySelector(':scope > .right');
      if (!layout || !column || !conversation) return null;
      return { layout, column, conversation };
    };

    const range = column => {
      const rect = column.getBoundingClientRect();
      const layoutRect = column.parentElement?.getBoundingClientRect();
      const max = layoutRect ? Math.max(minimumWidth, Math.floor(layoutRect.right - rect.left - minimumConversationWidth)) : 900;
      return { min: minimumWidth, max, rect };
    };

    const applyWidth = (column, value, persist) => {
      const bounds = range(column);
      const width = Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
      column.style.setProperty('flex', '0 0 ' + width + 'px', 'important');
      column.style.setProperty('flex-basis', width + 'px', 'important');
      column.style.setProperty('max-width', 'none', 'important');
      column.style.setProperty('min-width', bounds.min + 'px', 'important');
      column.style.setProperty('width', width + 'px', 'important');
      state.storedWidth = width;
      if (persist) {
        try { localStorage.setItem(storageKey, String(width)); } catch {}
      }
      updateHandle();
      return width;
    };

    const constrainConversation = conversation => {
      if (!conversation) return;
      conversation.style.setProperty('min-width', '0', 'important');
      conversation.style.setProperty('max-width', '100%', 'important');
      conversation.style.setProperty('box-sizing', 'border-box', 'important');
      for (const node of conversation.querySelectorAll('.im-top, .im-chat-top, .chat-top-info, .info-other, .info-self, .im-chat, .im-chat-main, .im-chat-main-left, .im-chat-main-box, #message-box, .im-chat-footer')) {
        node.style.setProperty('min-width', '0', 'important');
        node.style.setProperty('max-width', '100%', 'important');
        node.style.setProperty('box-sizing', 'border-box', 'important');
      }
    };

    const updateHandle = () => {
      const column = state.column;
      const handle = state.handle;
      if (!column?.isConnected || !handle) {
        if (handle) handle.style.display = 'none';
        return;
      }
      const rect = column.getBoundingClientRect();
      handle.style.display = rect.width > 0 && rect.height > 0 ? 'block' : 'none';
      handle.style.left = Math.round(rect.right - 5) + 'px';
      handle.style.top = Math.round(rect.top) + 'px';
      handle.style.height = Math.round(rect.height) + 'px';
      handle.setAttribute('aria-valuenow', String(Math.round(rect.width)));
      const bounds = range(column);
      handle.setAttribute('aria-valuemin', String(bounds.min));
      handle.setAttribute('aria-valuemax', String(bounds.max));
    };

    const queueRefresh = () => {
      if (state.refreshQueued) return;
      state.refreshQueued = true;
      requestAnimationFrame(() => {
        state.refreshQueued = false;
        state.refresh();
      });
    };

    const ensureHandle = () => {
      if (state.handle?.isConnected) return state.handle;
      let style = document.getElementById('df-opensms-contact-resizer-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'df-opensms-contact-resizer-style';
        style.textContent = '#df-opensms-contact-resizer{position:fixed;z-index:2147483000;width:10px;cursor:col-resize;touch-action:none;user-select:none;display:none;background:transparent!important;border:0!important;box-shadow:none!important;outline:none!important}body.df-opensms-contact-resizing,body.df-opensms-contact-resizing *{cursor:col-resize!important;user-select:none!important}';
        (document.head || document.documentElement).appendChild(style);
      }
      const handle = document.createElement('div');
      handle.id = 'df-opensms-contact-resizer';
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.setAttribute('aria-label', '拖动调整联系人列表宽度');
      handle.tabIndex = 0;
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const column = state.column;
        if (!column) return;
        const rect = column.getBoundingClientRect();
        state.dragging = true;
        state.dragStartX = event.clientX;
        state.dragStartWidth = rect.width;
        handle.classList.add('df-dragging');
        document.body?.classList.add('df-opensms-contact-resizing');
        handle.setPointerCapture?.(event.pointerId);
      });
      document.addEventListener('pointermove', event => {
        if (!state.dragging || !state.column) return;
        event.preventDefault();
        applyWidth(state.column, state.dragStartWidth + event.clientX - state.dragStartX, false);
      }, true);
      const stopDragging = () => {
        if (!state.dragging) return;
        state.dragging = false;
        handle.classList.remove('df-dragging');
        document.body?.classList.remove('df-opensms-contact-resizing');
        if (state.column) applyWidth(state.column, state.storedWidth, true);
      };
      document.addEventListener('pointerup', stopDragging, true);
      document.addEventListener('pointercancel', stopDragging, true);
      handle.addEventListener('keydown', event => {
        if (!state.column) return;
        let next = state.storedWidth || state.column.getBoundingClientRect().width;
        if (event.key === 'ArrowLeft') next -= 16;
        else if (event.key === 'ArrowRight') next += 16;
        else if (event.key === 'Home') next = minimumWidth;
        else if (event.key === 'End') next = range(state.column).max;
        else return;
        event.preventDefault();
        applyWidth(state.column, next, true);
      });
      document.body.appendChild(handle);
      state.handle = handle;
      return handle;
    };

    state.refresh = () => {
      const found = findColumns();
      if (!found) {
        if (state.handle) state.handle.style.display = 'none';
        return false;
      }
      state.column = found.column;
      state.conversation = found.conversation;
      state.layout = found.layout;
      constrainConversation(state.conversation);
      if (state.resizeObserver && (state.observedColumn !== found.column || state.observedLayout !== found.layout)) {
        state.resizeObserver.disconnect();
        state.resizeObserver.observe(found.column);
        state.resizeObserver.observe(found.layout);
        state.observedColumn = found.column;
        state.observedLayout = found.layout;
      }
      ensureHandle();
      if (state.storedWidth > 0) applyWidth(state.column, state.storedWidth, false);
      updateHandle();
      return true;
    };

    state.refresh();
    const observer = new MutationObserver(queueRefresh);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    state.observer = observer;
    window.addEventListener('resize', queueRefresh, { passive: true });
    window.addEventListener('scroll', queueRefresh, { passive: true, capture: true });
    if (window.ResizeObserver) {
      state.resizeObserver = new ResizeObserver(queueRefresh);
      const found = findColumns();
      if (found) {
        state.resizeObserver.observe(found.column);
        state.resizeObserver.observe(found.layout);
        state.observedColumn = found.column;
        state.observedLayout = found.layout;
      }
    }
    return true;
  })()`;
}

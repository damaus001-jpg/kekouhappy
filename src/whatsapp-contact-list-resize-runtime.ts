export function buildWhatsAppContactListResizeScript() {
  return `(() => {
    const visualOverrideId = 'df-whatsapp-contact-resizer-visual-override';
    let visualOverride = document.getElementById(visualOverrideId);
    if (!visualOverride) {
      visualOverride = document.createElement('style');
      visualOverride.id = visualOverrideId;
      (document.head || document.documentElement).appendChild(visualOverride);
    }
    visualOverride.textContent = '#df-whatsapp-contact-resizer:before,#df-whatsapp-contact-resizer::before{display:none!important;opacity:0!important;background:transparent!important}#df-whatsapp-contact-resizer:focus-visible{outline:none!important}.df-whatsapp-divider-cleanup{border-left:0!important;border-right:0!important;box-shadow:none!important;outline:none!important}.df-whatsapp-divider-cleanup::before,.df-whatsapp-divider-cleanup::after{border-left:0!important;border-right:0!important;box-shadow:none!important;outline:none!important;background-color:transparent!important}';

    const existing = window.__dfWhatsAppContactResize;
    if (existing?.installed) {
      existing.refresh();
      return true;
    }

    const storageKey = 'df-whatsapp-contact-list-width-v1';
    const minimumWidth = 260;
    const minimumConversationWidth = 320;
    const state = {
      installed: true,
      column: null,
      handle: null,
      storedWidth: Number(localStorage.getItem(storageKey)) || 0,
      dragStartX: 0,
      dragStartWidth: 0,
      dragging: false,
      refreshQueued: false,
      observedColumn: null,
      observedLayout: null,
      defaultColumnWidth: 0,
      defaultSeamNodes: null,
      refresh: null
    };
    window.__dfWhatsAppContactResize = state;

    const findColumn = () => {
      const pane = document.querySelector('#pane-side');
      const side = pane?.parentElement;
      const column = side?.parentElement;
      const layout = column?.parentElement;
      if (!pane || !side || !column || !layout) return null;
      return { pane, side, column, layout };
    };

    const range = column => {
      const rect = column.getBoundingClientRect();
      const layout = column.parentElement?.getBoundingClientRect();
      const max = layout ? Math.max(minimumWidth, Math.floor(layout.right - rect.left - minimumConversationWidth)) : 900;
      return { min: minimumWidth, max, rect };
    };

    const syncDefaultWidthSeam = column => {
      const defaultWidth = state.defaultColumnWidth;
      const layout = column.parentElement;
      if (!defaultWidth || !layout) return;
      const columnRect = column.getBoundingClientRect();
      const defaultEdge = columnRect.left + defaultWidth;
      if (defaultEdge <= columnRect.right + 3) return;
      const delta = columnRect.width - defaultWidth;
      const tolerance = 2;
      if (!state.defaultSeamNodes) {
        const layoutRect = layout.getBoundingClientRect();
        const matches = [];
        for (const node of layout.querySelectorAll('*')) {
          if (!(node instanceof HTMLElement) || node.id === 'df-whatsapp-contact-resizer') continue;
          const rect = node.getBoundingClientRect();
          if (rect.height < Math.max(80, layoutRect.height * 0.55)) continue;
          const center = (rect.left + rect.right) / 2;
          if (rect.width <= 3 && Math.abs(center - defaultEdge) <= tolerance) {
            matches.push({ node, type: 'line', originalTransform: node.style.transform || '' });
            continue;
          }
          if (Math.abs(rect.left - columnRect.left) > tolerance || Math.abs(rect.right - defaultEdge) > tolerance) continue;
          const style = getComputedStyle(node);
          if ((parseFloat(style.borderRightWidth) > 0 && style.borderRightStyle !== 'none') || style.boxShadow !== 'none') {
            matches.push({ node, type: 'container' });
          }
        }
        state.defaultSeamNodes = matches;
      }
      for (const seam of state.defaultSeamNodes) {
        if (!seam.node.isConnected) continue;
        if (seam.type === 'line') {
          const transform = 'translateX(' + delta + 'px)' + (seam.originalTransform ? ' ' + seam.originalTransform : '');
          seam.node.style.setProperty('transform', transform, 'important');
        } else {
          const width = Math.round(columnRect.width) + 'px';
          seam.node.style.setProperty('width', width, 'important');
          seam.node.style.setProperty('max-width', 'none', 'important');
          seam.node.style.setProperty('flex-grow', '0', 'important');
          seam.node.style.setProperty('flex-shrink', '0', 'important');
          seam.node.style.setProperty('flex-basis', width, 'important');
        }
      }
    };

    const applyWidth = (column, value, persist) => {
      const bounds = range(column);
      const width = Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
      column.style.setProperty('flex', '0 0 ' + width + 'px', 'important');
      column.style.setProperty('flex-basis', width + 'px', 'important');
      column.style.setProperty('max-width', 'none', 'important');
      column.style.setProperty('min-width', bounds.min + 'px', 'important');
      column.style.setProperty('width', width + 'px', 'important');
      column.style.setProperty('border-right', '0px solid transparent', 'important');
      column.style.setProperty('border-left', '0px solid transparent', 'important');
      column.style.setProperty('box-shadow', 'none', 'important');
      column.classList.add('df-whatsapp-divider-cleanup');
      const pane = document.querySelector<HTMLElement>('#pane-side');
      const side = pane?.parentElement;
      for (const node of [pane, side]) {
        if (!(node instanceof HTMLElement)) continue;
        node.classList.add('df-whatsapp-divider-cleanup');
        node.style.setProperty('border-left', '0px solid transparent', 'important');
        node.style.setProperty('border-right', '0px solid transparent', 'important');
        node.style.setProperty('box-shadow', 'none', 'important');
      }
      const conversation = column.nextElementSibling;
      if (conversation instanceof HTMLElement) {
        conversation.classList.add('df-whatsapp-divider-cleanup');
        conversation.style.setProperty('border-left', '0px solid transparent', 'important');
        conversation.style.setProperty('border-right', '0px solid transparent', 'important');
        conversation.style.setProperty('box-shadow', 'none', 'important');
      }
      state.storedWidth = width;
      syncDefaultWidthSeam(column);
      if (persist) {
        try { localStorage.setItem(storageKey, String(width)); } catch {}
      }
      updateHandle();
      return width;
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
      let style = document.getElementById('df-whatsapp-contact-resizer-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'df-whatsapp-contact-resizer-style';
        style.textContent = '#df-whatsapp-contact-resizer{position:fixed;z-index:2147483000;width:10px;cursor:col-resize;touch-action:none;user-select:none;display:none;background:transparent!important;border:0!important;box-shadow:none!important;outline:none!important}body.df-whatsapp-contact-resizing,body.df-whatsapp-contact-resizing *{cursor:col-resize!important;user-select:none!important}';
        (document.head || document.documentElement).appendChild(style);
      }
      const handle = document.createElement('div');
      handle.id = 'df-whatsapp-contact-resizer';
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
        document.body?.classList.add('df-whatsapp-contact-resizing');
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
        document.body?.classList.remove('df-whatsapp-contact-resizing');
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
      const found = findColumn();
      if (!found) {
        if (state.handle) state.handle.style.display = 'none';
        return false;
      }
      const columnChanged = state.column !== found.column;
      state.column = found.column;
      if (columnChanged) {
        state.defaultColumnWidth = found.column.getBoundingClientRect().width;
        state.defaultSeamNodes = null;
      }
      found.pane.classList.add('df-whatsapp-divider-cleanup');
      found.side.classList.add('df-whatsapp-divider-cleanup');
      found.column.classList.add('df-whatsapp-divider-cleanup');
      const conversation = found.column.nextElementSibling;
      if (conversation instanceof HTMLElement) conversation.classList.add('df-whatsapp-divider-cleanup');
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
      const found = findColumn();
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

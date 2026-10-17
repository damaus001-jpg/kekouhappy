// This function is injected into Signal and must not capture module variables.
export function installSignalEmojiPickerRecoveryFromDom() {
  const host = window as typeof window & {
    __dfSignalEmojiPickerRecovery?: { version: string; dispose: () => void };
  };
  const version = '2026-10-15-signal-emoji-picker-v1';
  if (host.__dfSignalEmojiPickerRecovery?.version === version) return true;
  host.__dfSignalEmojiPickerRecovery?.dispose();
  const pending = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const visible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return element.isConnected && rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' && style.visibility !== 'hidden';
  };
  const conversation = () => document.querySelector('.CompositionArea')
    ?.getAttribute('data-df-signal-conversation-id') || '';
  const openPicker = () => {
    for (const overlay of document.querySelectorAll<HTMLElement>('.FunPopover[data-fun-overlay]')) {
      if (!visible(overlay)) continue;
      for (const trigger of document.querySelectorAll<HTMLButtonElement>(
        '.CompositionArea button[aria-expanded="true"][aria-haspopup="dialog"]'
      )) {
        const controlled = (trigger.getAttribute('aria-controls') || '').split(/\s+/)
          .filter(Boolean).map(id => document.getElementById(id));
        if (controlled.some(element => element && (element === overlay || overlay.contains(element)))) {
          return { overlay, trigger };
        }
      }
    }
    return null;
  };
  const scheduleClose = (picker: NonNullable<ReturnType<typeof openPicker>>) => {
    if (pending.has(picker.overlay)) return;
    const originalConversation = conversation();
    const timer = setTimeout(() => {
      pending.delete(picker.overlay);
      // Let Signal's ordinary dismissal run first. Never toggle an already closed
      // picker back open, or act on a newly selected conversation's controls.
      if (conversation() !== originalConversation || !visible(picker.overlay)) return;
      if (!picker.trigger.isConnected || picker.trigger.disabled ||
          picker.trigger.getAttribute('aria-expanded') !== 'true') return;
      // Invoke the native trigger so React, focus scopes and overlay cleanup all
      // receive the close. Removing/hiding its DOM would leave a stuck modal.
      picker.trigger.click();
    }, 0);
    pending.set(picker.overlay, timer);
  };
  const eventElement = (event: Event) => event.target instanceof Element
    ? event.target : event.target instanceof Node ? event.target.parentElement : null;
  const onOutside = (event: Event) => {
    const target = eventElement(event);
    if (!target) return;
    const picker = openPicker();
    if (!picker || picker.trigger.contains(target)) return;
    if (target.closest('[data-fun-overlay], .FunTooltip, [role="tooltip"]')) return;
    scheduleClose(picker);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) return;
    const target = eventElement(event);
    if (!target) return;
    const picker = openPicker();
    if (!picker) return;
    if (event.key === 'Escape') {
      scheduleClose(picker);
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    // Search and grid Enter belong to the picker. Only an Enter in the actual
    // composer dismisses it; that original Enter still runs through send guards.
    if (target.closest('[data-fun-overlay], [role="dialog"], .df-composer-review')) return;
    if (target.closest('.CompositionArea .module-composition-input__input, .CompositionArea [contenteditable="true"]')) {
      scheduleClose(picker);
    }
  };
  window.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('click', onOutside, true);
  window.addEventListener('keydown', onKeyDown, true);
  host.__dfSignalEmojiPickerRecovery = {
    version,
    dispose: () => {
      window.removeEventListener('pointerdown', onOutside, true);
      window.removeEventListener('click', onOutside, true);
      window.removeEventListener('keydown', onKeyDown, true);
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    }
  };
  return true;
}

export function buildSignalEmojiPickerScript() {
  return `(${installSignalEmojiPickerRecoveryFromDom.toString()})()`;
}

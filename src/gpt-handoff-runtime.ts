export function buildSignalGptButtonScript() {
  return `(() => {
    const selector = '.module-message__maoyi-smart-reply';
    const apply = () => {
      for (const button of document.querySelectorAll(selector)) {
        const label = button.disabled ? '复制中…' : '去GPT';
        const title = button.disabled ? label : '复制当天最新 18 条以内聊天记录，打开GPT后粘贴';
        if (button.textContent !== label) button.textContent = label;
        if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
        if (button.title !== title) button.title = title;
      }
    };
    if (!window.__dfGptButtonObserver) {
      window.__dfGptButtonObserver = new MutationObserver(records => {
        if (records.some(record =>
          record.target.parentElement?.closest(selector) || record.target.closest?.(selector) ||
          Array.from(record.addedNodes).some(node => node.matches?.(selector) || node.querySelector?.(selector))
        )) apply();
      });
      window.__dfGptButtonObserver.observe(document.body, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['disabled', 'aria-label', 'title']
      });
    }
    apply();
    return true;
  })()`;
}

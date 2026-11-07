export type InputTrigger = 'enter' | 'space' | 'both';
export type InputPlatform = 'whatsapp' | 'telegram' | 'signal';
export type InputSettings = Record<InputPlatform, InputTrigger>;

export function normalizeInputSettings(value: unknown): InputSettings {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const mode = (key: InputPlatform): InputTrigger => record[key] === 'enter' || record[key] === 'space' ? record[key] : 'both';
  return { whatsapp: mode('whatsapp'), telegram: mode('telegram'), signal: mode('signal') };
}

export function buildInputSettingsScript(mode: InputTrigger) {
  return `(() => {
    let previous = document.documentElement.dataset.dfInputTrigger;
    try { previous ||= localStorage.getItem('df-input-trigger-v1'); } catch {}
    document.documentElement.dataset.dfInputTrigger = ${JSON.stringify(mode)};
    try { localStorage.setItem('df-input-trigger-v1', ${JSON.stringify(mode)}); } catch {}
    if (previous !== ${JSON.stringify(mode)}) window.dispatchEvent(new Event('df-input-settings-changed'));
    return true;
  })()`;
}

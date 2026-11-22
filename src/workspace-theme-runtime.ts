import type { AppTheme } from '../electron/shared';

export function buildWorkspaceThemeScript(theme: AppTheme) {
  return `(() => {
    if (location.origin !== 'http://127.0.0.1:8070' || window.top !== window) return false;
    const bridge = window.pikachuWorkspaceTheme;
    if (!bridge || typeof bridge.apply !== 'function') return false;
    try { return bridge.apply(${JSON.stringify({ version: 1, theme })}) === true; }
    catch { return false; }
  })()`;
}

// Use the page bridge directly: theme sync must not install translation runtimes
// or depend on the active account, phone connection, or conversation.
export async function syncWorkspaceThemes(
  profiles: ReadonlyArray<{ id: string; platform: string }>,
  theme: AppTheme,
  resolvePage: (profileId: string) => { executeJavaScript: (script: string) => Promise<unknown> } | null
) {
  const script = buildWorkspaceThemeScript(theme);
  return Promise.allSettled(profiles.filter(profile => profile.platform === 'apple').map(async profile => {
    const page = resolvePage(profile.id);
    return page ? page.executeJavaScript(script) : false;
  }));
}

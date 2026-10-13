import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const appSource = await readFile(path.join(projectRoot, 'src', 'App.vue'), 'utf8');
const styleSource = await readFile(path.join(projectRoot, 'src', 'styles.css'), 'utf8');
const sharedSource = await readFile(path.join(projectRoot, 'electron', 'shared.ts'), 'utf8');
const mainSource = await readFile(path.join(projectRoot, 'electron', 'main.ts'), 'utf8');
const preloadSource = await readFile(path.join(projectRoot, 'electron', 'preload.ts'), 'utf8');
const preloadRuntimeSource = await readFile(path.join(projectRoot, 'electron', 'preload.cjs'), 'utf8');

const dialogTextBeforeBreak = '如果你在whatsapp、telegram、signal的设置里开启了夜间主题（深色），请在下方按钮点击打开护眼模式，译文将切换为对应的颜色。如果你切换回';
const dialogTextAfterBreak = '了日间主题（浅色），请在下方按钮点击关闭护眼模式。';
assert.ok(
  appSource.includes(`${dialogTextBeforeBreak}<br>${dialogTextAfterBreak}`),
  'eye-care dialog text and the confirmed fixed line break must match'
);

const openButtonIndex = appSource.indexOf('>打开护眼模式</button>');
const closeButtonIndex = appSource.indexOf('>关闭护眼模式</button>');
assert.ok(openButtonIndex >= 0, 'open eye-care mode button is missing');
assert.ok(closeButtonIndex > openButtonIndex, 'buttons must be ordered as open mode, then close mode');
assert.ok(
  appSource.includes('class="eye-care-translation-close"') &&
    appSource.includes('aria-label="关闭译文护眼模式弹窗"') &&
    appSource.includes('@click="closeEyeCareTranslationDialog"'),
  'the dialog must provide a top-right close button that does not change mode'
);

assert.ok(
  sharedSource.includes('eyeCareTranslationEnabled: boolean;'),
  'eye-care mode must be part of the typed application configuration'
);
assert.ok(
  mainSource.includes('eyeCareTranslationEnabled: false,'),
  'eye-care mode must default to off for existing and new installations'
);
assert.ok(
  mainSource.includes('eyeCareTranslationEnabled: config.eyeCareTranslationEnabled === true,'),
  'stored eye-care mode must be sanitized before reaching the renderer'
);
assert.ok(
  appSource.includes('eyeCareTranslationEnabled: eyeCareTranslationEnabled.value'),
  'eye-care mode changes must be saved through the main application configuration'
);
assert.ok(
  !appSource.includes('localStorage?.setItem?.(eyeCareTranslationStorageKey'),
  'renderer localStorage must not be used to persist eye-care mode'
);

assert.ok(
  appSource.includes("const selector = '.df-chat-translation, .module-message__maoyi-translation';"),
  'eye-care runtime must cover web bubble translations and native Signal translations'
);
assert.ok(
  appSource.includes("const eyeCareTranslationColor = '#d5b94f';"),
  'eye-care translation color must use the confirmed soft yellow'
);
assert.ok(
  appSource.includes("const telegramEyeCareTranslationColor = '#c8ccc7';") &&
    appSource.includes("appForPlatform(profile.platform) === 'telegram'") &&
    appSource.includes('telegramEyeCareTranslationColor'),
  'Telegram must use its own darker yellow translation color over green bubbles'
);
assert.ok(
  appSource.includes("node.style.setProperty('color', '${translationColor}', 'important');"),
  'eye-care mode must force the platform-specific color on each translation node'
);
assert.ok(
  appSource.includes('.dark-theme .df-composer-review[data-df-composer-review="source-native"]') &&
    appSource.includes('background: #1d211c !important;') &&
    appSource.includes('background: #151815 !important;') &&
    appSource.includes('color: #d8cf9a !important;'),
  'Signal composer review must use a low-brightness dark palette while eye-care mode is active'
);
assert.ok(
  appSource.includes('return JSON.stringify({ ok: true, enabled: false') &&
    appSource.includes('const rawResult = await executeProfileScript<string>'),
  'page execution must return a clone-safe JSON string across Electron process boundaries'
);
assert.ok(
  appSource.includes('window.chatTranslator.setEyeCareTranslationEnabled(enabled)') &&
    sharedSource.includes('setEyeCareTranslationEnabled: (enabled: boolean) => Promise<AppConfig>;') &&
    preloadSource.includes("ipcRenderer.invoke('config:set-eye-care-translation', enabled)") &&
    preloadRuntimeSource.includes("ipcRenderer.invoke('config:set-eye-care-translation', enabled)") &&
    mainSource.includes("trustedHandle('config:set-eye-care-translation'"),
  'eye-care persistence must cross IPC as a single clone-safe boolean'
);
assert.ok(
  appSource.includes("knownMessage.startsWith('当前聊天页面暂未接受护眼模式')") &&
    appSource.includes("'护眼模式切换失败，请稍后重试'"),
  'technical Electron errors must be replaced with a clear customer-facing message'
);
assert.ok(
  !appSource.includes("eyeCareTranslationMessage.value = error instanceof Error ? error.message"),
  'raw technical error messages must never be rendered by the eye-care dialog'
);
assert.ok(
  appSource.includes('const observer = new MutationObserver'),
  'new and restyled translation nodes must remain covered while eye-care mode is active'
);
assert.ok(
  appSource.includes('for (const node of previousNodes) restoreNode(node);'),
  'closing eye-care mode must restore the original inline colors'
);

const domReadyStart = appSource.indexOf('function handleWebviewDomReady');
const signalRuntimeStart = appSource.indexOf('function startSignalTranslationRuntime');
assert.ok(
  appSource.slice(domReadyStart, domReadyStart + 1200).includes('applyEyeCareTranslationToProfile(profile.id)'),
  'web profiles must reapply the persisted mode when their page becomes ready'
);
assert.ok(
  appSource.slice(signalRuntimeStart, signalRuntimeStart + 900).includes('applyEyeCareTranslationToProfile(profileId)'),
  'Signal profiles must apply the persisted mode when their native runtime starts'
);

assert.ok(
  styleSource.includes('.runtime-header nav .eye-care-translation-button'),
  'the leaf control must be styled in the workspace header'
);
assert.ok(
  styleSource.includes('.eye-care-translation-actions button:first-child'),
  'the open action must have an explicit primary visual treatment'
);
assert.ok(
  styleSource.includes('width: min(590px, calc(100vw - 40px));'),
  'the eye-care dialog must use the confirmed 590px desktop width'
);

console.log('eye-care translation mode contract passed');

import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppConfig,
  ChatProfile,
  ClientAuthorizationResult,
  ClientAuthorizationStatus,
  ElectronApi,
  Platform,
  SendAuthorizationRequest,
  SignalNotificationActivation,
  SignalSentIntegrityRequest,
  SensitiveSendAuthorizeRequest,
  SensitiveSendPrepareRequest,
  SignalWorkspaceBounds,
  SmartReplyRequest,
  TranslateRequest,
  TranslationCustomizationStatus,
  TranslationCacheLoadRequest,
  TranslationCacheLookupRequest,
  TranslationCacheSetRequest,
  NonEnglishContactRequest,
  RemoteGuardStatus,
  WindowControlApi
} from './shared.js';

const initialThemeArgument = process.argv.find((argument) => argument.startsWith('--maoyi-ui-theme='));
const initialThemeCandidate = initialThemeArgument?.slice('--maoyi-ui-theme='.length);
const initialTheme = (
  initialThemeCandidate === 'pink' ||
  initialThemeCandidate === 'blackGold' ||
  initialThemeCandidate === 'murongPurple' ||
  initialThemeCandidate === 'clearWaterBlue'
) ? initialThemeCandidate : 'blackGold';

const api: ElectronApi = {
  getAssistantLibrary: () => ipcRenderer.invoke('assistant:get'),
  exportConversation: (request) => ipcRenderer.invoke('conversation:export',request),
  stageAssistantMaterial: (value) => ipcRenderer.invoke('assistant:stage', value),
  getPendingAssistantMaterial: () => ipcRenderer.invoke('assistant:pending'),
  getAssistantImage: (id) => ipcRenderer.invoke('assistant:image',id),
  getAssistantUsage: (id) => ipcRenderer.invoke('assistant:usage', id),
  recordAssistantUse: (value) => ipcRenderer.invoke('assistant:use', value),
  saveAssistantModule: (kind, value) => ipcRenderer.invoke('assistant:save', kind, value),
  importAssistantModule: (kind, merge) => ipcRenderer.invoke('assistant:import', kind, merge),
  attachAssistantMedia: (kind, entryId) => ipcRenderer.invoke('assistant:attach', kind, entryId),
  revealAssistantMedia: (id) => ipcRenderer.invoke('assistant:reveal', id),
  exportAssistantTemplate: (kind) => ipcRenderer.invoke('assistant:template', kind),
  exportAssistantModule: (kind) => ipcRenderer.invoke('assistant:export', kind),
  getDiagnosticsStatus: () => ipcRenderer.invoke('diagnostics:status'),
  configureDiagnostics: (value) => ipcRenderer.invoke('diagnostics:configure', value),
  recordDiagnosticEvent: (event) => ipcRenderer.invoke('diagnostics:event', event),
  markDiagnosticProblem: () => ipcRenderer.invoke('diagnostics:mark'),
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),
  probeDiagnostics: () => ipcRenderer.invoke('diagnostics:probe'),
  getInitialTheme: () => initialTheme,
  getClientAuthorizationStatus: (): Promise<ClientAuthorizationStatus> => ipcRenderer.invoke('client-license:status'),
  setClientUsername: (username: string): Promise<ClientAuthorizationResult> => ipcRenderer.invoke('client-license:set-username', username),
  activateClientLicense: (licenseCode: string): Promise<ClientAuthorizationResult> => ipcRenderer.invoke('client-license:activate', licenseCode),
  replaceClientLicense: (licenseCode: string): Promise<ClientAuthorizationResult> => ipcRenderer.invoke('client-license:replace', licenseCode),
  copyClientMachineInfo: (): Promise<ClientAuthorizationResult> => ipcRenderer.invoke('client-license:copy-machine-info'),
  getStorageLocation: () => ipcRenderer.invoke('storage:get-location'),
  openStorageLocation: () => ipcRenderer.invoke('storage:open-location'),
  changeStorageLocation: () => ipcRenderer.invoke('storage:change-location'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  isPackaged: () => ipcRenderer.invoke('app:is-packaged'),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke('config:save', config),
  setEyeCareTranslationEnabled: (enabled: boolean) => ipcRenderer.invoke('config:set-eye-care-translation', enabled),
  getPlatformCatalog: () => ipcRenderer.invoke('platforms:get'),
  createProfile: (platform: Platform, name: string, group: string) => ipcRenderer.invoke('profile:create', platform, name, group),
  renameProfile: (id: string, name: string, group: string) => ipcRenderer.invoke('profile:rename', id, name, group),
  removeProfile: (id: string) => ipcRenderer.invoke('profile:remove', id),
  launchSignalProfile: (id: string) => ipcRenderer.invoke('signal:launch', id),
  getSignalSourceOnlyAcceptance: () => ipcRenderer.invoke('signal:source-only-acceptance'),
  getPendingSignalNotificationActivation: () => ipcRenderer.invoke('signal:notification-pending'),
  completeSignalNotificationActivation: (profileId: string, activationId: string) =>
    ipcRenderer.invoke('signal:notification-complete', profileId, activationId),
  setSignalWorkspaceBounds: (id: string, bounds: SignalWorkspaceBounds) =>
    ipcRenderer.invoke('signal:set-workspace-bounds', id, bounds),
  presentSignalWorkspace: (id: string, bounds: SignalWorkspaceBounds) =>
    ipcRenderer.invoke('signal:present-workspace', id, bounds),
  hideSignalProfile: (id: string) => ipcRenderer.invoke('signal:hide', id),
  stopSignalProfile: (id: string) => ipcRenderer.invoke('signal:stop', id),
  executeSignalScript: (id: string, script: string) => ipcRenderer.invoke('signal:execute-script', id, script),
  transcribeLocalSpeech: (audioBase64: string) => ipcRenderer.invoke('speech:transcribe-local', { audioBase64 }),
  saveLocalSpeechAudio: (audioBase64: string) => ipcRenderer.invoke('speech:save-audio', { audioBase64 }),
  saveAndTranscribeLocalSpeech: (audioBase64: string) => ipcRenderer.invoke('speech:save-and-transcribe', { audioBase64 }),
  appendSignalDebugLog: (event: Record<string, unknown>) => ipcRenderer.invoke('signal:debug-log', event),
  translate: (request: TranslateRequest) => ipcRenderer.invoke('translate', request),
  cancelTranslation: (requestId: string) => ipcRenderer.invoke('translate:cancel', requestId),
  getTranslationCustomization: (): Promise<TranslationCustomizationStatus> =>
    ipcRenderer.invoke('translation-customization:get'),
  saveTranslationCustomization: (editableChineseToEnglish: string): Promise<TranslationCustomizationStatus> =>
    ipcRenderer.invoke('translation-customization:save', editableChineseToEnglish),
  resetTranslationCustomization: (): Promise<TranslationCustomizationStatus> =>
    ipcRenderer.invoke('translation-customization:reset'),
  copyChatToGpt: (request: SmartReplyRequest) => ipcRenderer.invoke('smart-reply:copy-to-gpt', request),
  authorizeTranslatedSend: (request: SendAuthorizationRequest) => ipcRenderer.invoke('send-integrity:authorize', request),
  verifySignalSentMessage: (request: SignalSentIntegrityRequest) => ipcRenderer.invoke('signal:verify-sent-integrity', request),
  onSensitiveSendDialog: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, value: Parameters<typeof handler>[0]) => handler(value);
    ipcRenderer.on('send-integrity:dialog', listener);
    return () => ipcRenderer.removeListener('send-integrity:dialog', listener);
  },
  onSensitiveSendDialogClosed: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, id: string) => handler(id);
    ipcRenderer.on('send-integrity:dialog-closed', listener);
    return () => ipcRenderer.removeListener('send-integrity:dialog-closed', listener);
  },
  respondSensitiveSendDialog: (id, response) => ipcRenderer.invoke('send-integrity:dialog-response', id, response),
  prepareSensitiveSend: (request: SensitiveSendPrepareRequest) => ipcRenderer.invoke('send-integrity:prepare-sensitive', request),
  authorizeSensitiveSend: (request: SensitiveSendAuthorizeRequest) => ipcRenderer.invoke('send-integrity:authorize-sensitive', request),
  loadTranslationCache: (request: TranslationCacheLoadRequest) => ipcRenderer.invoke('translation-cache:load', request),
  lookupTranslationCache: (request: TranslationCacheLookupRequest) => ipcRenderer.invoke('translation-cache:lookup', request),
  saveTranslationCacheEntry: (request: TranslationCacheSetRequest) => ipcRenderer.invoke('translation-cache:save-entry', request),
  markNonEnglishContact: (request: NonEnglishContactRequest) => ipcRenderer.invoke('translation-cache:mark-non-english-contact', request),
  getMemoryStatus: () => ipcRenderer.invoke('system:get-memory-status'),
  setTaskbarUnreadCount: (count: number) => ipcRenderer.invoke('taskbar:set-unread-count', count),
  getLockScreenStatus: () => ipcRenderer.invoke('lock-screen:status'),
  engageLockScreen: () => ipcRenderer.invoke('lock-screen:engage'),
  checkNetworkOffline: () => ipcRenderer.invoke('lock-screen:check-network-offline'),
  authorizeLockScreenPinChange: (mode) => ipcRenderer.invoke('lock-screen:authorize-pin-change', mode),
  setLockScreenPin: (pin: string, token: string) => ipcRenderer.invoke('lock-screen:set-pin', pin, token),
  unlockLockScreen: (pin: string) => ipcRenderer.invoke('lock-screen:unlock', pin),
  getRemoteGuardStatus: () => ipcRenderer.invoke('remote-guard:status'),
  scanRemoteGuardNow: () => ipcRenderer.invoke('remote-guard:scan-now'),
  acknowledgeRemoteGuardIncident: () => ipcRenderer.invoke('remote-guard:acknowledge'),
  setWindowTheme: (theme: 'blackGold' | 'pink' | 'murongPurple' | 'clearWaterBlue') =>
    ipcRenderer.invoke('window:set-theme', theme),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  writeClipboardText: (text: string) => ipcRenderer.invoke('clipboard:write-text', text),
  onSignalActivateProfile: (handler: (profileId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, profileId: string) => handler(profileId);
    ipcRenderer.on('signal:activate-profile', listener);
    return () => ipcRenderer.removeListener('signal:activate-profile', listener);
  },
  onSignalNotificationActivation: (handler: (activation: SignalNotificationActivation) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      profileId: string,
      activationId: string
    ) => handler({ profileId, activationId });
    ipcRenderer.on('signal:notification-activate', listener);
    return () => ipcRenderer.removeListener('signal:notification-activate', listener);
  },
  onSignalRestoreProfile: (handler: (profileId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, profileId: string) => handler(profileId);
    ipcRenderer.on('signal:restore-profile', listener);
    return () => ipcRenderer.removeListener('signal:restore-profile', listener);
  },
  onSignalWorkspaceSync: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on('signal:sync-workspace', listener);
    return () => ipcRenderer.removeListener('signal:sync-workspace', listener);
  },
  onRemoteGuardStatus: (handler: (status: RemoteGuardStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: RemoteGuardStatus) => handler(status);
    ipcRenderer.on('remote-guard:status-changed', listener);
    return () => ipcRenderer.removeListener('remote-guard:status-changed', listener);
  }
};

contextBridge.exposeInMainWorld('chatTranslator', api);

const windowControl: WindowControlApi = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close')
};

contextBridge.exposeInMainWorld('windowControl', windowControl);

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLElement>('[data-window-control]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLElement>('[data-window-control]');
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      const action = button.dataset.windowControl;
      if (action === 'minimize' || action === 'toggle-maximize' || action === 'close') {
        ipcRenderer.send('window-control', action);
      }
    },
    true
  );
});

contextBridge.exposeInMainWorld('profileFingerprint', {
  apply(profile: ChatProfile) {
    const fp = profile.fingerprint;
    if (fp.languageSource === 'custom' && fp.languages.length > 0) {
      Object.defineProperty(navigator, 'languages', { get: () => fp.languages });
      Object.defineProperty(navigator, 'language', { get: () => fp.languages[0] });
    }

    if (fp.hardwareSource === 'custom') {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory });
    }

    if (fp.timezoneSource === 'custom' && fp.timezone) {
      const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
      Intl.DateTimeFormat.prototype.resolvedOptions = function resolvedOptions() {
        return { ...originalResolvedOptions.call(this), timeZone: fp.timezone };
      };
    }

    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function getParameter(parameter: number) {
      if (parameter === 37445) return fp.webglVendor;
      if (parameter === 37446) return fp.webglRenderer;
      return originalGetParameter.call(this, parameter);
    };

    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function toDataURL(...args: Parameters<HTMLCanvasElement['toDataURL']>) {
      const context = this.getContext('2d');
      if (context) {
        const x = fp.canvasSeed % Math.max(1, this.width || 1);
        const y = fp.canvasSeed % Math.max(1, this.height || 1);
        context.fillStyle = `rgba(${fp.canvasSeed % 255}, 1, 1, 0.01)`;
        context.fillRect(x, y, 1, 1);
      }
      return originalToDataURL.apply(this, args);
    };
  }
});

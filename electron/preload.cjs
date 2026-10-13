const { contextBridge, ipcRenderer } = require('electron');

const initialThemeArgument = process.argv.find((argument) => argument.startsWith('--maoyi-ui-theme='));
const initialThemeCandidate = initialThemeArgument?.slice('--maoyi-ui-theme='.length);
const initialTheme = (
  initialThemeCandidate === 'pink' ||
  initialThemeCandidate === 'blackGold' ||
  initialThemeCandidate === 'murongPurple' ||
  initialThemeCandidate === 'clearWaterBlue'
) ? initialThemeCandidate : 'blackGold';

const api = {
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
  getClientAuthorizationStatus: () => ipcRenderer.invoke('client-license:status'),
  setClientUsername: (username) => ipcRenderer.invoke('client-license:set-username', username),
  activateClientLicense: (licenseCode) => ipcRenderer.invoke('client-license:activate', licenseCode),
  replaceClientLicense: (licenseCode) => ipcRenderer.invoke('client-license:replace', licenseCode),
  copyClientMachineInfo: () => ipcRenderer.invoke('client-license:copy-machine-info'),
  getStorageLocation: () => ipcRenderer.invoke('storage:get-location'),
  openStorageLocation: () => ipcRenderer.invoke('storage:open-location'),
  changeStorageLocation: () => ipcRenderer.invoke('storage:change-location'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  isPackaged: () => ipcRenderer.invoke('app:is-packaged'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  setEyeCareTranslationEnabled: (enabled) => ipcRenderer.invoke('config:set-eye-care-translation', enabled),
  getPlatformCatalog: () => ipcRenderer.invoke('platforms:get'),
  createProfile: (platform, name, group) => ipcRenderer.invoke('profile:create', platform, name, group),
  renameProfile: (id, name, group) => ipcRenderer.invoke('profile:rename', id, name, group),
  removeProfile: (id) => ipcRenderer.invoke('profile:remove', id),
  launchSignalProfile: (id) => ipcRenderer.invoke('signal:launch', id),
  getSignalSourceOnlyAcceptance: () => ipcRenderer.invoke('signal:source-only-acceptance'),
  getPendingSignalNotificationActivation: () => ipcRenderer.invoke('signal:notification-pending'),
  completeSignalNotificationActivation: (profileId, activationId) =>
    ipcRenderer.invoke('signal:notification-complete', profileId, activationId),
  setSignalWorkspaceBounds: (id, bounds) => ipcRenderer.invoke('signal:set-workspace-bounds', id, bounds),
  presentSignalWorkspace: (id, bounds) => ipcRenderer.invoke('signal:present-workspace', id, bounds),
  hideSignalProfile: (id) => ipcRenderer.invoke('signal:hide', id),
  stopSignalProfile: (id) => ipcRenderer.invoke('signal:stop', id),
  executeSignalScript: (id, script) => ipcRenderer.invoke('signal:execute-script', id, script),
  appendSignalDebugLog: (event) => ipcRenderer.invoke('signal:debug-log', event),
  translate: (request) => ipcRenderer.invoke('translate', request),
  cancelTranslation: (requestId) => ipcRenderer.invoke('translate:cancel', requestId),
  getTranslationCustomization: () => ipcRenderer.invoke('translation-customization:get'),
  saveTranslationCustomization: (editableChineseToEnglish) =>
    ipcRenderer.invoke('translation-customization:save', editableChineseToEnglish),
  resetTranslationCustomization: () => ipcRenderer.invoke('translation-customization:reset'),
  generateSmartReplies: (request) => ipcRenderer.invoke('smart-reply:generate', request),
  authorizeTranslatedSend: (request) => ipcRenderer.invoke('send-integrity:authorize', request),
  verifySignalSentMessage: (request) => ipcRenderer.invoke('signal:verify-sent-integrity', request),
  onSensitiveSendDialog: (handler) => {
    const listener = (_event, value) => handler(value);
    ipcRenderer.on('send-integrity:dialog', listener);
    return () => ipcRenderer.removeListener('send-integrity:dialog', listener);
  },
  onSensitiveSendDialogClosed: (handler) => {
    const listener = (_event, id) => handler(id);
    ipcRenderer.on('send-integrity:dialog-closed', listener);
    return () => ipcRenderer.removeListener('send-integrity:dialog-closed', listener);
  },
  respondSensitiveSendDialog: (id, response) => ipcRenderer.invoke('send-integrity:dialog-response', id, response),
  prepareSensitiveSend: (request) => ipcRenderer.invoke('send-integrity:prepare-sensitive', request),
  authorizeSensitiveSend: (request) => ipcRenderer.invoke('send-integrity:authorize-sensitive', request),
  loadTranslationCache: (request) => ipcRenderer.invoke('translation-cache:load', request),
  lookupTranslationCache: (request) => ipcRenderer.invoke('translation-cache:lookup', request),
  saveTranslationCacheEntry: (request) => ipcRenderer.invoke('translation-cache:save-entry', request),
  markNonEnglishContact: (request) => ipcRenderer.invoke('translation-cache:mark-non-english-contact', request),
  getMemoryStatus: () => ipcRenderer.invoke('system:get-memory-status'),
  setTaskbarUnreadCount: (count) => ipcRenderer.invoke('taskbar:set-unread-count', count),
  getLockScreenStatus: () => ipcRenderer.invoke('lock-screen:status'),
  engageLockScreen: () => ipcRenderer.invoke('lock-screen:engage'),
  checkNetworkOffline: () => ipcRenderer.invoke('lock-screen:check-network-offline'),
  authorizeLockScreenPinChange: (mode) => ipcRenderer.invoke('lock-screen:authorize-pin-change', mode),
  setLockScreenPin: (pin, token) => ipcRenderer.invoke('lock-screen:set-pin', pin, token),
  unlockLockScreen: (pin) => ipcRenderer.invoke('lock-screen:unlock', pin),
  getRemoteGuardStatus: () => ipcRenderer.invoke('remote-guard:status'),
  scanRemoteGuardNow: () => ipcRenderer.invoke('remote-guard:scan-now'),
  acknowledgeRemoteGuardIncident: () => ipcRenderer.invoke('remote-guard:acknowledge'),
  setWindowTheme: (theme) => ipcRenderer.invoke('window:set-theme', theme),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
  onSignalActivateProfile: (handler) => {
    const listener = (_event, profileId) => handler(profileId);
    ipcRenderer.on('signal:activate-profile', listener);
    return () => ipcRenderer.removeListener('signal:activate-profile', listener);
  },
  onSignalNotificationActivation: (handler) => {
    const listener = (_event, profileId, activationId) => handler({ profileId, activationId });
    ipcRenderer.on('signal:notification-activate', listener);
    return () => ipcRenderer.removeListener('signal:notification-activate', listener);
  },
  onSignalRestoreProfile: (handler) => {
    const listener = (_event, profileId) => handler(profileId);
    ipcRenderer.on('signal:restore-profile', listener);
    return () => ipcRenderer.removeListener('signal:restore-profile', listener);
  },
  onSignalWorkspaceSync: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('signal:sync-workspace', listener);
    return () => ipcRenderer.removeListener('signal:sync-workspace', listener);
  },
  onRemoteGuardStatus: (handler) => {
    const listener = (_event, status) => handler(status);
    ipcRenderer.on('remote-guard:status-changed', listener);
    return () => ipcRenderer.removeListener('remote-guard:status-changed', listener);
  }
};

contextBridge.exposeInMainWorld('chatTranslator', api);

const windowControl = {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close')
};

contextBridge.exposeInMainWorld('windowControl', windowControl);

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target;
      const button = target?.closest?.('[data-window-control]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      const button = target?.closest?.('[data-window-control]');
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
